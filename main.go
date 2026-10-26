package main

/*
#cgo pkg-config: glib-2.0 gobject-2.0 gtk+-3.0
#include <glib.h>
#include <glib-object.h>
#include <gtk/gtk.h>
#include <stdlib.h>

extern void goOnWindowClose(void* winPtr);

static gboolean on_gtk_delete_event(GtkWidget* widget, GdkEvent* event, gpointer user_data) {
    goOnWindowClose(user_data);
    return TRUE;
}

static void attach_delete_event(void* gtkWindow, void* user_data) {
    if (gtkWindow != NULL) {
        // Disconnect webview's default destroy signal handler that calls gtk_main_quit()
        g_signal_handlers_disconnect_by_func(G_OBJECT(gtkWindow), (gpointer)gtk_main_quit, NULL);
        g_signal_connect(G_OBJECT(gtkWindow), "delete-event", G_CALLBACK(on_gtk_delete_event), user_data);
    }
}

static void close_gtk_window(void* gtkWindow) {
    if (gtkWindow != NULL) {
        gtk_widget_destroy(GTK_WIDGET(gtkWindow));
    }
}
*/
import "C"

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/dhowden/tag"
	"github.com/fsnotify/fsnotify"
	webview "github.com/webview/webview_go"
	"gopkg.in/yaml.v3"
)

// AppConfig represents the entire application configuration map
type AppConfig map[string]interface{}

type FileItem struct {
	Name  string `json:"name"`
	IsDir bool   `json:"isDir"`
}

type TrackInfo struct {
	Src          string `json:"src"`
	Title        string `json:"title"`
	Artist       string `json:"artist"`
	Album        string `json:"album"`
	OriginalName string `json:"originalName"`
	OriginalPath string `json:"originalPath"`
}

var currentBrowserPath string
var selectedMusicDir string
var localServerPort string

type WindowManager struct {
	mu      sync.Mutex
	windows map[webview.WebView]bool
	ptrMap  map[unsafe.Pointer]webview.WebView
}

var winMgr = &WindowManager{
	windows: make(map[webview.WebView]bool),
	ptrMap:  make(map[unsafe.Pointer]webview.WebView),
}

func (wm *WindowManager) Add(w webview.WebView) {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	wm.windows[w] = true
	if ptr := w.Window(); ptr != nil {
		wm.ptrMap[ptr] = w
	}
}

func (wm *WindowManager) Remove(w webview.WebView) int {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	delete(wm.windows, w)
	if ptr := w.Window(); ptr != nil {
		delete(wm.ptrMap, ptr)
	}
	return len(wm.windows)
}

func (wm *WindowManager) Count() int {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	return len(wm.windows)
}

func (wm *WindowManager) GetByPtr(ptr unsafe.Pointer) webview.WebView {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	return wm.ptrMap[ptr]
}

func (wm *WindowManager) BroadcastJS(js string) {
	wm.mu.Lock()
	wins := make([]webview.WebView, 0, len(wm.windows))
	for w := range wm.windows {
		wins = append(wins, w)
	}
	wm.mu.Unlock()

	for _, w := range wins {
		w.Dispatch(func() {
			w.Eval(js)
		})
	}
}

//export goOnWindowClose
func goOnWindowClose(wPtr unsafe.Pointer) {
	w := winMgr.GetByPtr(wPtr)
	if w != nil {
		w.Dispatch(func() {
			closeWindow(w)
		})
	}
}

func closeWindow(w webview.WebView) {
	ptr := w.Window()
	remaining := winMgr.Remove(w)
	if ptr != nil {
		C.close_gtk_window(ptr)
	} else {
		w.Destroy()
	}
	if remaining == 0 {
		os.Exit(0)
	}
}

var execDir string
var configPath string
var serverStartTime time.Time

type PlaylistInfo struct {
	Name       string `json:"name"`
	TrackCount int    `json:"trackCount"`
}

func sanitizePlaylistName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	var sb strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

func ensurePlaylistDir() string {
	playlistsDir := filepath.Join(execDir, "playlists")
	_ = os.MkdirAll(playlistsDir, 0755)
	favPath := filepath.Join(playlistsDir, "favorites.txt")
	if _, err := os.Stat(favPath); os.IsNotExist(err) {
		_ = os.WriteFile(favPath, []byte(""), 0644)
	}
	recPath := filepath.Join(playlistsDir, "recents.txt")
	if _, err := os.Stat(recPath); os.IsNotExist(err) {
		_ = os.WriteFile(recPath, []byte(""), 0644)
	}
	return playlistsDir
}

func goListPlaylists() []PlaylistInfo {
	playlistsDir := ensurePlaylistDir()
	entries, err := os.ReadDir(playlistsDir)

	favTracks := goGetPlaylistTracks("favorites")
	recTracks := goGetPlaylistTracks("recents")

	favInfo := PlaylistInfo{Name: "favorites", TrackCount: len(favTracks)}
	recInfo := PlaylistInfo{Name: "recents", TrackCount: len(recTracks)}

	if err != nil {
		return []PlaylistInfo{favInfo, recInfo}
	}

	var customList []PlaylistInfo

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".txt") {
			continue
		}
		name := strings.TrimSuffix(entry.Name(), ".txt")
		sName := sanitizePlaylistName(name)
		if sName == "" || sName == "favorites" || sName == "recents" {
			continue
		}
		tracks := goGetPlaylistTracks(sName)
		customList = append(customList, PlaylistInfo{
			Name:       sName,
			TrackCount: len(tracks),
		})
	}

	return append([]PlaylistInfo{favInfo, recInfo}, customList...)
}

func goGetPlaylistTracks(playlistName string) []TrackInfo {
	sName := sanitizePlaylistName(playlistName)
	if sName == "" {
		return []TrackInfo{}
	}
	playlistsDir := ensurePlaylistDir()
	filePath := filepath.Join(playlistsDir, sName+".txt")

	data, err := os.ReadFile(filePath)
	if err != nil {
		return []TrackInfo{}
	}

	lines := strings.Split(string(data), "\n")
	var tracks []TrackInfo

	musicDir := selectedMusicDir
	if musicDir == "" {
		config := loadConfig()
		if nd, ok := config["nativeDir"].(string); ok {
			musicDir = nd
		}
	}

	if musicDir == "" {
		return []TrackInfo{}
	}

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fullPath := filepath.Join(musicDir, filepath.FromSlash(line))
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			tracks = append(tracks, parseTrackInfo(fullPath))
		}
	}

	return tracks
}

func goAddTrackToPlaylist(playlistName, trackPath string) bool {
	sName := sanitizePlaylistName(playlistName)
	if sName == "" || trackPath == "" {
		return false
	}

	musicDir := selectedMusicDir
	if musicDir == "" {
		config := loadConfig()
		if nd, ok := config["nativeDir"].(string); ok {
			musicDir = nd
		}
	}
	if musicDir == "" {
		return false
	}

	cleanTrack := filepath.Clean(trackPath)
	cleanMusic := filepath.Clean(musicDir)

	relPath, err := filepath.Rel(cleanMusic, cleanTrack)
	if err != nil || strings.HasPrefix(relPath, "..") || relPath == "." {
		return false
	}

	relSlash := filepath.ToSlash(relPath)
	playlistsDir := ensurePlaylistDir()
	filePath := filepath.Join(playlistsDir, sName+".txt")

	data, _ := os.ReadFile(filePath)
	lines := strings.Split(string(data), "\n")

	for _, line := range lines {
		if strings.TrimSpace(line) == relSlash {
			return true
		}
	}

	content := string(data)
	if len(content) > 0 && !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	content += relSlash + "\n"

	err = os.WriteFile(filePath, []byte(content), 0644)
	return err == nil
}

func goRemoveTrackFromPlaylist(playlistName, trackPath string) bool {
	sName := sanitizePlaylistName(playlistName)
	if sName == "" || sName == "recents" || trackPath == "" {
		return false
	}

	musicDir := selectedMusicDir
	if musicDir == "" {
		config := loadConfig()
		if nd, ok := config["nativeDir"].(string); ok {
			musicDir = nd
		}
	}

	playlistsDir := ensurePlaylistDir()
	filePath := filepath.Join(playlistsDir, sName+".txt")

	data, err := os.ReadFile(filePath)
	if err != nil {
		return false
	}

	var relSlash string
	if musicDir != "" {
		if relPath, err := filepath.Rel(filepath.Clean(musicDir), filepath.Clean(trackPath)); err == nil {
			relSlash = filepath.ToSlash(relPath)
		}
	}

	lines := strings.Split(string(data), "\n")
	var newLines []string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if relSlash != "" && trimmed == relSlash {
			continue
		}
		if musicDir != "" && filepath.Join(musicDir, filepath.FromSlash(trimmed)) == filepath.Clean(trackPath) {
			continue
		}
		newLines = append(newLines, trimmed)
	}

	output := ""
	if len(newLines) > 0 {
		output = strings.Join(newLines, "\n") + "\n"
	}

	err = os.WriteFile(filePath, []byte(output), 0644)
	return err == nil
}

func goIsFavorite(trackPath string) bool {
	tracks := goGetPlaylistTracks("favorites")
	cleanTarget := filepath.Clean(trackPath)
	for _, t := range tracks {
		if filepath.Clean(t.OriginalPath) == cleanTarget {
			return true
		}
	}
	return false
}

func goCreatePlaylist(playlistName string) bool {
	sName := sanitizePlaylistName(playlistName)
	if sName == "" {
		return false
	}
	playlistsDir := ensurePlaylistDir()
	filePath := filepath.Join(playlistsDir, sName+".txt")
	if _, err := os.Stat(filePath); err == nil {
		return true
	}
	err := os.WriteFile(filePath, []byte(""), 0644)
	return err == nil
}

func goDeletePlaylist(playlistName string) bool {
	sName := sanitizePlaylistName(playlistName)
	if sName == "" || sName == "favorites" || sName == "recents" {
		return false
	}
	playlistsDir := ensurePlaylistDir()
	filePath := filepath.Join(playlistsDir, sName+".txt")
	err := os.Remove(filePath)
	return err == nil || os.IsNotExist(err)
}

func goAddToRecents(trackPath string) bool {
	if trackPath == "" {
		return false
	}

	musicDir := selectedMusicDir
	if musicDir == "" {
		config := loadConfig()
		if nd, ok := config["nativeDir"].(string); ok {
			musicDir = nd
		}
	}
	if musicDir == "" {
		return false
	}

	cleanTrack := filepath.Clean(trackPath)
	cleanMusic := filepath.Clean(musicDir)

	relPath, err := filepath.Rel(cleanMusic, cleanTrack)
	if err != nil || strings.HasPrefix(relPath, "..") || relPath == "." {
		return false
	}

	relSlash := filepath.ToSlash(relPath)
	playlistsDir := ensurePlaylistDir()
	filePath := filepath.Join(playlistsDir, "recents.txt")

	data, _ := os.ReadFile(filePath)
	lines := strings.Split(string(data), "\n")

	var newLines []string
	newLines = append(newLines, relSlash)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || trimmed == relSlash {
			continue
		}
		newLines = append(newLines, trimmed)
		if len(newLines) >= 50 {
			break
		}
	}

	output := strings.Join(newLines, "\n") + "\n"
	err = os.WriteFile(filePath, []byte(output), 0644)
	return err == nil
}

func loadConfig() AppConfig {
	config := make(AppConfig)

	data, err := os.ReadFile(configPath)
	if err == nil {
		if err := yaml.Unmarshal(data, &config); err != nil {
			log.Println("Error parsing svmp-lqm.conf:", err)
		}
		modified := false
		if _, exists := config["playlists"]; exists {
			delete(config, "playlists")
			modified = true
		}
		if _, exists := config["queueState"]; exists {
			delete(config, "queueState")
			modified = true
		}
		if opts, ok := config["options"].(map[string]interface{}); ok {
			if _, exists := opts["rememberLastQueue"]; exists {
				delete(opts, "rememberLastQueue")
				modified = true
			}
		}
		if modified {
			saveConfig(config)
		}
	} else if os.IsNotExist(err) {
		// Default config mimicking ConfigManager state
		config = AppConfig{
			"fx": map[string]interface{}{
				"kawaii": false, "maxTrip": false, "theme": "default",
				"rgb": false, "crt": false, "invert": false,
				"obfuscate": false, "bg": "plasma",
			},
			"eq": map[string]interface{}{
				"bass": 0, "mid": 0, "treble": 0,
			},
			"isMobile":     false,
			"isSway":       false,
			"clockState":   0,
			"devMode":      false,
			"visualizer":   true,
			"charOverride": nil,
			"isUwu":        false,
			"options": map[string]interface{}{
				"notifications": true, "trackNotif": true, "hintsNotif": true,
				"notifDuration": 5000, "marqueeSpeed": "normal", "notifPosition": "tl",
				"expie": false, "timebar": true, "fullscreen": false,
				"autoPlayAtStartup": false,
			},
			"nativeDir": "",
		}
		saveConfig(config)
	}
	return config
}

func saveConfig(config AppConfig) {
	data, err := yaml.Marshal(config)
	if err != nil {
		log.Println("Error marshaling config:", err)
		return
	}
	if err := os.WriteFile(configPath, data, 0644); err != nil {
		log.Println("Error writing svmp-lqm.conf:", err)
	}
}

func createAndShowWindow() webview.WebView {
	debug := true
	w := webview.New(debug)
	if w == nil {
		return nil
	}
	winMgr.Add(w)
	if ptr := w.Window(); ptr != nil {
		C.attach_delete_event(ptr, ptr)
	}

	w.SetTitle("SVMP (LQM)")
	w.SetSize(900, 700, webview.HintNone)

	bindWindowFunctions(w)

	config := loadConfig()
	configBytes, _ := json.Marshal(config)
	initJS := fmt.Sprintf("window.__INITIAL_CONFIG__ = %s;", string(configBytes))
	w.Init(initJS)

	w.Navigate(fmt.Sprintf("http://127.0.0.1:%s/player.html", localServerPort))
	return w
}

func bindWindowFunctions(w webview.WebView) {
	homeDir, _ := os.UserHomeDir()

	w.Bind("goOpenNewWindow", func() {
		w.Dispatch(func() {
			createAndShowWindow()
		})
	})

	w.Bind("goCloseCurrentWindow", func() {
		w.Dispatch(func() {
			closeWindow(w)
		})
	})

	w.Bind("goGetDefaultDir", func() string {
		return filepath.Join(homeDir, "Music")
	})

	w.Bind("goOpenDirBrowser", func(startingPath string) {
		if startingPath != "" {
			currentBrowserPath = startingPath
		}
		listDirectory(currentBrowserPath)
	})

	w.Bind("goNavigateDir", func(name string) {
		if name == ".." {
			currentBrowserPath = filepath.Dir(currentBrowserPath)
		} else {
			currentBrowserPath = filepath.Join(currentBrowserPath, name)
		}
		listDirectory(currentBrowserPath)
	})

	w.Bind("goSelectDir", func(path string) {
		selectedMusicDir = path
		log.Println("Selected directory:", selectedMusicDir)
		go scanAndWatchDirectory(selectedMusicDir)
	})

	w.Bind("goCancelIndexing", func() {
		log.Println("Indexing canceled by user")
		cancelIndexing()
	})

	w.Bind("goSaveConfig", func(configJSON string) {
		var config AppConfig
		if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
			log.Println("Error unmarshaling config from JS:", err)
			return
		}
		saveConfig(config)
	})

	w.Bind("goUpdateMprisStatus", func(status string) {
		updateMprisStatus(status)
	})

	w.Bind("goUpdateMprisMetadata", func(title, artist, path, artUrl string) {
		updateMprisMetadata(title, artist, path, artUrl)
	})

	w.Bind("goUpdateMprisPosition", func(seconds float64) {
		posMicroseconds := int64(seconds * 1000000)
		updateMprisPosition(posMicroseconds)
	})

	w.Bind("goUpdateMprisSeeked", func(seconds float64) {
		posMicroseconds := int64(seconds * 1000000)
		updateMprisSeeked(posMicroseconds)
	})

	w.Bind("goFetchSystemInfo", func() string {
		out, err := executeFetch()
		if err != nil {
			log.Println("Fetch error:", err)
			return ""
		}
		return out
	})

	w.Bind("goKillApp", func() {
		log.Println("Forcibly terminating application via kill command...")
		os.Exit(0)
	})

	w.Bind("goGetQueryInfo", func(audioPath string) string {
		return getQueryInfo(audioPath)
	})

	w.Bind("goGetStats", func() string {
		return getStatsInfo()
	})

	w.Bind("goListPlaylists", func() []PlaylistInfo {
		return goListPlaylists()
	})

	w.Bind("goGetPlaylistTracks", func(playlistName string) []TrackInfo {
		return goGetPlaylistTracks(playlistName)
	})

	w.Bind("goAddTrackToPlaylist", func(playlistName, trackPath string) bool {
		return goAddTrackToPlaylist(playlistName, trackPath)
	})

	w.Bind("goRemoveTrackFromPlaylist", func(playlistName, trackPath string) bool {
		return goRemoveTrackFromPlaylist(playlistName, trackPath)
	})

	w.Bind("goIsFavorite", func(trackPath string) bool {
		return goIsFavorite(trackPath)
	})

	w.Bind("goCreatePlaylist", func(playlistName string) bool {
		return goCreatePlaylist(playlistName)
	})

	w.Bind("goDeletePlaylist", func(playlistName string) bool {
		return goDeletePlaylist(playlistName)
	})

	w.Bind("goAddToRecents", func(trackPath string) bool {
		return goAddToRecents(trackPath)
	})

	w.Bind("goCheckGitRepo", func() GitRepoInfo {
		return goCheckGitRepo()
	})

	w.Bind("goPerformUpdate", func() UpdateResult {
		return goPerformUpdate()
	})
}

func main() {
	serverStartTime = time.Now()

	cs := C.CString("svmp-lqm")
	C.g_set_prgname(cs)
	C.free(unsafe.Pointer(cs))

	execPath, err := os.Executable()
	if err == nil {
		execDir = filepath.Dir(execPath)
		configPath = filepath.Join(execDir, "svmp-lqm.conf")
	} else {
		execDir = "."
		configPath = "svmp-lqm.conf"
	}

	homeDir, _ := os.UserHomeDir()
	currentBrowserPath = filepath.Join(homeDir, "Music")

	// Setup embedded file server on a random open port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	localServerPort = fmt.Sprintf("%d", listener.Addr().(*net.TCPAddr).Port)

	go startServer(listener)
	// give it a sec to start
	time.Sleep(200 * time.Millisecond)

	initMpris()

	mainW := createAndShowWindow()
	if mainW != nil {
		defer mainW.Destroy()
		mainW.Run()
	}
}

func startServer(listener net.Listener) {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Serve static files from src directory inside executable directory
		http.ServeFile(w, r, filepath.Join(execDir, "src", r.URL.Path))
	})

	http.HandleFunc("/audio/", func(w http.ResponseWriter, r *http.Request) {
		// Serve audio files from local filesystem
		path := r.URL.Query().Get("path")
		if path == "" {
			http.Error(w, "Missing path", http.StatusBadRequest)
			return
		}
		// Security: Only allow serving files from the selected music directory
		cleanPath := filepath.Clean(path)
		if selectedMusicDir == "" || !strings.HasPrefix(filepath.ToSlash(cleanPath), filepath.ToSlash(selectedMusicDir)) {
			http.Error(w, "Access Denied", http.StatusForbidden)
			return
		}
		http.ServeFile(w, r, path)
	})

	http.HandleFunc("/art", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		artUrlParam := r.URL.Query().Get("url")

		if path != "" {
			cleanPath := filepath.Clean(path)
			if selectedMusicDir != "" && strings.HasPrefix(filepath.ToSlash(cleanPath), filepath.ToSlash(selectedMusicDir)) {
				f, err := os.Open(path)
				if err == nil {
					defer f.Close()
					m, err := tag.ReadFrom(f)
					if err == nil && m != nil {
						pic := m.Picture()
						if pic != nil {
							w.Header().Set("Content-Type", pic.MIMEType)
							w.Write(pic.Data)
							return
						}
					}
				}
			}
		}

		if artUrlParam != "" {
			resp, err := http.Get(artUrlParam)
			if err == nil && resp.StatusCode == http.StatusOK {
				defer resp.Body.Close()
				w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
				_, _ = io.Copy(w, resp.Body)
				return
			}
		}

		http.Error(w, "No artwork", http.StatusNotFound)
	})

	log.Println("Starting server on", listener.Addr().String())
	if err := http.Serve(listener, nil); err != nil {
		log.Fatal(err)
	}
}

func listDirectory(path string) {
	files, err := os.ReadDir(path)
	if err != nil {
		log.Println("Error reading dir:", err)
		return
	}

	var items []FileItem
	for _, f := range files {
		if strings.HasPrefix(f.Name(), ".") {
			continue
		}
		items = append(items, FileItem{
			Name:  f.Name(),
			IsDir: f.IsDir(),
		})
	}

	itemsJSON, _ := json.Marshal(items)
	js := fmt.Sprintf("window.goUpdateDirList(%q, %s);", path, itemsJSON)
	winMgr.BroadcastJS(js)
}

type UpdateResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type GitRepoInfo struct {
	IsGitRepo     bool   `json:"isGitRepo"`
	CurrentCommit string `json:"currentCommit"`
	CurrentBranch string `json:"currentBranch"`
}

func goCheckGitRepo() GitRepoInfo {
	info := GitRepoInfo{IsGitRepo: false}

	cmd := exec.Command("git", "rev-parse", "--short", "HEAD")
	cmd.Dir = execDir
	out, err := cmd.CombinedOutput()
	if err == nil {
		info.IsGitRepo = true
		info.CurrentCommit = strings.TrimSpace(string(out))
	} else {
		commitFile := filepath.Join(execDir, ".commit")
		if data, err := os.ReadFile(commitFile); err == nil {
			info.CurrentCommit = strings.TrimSpace(string(data))
		}
		return info
	}

	cmdBranch := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmdBranch.Dir = execDir
	outBranch, err := cmdBranch.CombinedOutput()
	if err == nil {
		info.CurrentBranch = strings.TrimSpace(string(outBranch))
	}

	return info
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, info.Mode())
	})
}

func goPerformUpdate() UpdateResult {
	if _, err := exec.LookPath("git"); err != nil {
		return UpdateResult{Success: false, Message: "git command not found in PATH."}
	}
	if _, err := exec.LookPath("go"); err != nil {
		return UpdateResult{Success: false, Message: "go command not found in PATH."}
	}

	backupDir := filepath.Join(execDir, ".update_backup")
	_ = os.RemoveAll(backupDir)
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return UpdateResult{Success: false, Message: "Failed to create backup directory."}
	}
	defer os.RemoveAll(backupDir)

	binName := "svmp-lqm"
	if runtime.GOOS == "windows" {
		binName = "svmp-lqm.exe"
	}
	origBin := filepath.Join(execDir, binName)
	backupBin := filepath.Join(backupDir, binName)
	origSrc := filepath.Join(execDir, "src")
	backupSrc := filepath.Join(backupDir, "src")

	backedUpBin := false
	if _, err := os.Stat(origBin); err == nil {
		if data, err := os.ReadFile(origBin); err == nil {
			_ = os.WriteFile(backupBin, data, 0755)
			backedUpBin = true
		}
	}

	backedUpSrc := false
	if _, err := os.Stat(origSrc); err == nil {
		if err := copyDir(origSrc, backupSrc); err == nil {
			backedUpSrc = true
		}
	}

	restoreBackup := func(reason string) UpdateResult {
		log.Println("Update failed:", reason, "- Restoring backup...")
		if backedUpBin {
			if data, err := os.ReadFile(backupBin); err == nil {
				_ = os.WriteFile(origBin, data, 0755)
			}
		}
		if backedUpSrc {
			_ = os.RemoveAll(origSrc)
			_ = copyDir(backupSrc, origSrc)
		}
		return UpdateResult{Success: false, Message: fmt.Sprintf("Update failed (%s). Restored previous state.", reason)}
	}

	homeDir, _ := os.UserHomeDir()
	pkgPath := filepath.Join(homeDir, ".local", "lib", "pkgconfig")
	currentPkg := os.Getenv("PKG_CONFIG_PATH")
	envPkgConfig := fmt.Sprintf("PKG_CONFIG_PATH=%s:%s", pkgPath, currentPkg)

	checkGitCmd := exec.Command("git", "rev-parse", "--is-inside-work-tree")
	checkGitCmd.Dir = execDir
	isGitRepo := checkGitCmd.Run() == nil

	updatedViaGitPull := false
	if isGitRepo {
		pullCmd := exec.Command("git", "pull")
		pullCmd.Dir = execDir
		if pullOut, err := pullCmd.CombinedOutput(); err == nil {
			buildCmd := exec.Command("go", "build", "-o", binName, ".")
			buildCmd.Dir = execDir
			buildCmd.Env = append(os.Environ(), envPkgConfig)

			if buildOut, err := buildCmd.CombinedOutput(); err == nil {
				if _, err := os.Stat(origBin); err == nil {
					updatedViaGitPull = true
					revCmd := exec.Command("git", "rev-parse", "--short", "HEAD")
					revCmd.Dir = execDir
					if revOut, err := revCmd.CombinedOutput(); err == nil {
						_ = os.WriteFile(filepath.Join(execDir, ".commit"), []byte(strings.TrimSpace(string(revOut))), 0644)
					}
				}
			} else {
				log.Println("git pull build failed:", string(buildOut))
			}
		} else {
			log.Println("git pull failed:", string(pullOut))
		}
	}

	if !updatedViaGitPull {
		tmpDir, err := os.MkdirTemp("", "svmp-update-*")
		if err != nil {
			return restoreBackup(fmt.Sprintf("failed to create temporary directory: %v", err))
		}
		defer os.RemoveAll(tmpDir)

		cloneCmd := exec.Command("git", "clone", "--depth", "1", "https://github.com/envleaf/svmp-lqm.git", tmpDir)
		if cloneOut, err := cloneCmd.CombinedOutput(); err != nil {
			return restoreBackup(fmt.Sprintf("git clone failed: %s", strings.TrimSpace(string(cloneOut))))
		}

		buildCmd := exec.Command("go", "build", "-o", binName, ".")
		buildCmd.Dir = tmpDir
		buildCmd.Env = append(os.Environ(), envPkgConfig)

		if buildOut, err := buildCmd.CombinedOutput(); err != nil {
			return restoreBackup(fmt.Sprintf("go build failed: %s", strings.TrimSpace(string(buildOut))))
		}

		newBin := filepath.Join(tmpDir, binName)
		if _, err := os.Stat(newBin); err != nil {
			return restoreBackup("compiled binary not found after build")
		}

		binData, err := os.ReadFile(newBin)
		if err != nil {
			return restoreBackup("failed to read newly built binary")
		}

		// On Linux, writing directly to an executing binary returns ETXTBSY ("text file busy").
		// Remove existing binary first or write to a temporary file and atomic rename.
		_ = os.Remove(origBin)
		if err := os.WriteFile(origBin, binData, 0755); err != nil {
			return restoreBackup("failed to update binary in installation directory")
		}

		newSrc := filepath.Join(tmpDir, "src")
		if _, err := os.Stat(newSrc); err == nil {
			_ = os.RemoveAll(origSrc)
			if err := copyDir(newSrc, origSrc); err != nil {
				return restoreBackup("failed to update src directory")
			}
		}

		revCmd := exec.Command("git", "rev-parse", "--short", "HEAD")
		revCmd.Dir = tmpDir
		if revOut, err := revCmd.CombinedOutput(); err == nil {
			_ = os.WriteFile(filepath.Join(execDir, ".commit"), []byte(strings.TrimSpace(string(revOut))), 0644)
		}
	}

	return UpdateResult{Success: true, Message: "Update completed successfully!"}
}

type StatsInfo struct {
	OS         string  `json:"os"`
	Arch       string  `json:"arch"`
	GoVersion  string  `json:"goVersion"`
	NumCPU     int     `json:"numCpu"`
	Goroutines int     `json:"goroutines"`
	MemAlloc   uint64  `json:"memAlloc"`
	MemSys     uint64  `json:"memSys"`
	ServerPort string  `json:"serverPort"`
	UptimeSecs float64 `json:"uptimeSecs"`
}

func getStatsInfo() string {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	stats := StatsInfo{
		OS:         runtime.GOOS,
		Arch:       runtime.GOARCH,
		GoVersion:  runtime.Version(),
		NumCPU:     runtime.NumCPU(),
		Goroutines: runtime.NumGoroutine(),
		MemAlloc:   m.Alloc,
		MemSys:     m.Sys,
		ServerPort: localServerPort,
		UptimeSecs: time.Since(serverStartTime).Seconds(),
	}

	data, _ := json.Marshal(stats)
	return string(data)
}

func executeFetch() (string, error) {
	utilities := []string{"hyfetch", "fastfetch", "neofetch"}
	var foundPath string
	for _, util := range utilities {
		path, err := exec.LookPath(util)
		if err == nil {
			foundPath = path
			break
		}
	}

	if foundPath == "" {
		return "", fmt.Errorf("no fetch utility found")
	}

	cmd := exec.Command(foundPath)
	out, err := cmd.CombinedOutput()
	if err != nil && len(out) == 0 {
		return "", err
	}
	return string(out), nil
}

func isAudioFile(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".mp3", ".flac", ".wav", ".ogg", ".m4a":
		return true
	}
	return false
}

func parseTrackInfo(path string) TrackInfo {
	info := TrackInfo{
		Src:          fmt.Sprintf("http://127.0.0.1:%s/audio/?path=%s", localServerPort, url.QueryEscape(filepath.ToSlash(path))),
		OriginalName: filepath.Base(path),
		OriginalPath: path,
	}

	defer func() {
		if r := recover(); r != nil {
			log.Printf("Recovered panic while parsing metadata for %s: %v", path, r)
		}
	}()

	f, err := os.Open(path)
	if err == nil {
		defer f.Close()
		m, err := tag.ReadFrom(f)
		if err == nil && m != nil {
			info.Title = m.Title()
			info.Artist = m.Artist()
			info.Album = m.Album()
		}
	}
	return info
}

var watcher *fsnotify.Watcher
var currentScanCancel context.CancelFunc
var scanMutex sync.Mutex

func cancelIndexing() {
	scanMutex.Lock()
	defer scanMutex.Unlock()
	if currentScanCancel != nil {
		currentScanCancel()
		currentScanCancel = nil
	}
	if watcher != nil {
		watcher.Close()
		watcher = nil
	}
}

func scanAndWatchDirectory(root string) {
	cancelIndexing()

	scanMutex.Lock()
	ctx, cancel := context.WithCancel(context.Background())
	currentScanCancel = cancel
	scanMutex.Unlock()

	// Notify JS that indexing started
	winMgr.BroadcastJS(fmt.Sprintf("if (window.onIndexingStart) window.onIndexingStart(%q);", root))

	// Clear existing playlist in JS
	winMgr.BroadcastJS("window.liveClearPlaylist();")

	var err error
	wWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Println("fsnotify error:", err)
		return
	}

	scanMutex.Lock()
	if ctx.Err() != nil {
		wWatcher.Close()
		scanMutex.Unlock()
		return
	}
	watcher = wWatcher
	scanMutex.Unlock()

	// Stream tracks in batches to JS to prevent memory spikes and UI freezing
	const batchSize = 50
	var trackBatch []TrackInfo

	flushBatch := func() {
		if len(trackBatch) == 0 {
			return
		}
		b, err := json.Marshal(trackBatch)
		if err == nil {
			js := fmt.Sprintf("window.liveAddTracks(%s);", string(b))
			winMgr.BroadcastJS(js)
		}
		trackBatch = nil
	}

	// Walk dir to add all initial files and set up watches
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			log.Println("WalkDir item error:", path, err)
			return nil // Continue walking other items
		}
		if ctx.Err() != nil {
			return filepath.SkipAll
		}
		if d.IsDir() {
			_ = wWatcher.Add(path)
			return nil
		}
		if isAudioFile(path) {
			trackBatch = append(trackBatch, parseTrackInfo(path))
			if len(trackBatch) >= batchSize {
				flushBatch()
			}
		}
		return nil
	})
	if err != nil && ctx.Err() == nil {
		log.Println("WalkDir error:", err)
	}

	if ctx.Err() != nil {
		return
	}

	// Flush remaining tracks
	flushBatch()

	// Notify JS that indexing complete
	winMgr.BroadcastJS("if (window.onIndexingComplete) window.onIndexingComplete();")

	// Watch loop
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-wWatcher.Events:
				if !ok {
					return
				}
				if event.Has(fsnotify.Create) {
					info, err := os.Stat(event.Name)
					if err == nil && info.IsDir() {
						var newTracks []TrackInfo
						_ = filepath.WalkDir(event.Name, func(path string, d fs.DirEntry, err error) error {
							if err != nil || ctx.Err() != nil {
								return err
							}
							if d.IsDir() {
								wWatcher.Add(path)
								return nil
							}
							if isAudioFile(path) {
								newTracks = append(newTracks, parseTrackInfo(path))
							}
							return nil
						})
						if len(newTracks) > 0 && ctx.Err() == nil {
							b, _ := json.Marshal(newTracks)
							js := fmt.Sprintf("window.liveAddTracks(%s);", string(b))
							winMgr.BroadcastJS(js)
						}
					} else if isAudioFile(event.Name) && ctx.Err() == nil {
						pushTrackToJS(event.Name)
					}
				}
			case err, ok := <-wWatcher.Errors:
				if !ok {
					return
				}
				log.Println("watcher error:", err)
			}
		}
	}()
}

type QueryInfo struct {
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	NumCPU    int    `json:"numCpu"`
	GoVersion string `json:"goVersion"`
	Hostname  string `json:"hostname"`

	HasTrack bool   `json:"hasTrack"`
	Format   string `json:"format,omitempty"`
	FileType string `json:"fileType,omitempty"`
	Title    string `json:"title,omitempty"`
	Artist   string `json:"artist,omitempty"`
	Album    string `json:"album,omitempty"`
	FileSize int64  `json:"fileSize,omitempty"`
}

func getQueryInfo(audioPath string) string {
	hostname, _ := os.Hostname()

	info := QueryInfo{
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		NumCPU:    runtime.NumCPU(),
		GoVersion: runtime.Version(),
		Hostname:  hostname,
	}

	if audioPath != "" {
		cleanPath := filepath.Clean(audioPath)
		fileInfo, err := os.Stat(cleanPath)
		if err == nil && !fileInfo.IsDir() {
			info.HasTrack = true
			info.FileSize = fileInfo.Size()

			f, err := os.Open(cleanPath)
			if err == nil {
				defer f.Close()
				m, err := tag.ReadFrom(f)
				if err == nil {
					info.Format = string(m.Format())
					info.FileType = string(m.FileType())
					info.Title = m.Title()
					info.Artist = m.Artist()
					info.Album = m.Album()
				}
			}
		}
	}

	data, _ := json.Marshal(info)
	return string(data)
}

func pushTrackToJS(path string) {
	info := parseTrackInfo(path)
	b, _ := json.Marshal(info)
	js := fmt.Sprintf("window.liveAddTrack(%s);", string(b))
	winMgr.BroadcastJS(js)
}
