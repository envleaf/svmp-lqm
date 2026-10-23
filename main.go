package main

/*
#cgo pkg-config: glib-2.0
#include <glib.h>
#include <stdlib.h>
*/
import "C"

import (
	"context"
	"encoding/json"
	"fmt"
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
	OriginalName string `json:"originalName"`
	OriginalPath string `json:"originalPath"`
}

var currentBrowserPath string
var selectedMusicDir string
var w webview.WebView
var localServerPort string

var execDir string
var configPath string
var serverStartTime time.Time

func loadConfig() AppConfig {
	config := make(AppConfig)

	data, err := os.ReadFile(configPath)
	if err == nil {
		if err := yaml.Unmarshal(data, &config); err != nil {
			log.Println("Error parsing svmp-lqm.conf:", err)
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
			"isMobile": false,
			"isSway": false,
			"clockState": 0,
			"devMode": false,
			"visualizer": true,
			"charOverride": nil,
			"isUwu": false,
			"options": map[string]interface{}{
				"notifications": true, "trackNotif": true, "hintsNotif": true,
				"notifDuration": 5000, "marqueeSpeed": "normal", "notifPosition": "tl",
				"expie": false, "timebar": true, "fullscreen": false,
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

	// Setup embedded file server on a random open port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	localServerPort = fmt.Sprintf("%d", listener.Addr().(*net.TCPAddr).Port)

	go startServer(listener)
	// give it a sec to start
	time.Sleep(200 * time.Millisecond)

	debug := true
	w = webview.New(debug)
	defer w.Destroy()

	w.SetTitle("SVMP (LQM)")
	w.SetSize(900, 700, webview.HintNone)

	homeDir, _ := os.UserHomeDir()
	currentBrowserPath = filepath.Join(homeDir, "Music")

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

	config := loadConfig()
	configBytes, _ := json.Marshal(config)

	w.Bind("goUpdateMprisStatus", func(status string) {
		updateMprisStatus(status)
	})

	w.Bind("goUpdateMprisMetadata", func(title, artist, path string) {
		updateMprisMetadata(title, artist, path)
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

	initMpris()

	// Inject the initial config into the window object
	initJS := fmt.Sprintf("window.__INITIAL_CONFIG__ = %s;", string(configBytes))
	w.Init(initJS)

	w.Navigate(fmt.Sprintf("http://127.0.0.1:%s/player.html", localServerPort))
	w.Run()
}

func startServer(listener net.Listener) {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Serve static files from executable directory
		http.ServeFile(w, r, filepath.Join(execDir, r.URL.Path))
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
		if path == "" {
			http.Error(w, "Missing path", http.StatusBadRequest)
			return
		}

		cleanPath := filepath.Clean(path)
		if selectedMusicDir == "" || !strings.HasPrefix(filepath.ToSlash(cleanPath), filepath.ToSlash(selectedMusicDir)) {
			http.Error(w, "Access Denied", http.StatusForbidden)
			return
		}

		f, err := os.Open(path)
		if err != nil {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		defer f.Close()

		m, err := tag.ReadFrom(f)
		if err != nil {
			http.Error(w, "No tags", http.StatusNotFound)
			return
		}

		pic := m.Picture()
		if pic == nil {
			http.Error(w, "No artwork", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", pic.MIMEType)
		w.Write(pic.Data)
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
	w.Dispatch(func() {
		w.Eval(js)
	})
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
	w.Dispatch(func() {
		js := fmt.Sprintf("if (window.onIndexingStart) window.onIndexingStart(%q);", root)
		w.Eval(js)
	})

	// Clear existing playlist in JS
	w.Dispatch(func() {
		w.Eval("window.liveClearPlaylist();")
	})

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
			w.Dispatch(func() {
				w.Eval(js)
			})
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
	w.Dispatch(func() {
		w.Eval("if (window.onIndexingComplete) window.onIndexingComplete();")
	})

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
							w.Dispatch(func() {
								w.Eval(js)
							})
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
	w.Dispatch(func() {
		w.Eval(js)
	})
}
