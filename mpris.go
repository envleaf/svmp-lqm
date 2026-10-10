package main

import (
	"fmt"
	"log"
	"path/filepath"


	"github.com/godbus/dbus/v5"
	"github.com/godbus/dbus/v5/introspect"
	"github.com/godbus/dbus/v5/prop"
)

const (
	mprisPath          = "/org/mpris/MediaPlayer2"
	mprisNamePrefix    = "org.mpris.MediaPlayer2.svmp"
	mprisRootInterface = "org.mpris.MediaPlayer2"
	mprisPlayerInterface = "org.mpris.MediaPlayer2.Player"
)

type mprisRoot struct{}

func (m *mprisRoot) Raise() *dbus.Error { return nil }
func (m *mprisRoot) Quit() *dbus.Error  { return nil }

type mprisPlayer struct {
	props *prop.Properties
}

func (p *mprisPlayer) Next() *dbus.Error {
	w.Dispatch(func() {
		w.Eval("if(window.PlayerController) window.PlayerController.next();")
	})
	return nil
}

func (p *mprisPlayer) Previous() *dbus.Error {
	w.Dispatch(func() {
		w.Eval("if(window.PlayerController) window.PlayerController.prev();")
	})
	return nil
}

func (p *mprisPlayer) Pause() *dbus.Error {
	w.Dispatch(func() {
		w.Eval("if(window.PlayerController) window.PlayerController.pauseAudio();")
	})
	return nil
}

func (p *mprisPlayer) PlayPause() *dbus.Error {
	w.Dispatch(func() {
		w.Eval("if(window.PlayerController && window.PlayerController.togglePlay) window.PlayerController.togglePlay(); else if (window.PlayerController) { if (document.getElementById('audio-element').paused) window.PlayerController.playAudio(); else window.PlayerController.pauseAudio(); }")
	})
	return nil
}

func (p *mprisPlayer) Stop() *dbus.Error {
	w.Dispatch(func() {
		w.Eval("if(window.PlayerController) window.PlayerController.pauseAudio();")
	})
	return nil
}

func (p *mprisPlayer) Play() *dbus.Error {
	w.Dispatch(func() {
		w.Eval("if(window.PlayerController) window.PlayerController.playAudio();")
	})
	return nil
}

func (p *mprisPlayer) Seek(offset int64) *dbus.Error {
    // offset in microseconds
    seconds := float64(offset) / 1000000.0
	w.Dispatch(func() {
		w.Eval(fmt.Sprintf("if(window.PlayerController && window.PlayerController.seekRelative) window.PlayerController.seekRelative(%f); else if (window.PlayerController) { let a = document.getElementById('audio-element'); if(a) window.PlayerController.seek(a.currentTime + %f); }", seconds, seconds))
	})
	return nil
}

func (p *mprisPlayer) SetPosition(trackId dbus.ObjectPath, position int64) *dbus.Error {
    // position in microseconds
    seconds := float64(position) / 1000000.0
	w.Dispatch(func() {
		w.Eval(fmt.Sprintf("if(window.PlayerController) window.PlayerController.seek(%f);", seconds))
	})
	return nil
}

func (p *mprisPlayer) OpenUri(uri string) *dbus.Error { return nil }

var mprisProps *prop.Properties
var mprisConn *dbus.Conn

func initMpris() {
	conn, err := dbus.ConnectSessionBus()
	mprisConn = conn
	if err != nil {
		log.Println("Failed to connect to session bus:", err)
		return
	}

	reply, err := conn.RequestName(mprisNamePrefix, dbus.NameFlagDoNotQueue)
	if err != nil {
		log.Println("Failed to request MPRIS bus name:", err)
		return
	}
	if reply != dbus.RequestNameReplyPrimaryOwner {
		log.Println("MPRIS name already taken.")
		return
	}

	root := &mprisRoot{}
	conn.Export(root, mprisPath, mprisRootInterface)

	player := &mprisPlayer{}
	conn.Export(player, mprisPath, mprisPlayerInterface)

	propsMap := map[string]map[string]*prop.Prop{
		mprisRootInterface: {
			"CanQuit":      {false, false, prop.EmitTrue, nil},
			"CanRaise":     {false, false, prop.EmitTrue, nil},
			"HasTrackList": {false, false, prop.EmitTrue, nil},
			"Identity":     {"SvMP", false, prop.EmitTrue, nil},
			"SupportedUriSchemes": {[]string{"file"}, false, prop.EmitTrue, nil},
			"SupportedMimeTypes":  {[]string{"audio/mpeg", "audio/flac", "audio/wav", "audio/ogg", "audio/mp4"}, false, prop.EmitTrue, nil},
		},
		mprisPlayerInterface: {
			"PlaybackStatus": {"Stopped", false, prop.EmitTrue, nil},
			"LoopStatus":     {"None", false, prop.EmitTrue, nil}, // None, Track, Playlist
			"Rate":           {1.0, false, prop.EmitTrue, nil},
			"Shuffle":        {false, false, prop.EmitTrue, nil},
			"Metadata": {map[string]dbus.Variant{
				"mpris:trackid": dbus.MakeVariant(dbus.ObjectPath("/org/mpris/MediaPlayer2/TrackList/NoTrack")),
			}, false, prop.EmitTrue, nil},
			"Volume":       {1.0, true, prop.EmitTrue, func(c *prop.Change) *dbus.Error {
                vol := c.Value.(float64)
                w.Dispatch(func() {
                    w.Eval(fmt.Sprintf("if(window.AudioEngine) window.AudioEngine.setVolume(%f);", vol))
                })
                return nil
            }},
			"Position":     {int64(0), false, prop.EmitFalse, nil},
			"MinimumRate":  {1.0, false, prop.EmitTrue, nil},
			"MaximumRate":  {1.0, false, prop.EmitTrue, nil},
			"CanGoNext":    {true, false, prop.EmitTrue, nil},
			"CanGoPrevious": {true, false, prop.EmitTrue, nil},
			"CanPlay":      {true, false, prop.EmitTrue, nil},
			"CanPause":     {true, false, prop.EmitTrue, nil},
			"CanSeek":      {true, false, prop.EmitTrue, nil},
			"CanControl":   {true, false, prop.EmitTrue, nil},
		},
	}

	var errProps error
	mprisProps, errProps = prop.Export(conn, mprisPath, propsMap)
	if errProps != nil {
		log.Println("Failed to export MPRIS properties:", errProps)
		return
	}
    player.props = mprisProps

	node := &introspect.Node{
		Name: mprisPath,
		Interfaces: []introspect.Interface{
			introspect.IntrospectData,
			prop.IntrospectData,
			{
				Name: mprisRootInterface,
				Methods: []introspect.Method{
					{Name: "Raise"},
					{Name: "Quit"},
				},
				Properties: mprisProps.Introspection(mprisRootInterface),
			},
			{
				Name: mprisPlayerInterface,
				Methods: []introspect.Method{
					{Name: "Next"},
					{Name: "Previous"},
					{Name: "Pause"},
					{Name: "PlayPause"},
					{Name: "Stop"},
					{Name: "Play"},
					{
						Name: "Seek",
						Args: []introspect.Arg{
							{Name: "Offset", Type: "x", Direction: "in"},
						},
					},
					{
						Name: "SetPosition",
						Args: []introspect.Arg{
							{Name: "TrackId", Type: "o", Direction: "in"},
							{Name: "Position", Type: "x", Direction: "in"},
						},
					},
					{
						Name: "OpenUri",
						Args: []introspect.Arg{
							{Name: "Uri", Type: "s", Direction: "in"},
						},
					},
				},
				Properties: mprisProps.Introspection(mprisPlayerInterface),
			},
		},
	}

	conn.Export(introspect.NewIntrospectable(node), mprisPath, "org.freedesktop.DBus.Introspectable")
}

func updateMprisStatus(status string) {
	if mprisProps != nil {
		mprisProps.SetMust(mprisPlayerInterface, "PlaybackStatus", status)
	}
}

func updateMprisMetadata(title, artist, path string) {
	if mprisProps != nil {
		trackID := dbus.ObjectPath("/org/mpris/MediaPlayer2/TrackList/Track")
		metadata := map[string]dbus.Variant{
			"mpris:trackid": dbus.MakeVariant(trackID),
			"xesam:title":   dbus.MakeVariant(title),
		}
		if artist != "" {
			metadata["xesam:artist"] = dbus.MakeVariant([]string{artist})
		}
		if path != "" {
			fileURI := "file://" + filepath.ToSlash(path)
			metadata["xesam:url"] = dbus.MakeVariant(fileURI)
            // Use local HTTP art server for MPRIS artUrl
            // It will fetch metadata from the file via `github.com/dhowden/tag`
            artUrl := fmt.Sprintf("http://127.0.0.1:%s/art?path=%s", localServerPort, path)
            metadata["mpris:artUrl"] = dbus.MakeVariant(artUrl)
		}
		mprisProps.SetMust(mprisPlayerInterface, "Metadata", metadata)
	}
}

func updateMprisPosition(posMicroseconds int64) {
    if mprisProps != nil {
        mprisProps.SetMust(mprisPlayerInterface, "Position", posMicroseconds)
    }
}

func updateMprisSeeked(posMicroseconds int64) {
    if mprisConn != nil {
        mprisConn.Emit(mprisPath, mprisPlayerInterface+".Seeked", posMicroseconds)
    }
}
