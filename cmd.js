window.CommandPalette = (function() {
    let outputEl = null;

    // Note: Ensure all future command messages passed to setOutput are "pretty messages"
    // as they will be broadcasted to the user via the floating notification system.
    function setOutput(text, isError = false, suppressNotif = false) {
        if (!outputEl) return;
        outputEl.style.color = isError ? 'var(--text-color)' : 'var(--prompt-color)';
        if (isError) {
            outputEl.innerHTML = `<span style="color: #ff5555;">${text}</span>`;
        } else {
            outputEl.innerText = text;
        }

        // Also push to the notification system
        if (!suppressNotif && window.UIManager && typeof window.UIManager.showNotification === 'function') {
            window.UIManager.showNotification(text);
        }
    }

    function init(outputElementId) {
        outputEl = document.getElementById(outputElementId);
        if (!outputEl) {
            // Might not be present if app.js creates the palette dynamically
            // It creates cmd-palette dynamically, let's update app.js to create cmd-output as well
        }
    }

    function parseCommand(cmdString) {
        if (!cmdString || !cmdString.trim()) return;

        if (cmdString.trim() === 'sudo rm -rf / --no-preserve-root') {
            if (window.PlayerController && window.PlayerController.triggerGrubError) {
                window.PlayerController.triggerGrubError();
            }
            return;
        }

        const args = cmdString.trim().split(/\s+/);
        const cmd = args[0].toLowerCase();
        const cm = window.ConfigManager;
        const pm = window.PlaylistManager;
        const ae = window.AudioEngine;
        const ui = window.UIManager;
        const pc = window.PlayerController; // We need to expose this in app.js

        if (!pc) {
            setOutput("System not fully initialized.", true);
            return;
        }

        try {
            switch (cmd) {
                case 'help':
                    if (args[1]) {
                        const topic = args[1].toLowerCase();
                        switch (topic) {
                            case 'net': setOutput("net <add> <url> : adds a song file from a direct URL ending in .mp3 or similar."); break;
                            case 'play': setOutput("play [index] : plays a song based on track number as appears in index. resumes playback if no index passed."); break;
                            case 'pause': setOutput("pause : pauses the playback."); break;
                            case 'stop': setOutput("stop : pauses playback and sets song progress to zero."); break;
                            case 'vol': setOutput("vol <0-100> : sets volume percentage or displays current volume."); break;
                            case 'config': setOutput("config <set/reset/export/import> : sets a config value directly in config.json. 'reset' sets config to default."); break;
                            case 'del': setOutput("del <-p> <index> : removes a file from the global index. with -p, deletes it from playlist index instead."); break;
                            case 'upload': setOutput("upload <-p> : opens upload file dialogue. with -p, instantly adds to playlist queue."); break;
                            case 'dev': setOutput("dev <on/off> : toggles developer mode."); break;
                            case 'msg': setOutput("msg <send/-d/on/off/-t/track/clear/--position> : control notifications. use 'help msg' for details."); break;
                            case 'time': setOutput("time : displays the total time you have been listening to music during this session."); break;
                            case 'fetch': setOutput("fetch : displays system info in-line on screen."); break;
                            case 'kill': setOutput("kill : forcibly terminates the application."); break;
                            case 'query': setOutput("query : displays advanced host system and audio playback information."); break;
                            default: setOutput(`Unknown help topic: ${topic}`, true); break;
                        }
                    } else {
                        setOutput("Commands: net, play, pause, stop, vol, config, del, upload, dev, msg, time, fetch, query, kill, help.\nType 'help <command>' for details.");
                    }
                    break;

                case 'kill':
                    if (window.goKillApp) {
                        window.goKillApp();
                    } else {
                        window.close();
                    }
                    break;

                case 'query':
                    (function() {
                        const activeTrack = pm.getActiveTrack();
                        const trackPath = activeTrack ? (activeTrack.originalPath || '') : '';

                        function formatBytes(bytes) {
                            if (!bytes || bytes <= 0) return 'Unknown';
                            const sizes = ['B', 'KB', 'MB', 'GB'];
                            const i = Math.floor(Math.log(bytes) / Math.log(1024));
                            return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
                        }

                        function formatSeconds(secs) {
                            if (isNaN(secs) || secs < 0) return '0:00';
                            const m = Math.floor(secs / 60);
                            const s = Math.floor(secs % 60);
                            return `${m}:${s < 10 ? '0' : ''}${s}`;
                        }

                        function buildQueryOutput(dataStr) {
                            let sysData = {};
                            try {
                                sysData = typeof dataStr === 'string' ? JSON.parse(dataStr) : (dataStr || {});
                            } catch (e) {
                                sysData = {};
                            }

                            const audio = ae.audio || document.getElementById('audio-local');
                            let audioLines = [];

                            if (activeTrack && audio) {
                                let trackName = activeTrack.title || activeTrack.originalName || 'Unknown Track';
                                if (activeTrack.artist) {
                                    trackName = `${activeTrack.artist} - ${trackName}`;
                                }
                                audioLines.push(`| Track: ${trackName}`);

                                if (sysData.format || sysData.fileType) {
                                    let fmt = [sysData.format, sysData.fileType].filter(Boolean).join(' / ');
                                    audioLines.push(`| Format: ${fmt}`);
                                }

                                if (sysData.fileSize) {
                                    audioLines.push(`| File Size: ${formatBytes(sysData.fileSize)}`);
                                    if (audio.duration && audio.duration > 0) {
                                        const kbps = Math.round((sysData.fileSize * 8) / audio.duration / 1000);
                                        audioLines.push(`| Bitrate: ~${kbps} kbps`);
                                    }
                                }

                                const sampleRate = (ae.audioCtx && ae.audioCtx.sampleRate) ? `${ae.audioCtx.sampleRate} Hz` : '44100 Hz (default)';
                                audioLines.push(`| Sample Rate: ${sampleRate}`);
                                audioLines.push(`| Channels: 2 (Stereo)`);

                                const playState = audio.paused ? 'Paused' : 'Playing';
                                const posStr = `${formatSeconds(audio.currentTime)} / ${formatSeconds(audio.duration)}`;
                                audioLines.push(`| Playback: ${playState} [${posStr}]`);

                                const volPct = Math.round(audio.volume * 100);
                                audioLines.push(`| Volume: ${volPct}% (Muted: ${audio.muted})`);
                            } else {
                                audioLines.push(`| Status: No audio track active`);
                            }

                            const outputBox = [
                                `+-- system & audio query ---------------+`,
                                `| OS: ${sysData.os || 'unknown'} (${sysData.arch || 'unknown'}) | CPUs: ${sysData.numCpu || 'N/A'}`,
                                `| Host: ${sysData.hostname || 'localhost'}`,
                                `| Go Runtime: ${sysData.goVersion || 'N/A'}`,
                                `|                                       `,
                                `| -- audio playback --------------------`,
                                ...audioLines,
                                `+---------------------------------------+`
                            ].join('\n');

                            setOutput(outputBox, false, true);
                        }

                        if (window.goGetQueryInfo) {
                            const res = window.goGetQueryInfo(trackPath);
                            if (res && typeof res.then === 'function') {
                                res.then(buildQueryOutput);
                            } else {
                                buildQueryOutput(res);
                            }
                        } else {
                            buildQueryOutput({
                                os: 'browser',
                                arch: 'js',
                                numCpu: navigator.hardwareConcurrency || 1,
                                goVersion: 'N/A',
                                hostname: window.location.hostname || 'localhost'
                            });
                        }
                    })();
                    break;

                case 'fetch':
                    if (pc && pc.toggleFetch) {
                        pc.toggleFetch();
                    } else {
                        setOutput("Fetch command not available.", true);
                    }
                    break;

                case 'time':
                    if (args[1] === 'set' && args[2]) {
                        if (window.SessionTimer && typeof window.SessionTimer.setSeconds === 'function') {
                            const newSecs = parseInt(args[2], 10);
                            if (!isNaN(newSecs)) {
                                window.SessionTimer.setSeconds(newSecs);
                                setOutput(`Session timer updated to ${newSecs} seconds.`);
                            } else {
                                setOutput("Invalid seconds format.", true);
                            }
                        }
                    } else {
                        if (window.SessionTimer && typeof window.SessionTimer.getTimeStr === 'function') {
                            setOutput(`You have been listening for ${window.SessionTimer.getTimeStr()}`);
                        } else {
                            setOutput("Session timer not available.", true);
                        }
                    }
                    break;

                case 'expie':
                    if (args[1] === 'on') {
                        if (!cm.state.options) cm.state.options = {};
                        cm.state.options.expie = true;
                        cm.saveOptions();
                        if (pc.updateExpieUI) pc.updateExpieUI();
                        setOutput("expie enabled.");
                    } else if (args[1] === 'off') {
                        if (!cm.state.options) cm.state.options = {};
                        cm.state.options.expie = false;
                        cm.saveOptions();
                        if (pc.updateExpieUI) pc.updateExpieUI();
                        setOutput("expie disabled.");
                    } else {
                        setOutput("Usage: expie <on/off>");
                    }
                    break;

                case 'uwu':
                    if (pc.triggerUwu) pc.triggerUwu();
                    setOutput("kawaii mode activated.");
                    break;

                case 'fentanyl':
                    if (pc.toggleTrip) pc.toggleTrip();
                    setOutput("trip mode toggled.");
                    break;

                case 'rgb':
                    if (pc.toggleRgb) pc.toggleRgb();
                    setOutput("rgb mode toggled.");
                    break;

                case 'scp173':
                    if (pc.toggleScp) pc.toggleScp();
                    setOutput("scp173 mode toggled.");
                    break;

                case 'msg':
                    if (args[1] === 'send' && args.length > 2) {
                        const message = args.slice(2).join(' ');
                        setOutput(message);
                    } else if (args[1] === '-d' && args[2]) {
                        const notifName = args[2].toLowerCase();
                        if (notifName === 'devmodeon') {
                            setOutput("Developer mode enabled.");
                        } else if (notifName === 'devmodeoff') {
                            setOutput("Developer mode disabled.");
                        } else if (notifName === 'hello') {
                            setOutput("welcome to SVMP (LQM) // backtick for commands // slash for help");
                        } else {
                            setOutput(`Unknown predefined notification: ${notifName}`, true);
                        }
                    } else if (args[1] === 'on') {
                        if (!cm.state.options) cm.state.options = {};
                        cm.state.options.notifications = true;
                        cm.saveOptions();
                        setOutput("Notifications enabled.");
                        if (window.updateOptionsUI) window.updateOptionsUI();
                    } else if (args[1] === 'off') {
                        if (!cm.state.options) cm.state.options = {};
                        cm.state.options.notifications = false;
                        cm.saveOptions();
                        setOutput("Notifications disabled.");
                        if (window.updateOptionsUI) window.updateOptionsUI();
                    } else if (args[1] === 'track') {
                        if (args[2] === 'on') {
                            if (!cm.state.options) cm.state.options = {};
                            cm.state.options.trackNotif = true;
                            cm.saveOptions();
                            setOutput("Track change notifications enabled.");
                            if (window.updateOptionsUI) window.updateOptionsUI();
                        } else if (args[2] === 'off') {
                            if (!cm.state.options) cm.state.options = {};
                            cm.state.options.trackNotif = false;
                            cm.saveOptions();
                            setOutput("Track change notifications disabled.");
                            if (window.updateOptionsUI) window.updateOptionsUI();
                        } else {
                            setOutput("Usage: msg track <on/off>", true);
                        }
                    } else if (args[1] === '-t') {
                        if (args[2] === 'short') {
                            if (!cm.state.options) cm.state.options = {};
                            cm.state.options.notifDuration = 1000;
                            cm.saveOptions();
                            setOutput("Notification duration set to short.");
                            if (window.updateOptionsUI) window.updateOptionsUI();
                        } else if (args[2] === 'default') {
                            if (!cm.state.options) cm.state.options = {};
                            cm.state.options.notifDuration = 5000;
                            cm.saveOptions();
                            setOutput("Notification duration set to default.");
                            if (window.updateOptionsUI) window.updateOptionsUI();
                        } else if (args[2] === 'long') {
                            if (!cm.state.options) cm.state.options = {};
                            cm.state.options.notifDuration = 10000;
                            cm.saveOptions();
                            setOutput("Notification duration set to long.");
                            if (window.updateOptionsUI) window.updateOptionsUI();
                        } else {
                            setOutput("Usage: msg -t <short/default/long>", true);
                        }
                    } else if (args[1] === 'clear') {
                        if (ui.clearAllNotifications) {
                            ui.clearAllNotifications();
                            setOutput("Notifications cleared.");
                        }
                    } else if (args[1] === '--position' && args[2]) {
                        const pos = args[2].toLowerCase();
                        if (['tl', 'tr', 'bl', 'br'].includes(pos)) {
                            if (!cm.state.options) cm.state.options = {};
                            cm.state.options.notifPosition = pos;
                            cm.saveOptions();
                            let posLabels = { 'tl': 'topleft', 'tr': 'topright', 'bl': 'bottomleft', 'br': 'bottomright' };
                            setOutput(`Notification position set to ${posLabels[pos]}.`);
                            if (window.updateOptionsUI) window.updateOptionsUI();
                        } else {
                            setOutput("Usage: msg --position <tl/tr/bl/br>", true);
                        }
                    } else {
                        setOutput("Usage: msg <on/off> | msg track <on/off> | msg -t <short/default/long> | msg send <string> | msg -d <name> | msg clear | msg --position <tl/tr/bl/br>", true);
                    }
                    break;

                case 'net':
                    if (args[1] === 'add' && args[2]) {
                        const url = args[2];
                        let title = url.split('/').pop() || 'Network Audio';
                        const mockFile = { name: title, type: 'audio/mpeg' };
                        // Add directly to PlaylistManager
                        const addedIndex = pm.playlist.length;
                        pm.playlist.push({ file: mockFile, src: url, title: title, artist: '' });

                        // Update activeIndices appropriately
                        if (!pm.isCustomMode) {
                            pm.activeIndices.push(addedIndex);
                        }

                        pc.refreshIndices();
                        setOutput(`Added network track: ${title}`);
                    } else {
                        setOutput("Usage: net add <url>", true);
                    }
                    break;

                case 'play':
                    if (args[1]) {
                        const idx = parseInt(args[1], 10) - 1;
                        if (!isNaN(idx) && idx >= 0 && idx < pm.activeIndices.length) {
                            pm.currentIndex = idx;
                            pc.loadTrack();
                            pc.playAudio();
                            setOutput(`Playing track ${idx + 1}`);
                        } else {
                            setOutput("Invalid track number.", true);
                        }
                    } else {
                        pc.playAudio();
                        setOutput("Resumed playback.");
                    }
                    break;

                case 'pause':
                    pc.pauseAudio();
                    setOutput("Playback paused.");
                    break;

                case 'stop':
                    pc.pauseAudio();
                    pc.seek(0);
                    setOutput("Playback stopped.");
                    break;

                case 'vol':
                    if (args[1] !== undefined) {
                        let volNum = parseInt(args[1], 10);
                        if (!isNaN(volNum)) {
                            volNum = Math.max(0, Math.min(100, volNum));
                            ae.setMuted(false);
                            ae.setVolume(volNum / 100);
                            setOutput(`Volume set to ${volNum}%.`);
                        } else {
                            setOutput("Usage: vol <0-100>", true);
                        }
                    } else {
                        let currentPct = Math.round(ae.getVolume() * 100);
                        let isM = ae.getMuted();
                        setOutput(`Current volume: ${currentPct}%${isM ? ' (muted)' : ''}`);
                    }
                    break;

                case 'dev':
                    if (args[1] === 'on') {
                        cm.state.devMode = true;
                        cm.saveDevMode();
                        setOutput("Developer mode enabled.");
                        pc.refreshDevMode();
                    } else if (args[1] === 'off') {
                        cm.state.devMode = false;
                        cm.saveDevMode();
                        setOutput("Developer mode disabled.");
                        pc.refreshDevMode();
                    } else {
                        setOutput("Usage: dev <on/off>", true);
                    }
                    break;

                case 'config':
                    if (args[1] === 'set' && args[2] && args[3]) {
                        const keys = args[2].split('.');
                        let current = cm.state;
                        for (let i = 0; i < keys.length - 1; i++) {
                            if (current[keys[i]] === undefined) {
                                current[keys[i]] = {};
                            }
                            current = current[keys[i]];
                        }

                        let val = args.slice(3).join(' ');
                        // Type inference
                        if (val === 'true') val = true;
                        else if (val === 'false') val = false;
                        else if (!isNaN(val)) val = parseFloat(val);

                        current[keys[keys.length - 1]] = val;
                        // Depending on the key, we might need to save differently, but typically they go to localStorage
                        // We'll just force a save of common states
                        cm.saveFx();
                        cm.saveDevMode();
                        if (args[2] === 'visualizer') {
                            if (cm.saveVisualizer) cm.saveVisualizer();
                            if (window.updateOptionsUI) window.updateOptionsUI();
                            if (window.updateVisualizerDisplay) window.updateVisualizerDisplay();
                        }
                        pc.refreshFxUI();
                        setOutput(`Config updated: ${args[2]} = ${val}`);
                    } else if (args[1] === 'reset') {
                        localStorage.clear();
                        window.location.reload();
                    } else if (args[1] === 'export') {
                        document.getElementById('dev-export-config')?.click();
                        setOutput("Exporting config...");
                    } else if (args[1] === 'import') {
                        document.getElementById('dev-import-config')?.click();
                        setOutput("Awaiting config import...");
                    } else {
                        setOutput("Usage: config <set/reset/export/import> [key] [value]", true);
                    }
                    break;

                case 'del':
                    if (args[1] === '-p' && args[2]) {
                        const idx = parseInt(args[2], 10) - 1;
                        if (!isNaN(idx) && idx >= 0 && idx < pm.activeIndices.length) {
                            pm.activeIndices.splice(idx, 1);
                            if (pm.currentIndex >= pm.activeIndices.length) pm.currentIndex = Math.max(0, pm.activeIndices.length - 1);
                            pc.refreshIndices();
                            setOutput(`Deleted track ${idx + 1} from playlist.`);
                        } else {
                            setOutput("Invalid playlist track number.", true);
                        }
                    } else if (args[1]) {
                        const idx = parseInt(args[1], 10) - 1;
                        if (!isNaN(idx) && idx >= 0 && idx < pm.playlist.length) {
                            if (pm.removeTrack(idx)) {
                                let activeTrack = pm.getActiveTrack();
                                const audioEl = document.getElementById('audio-local');
                                if (!activeTrack && !audioEl.paused) {
                                    pc.pauseAudio();
                                    audioEl.removeAttribute('src');
                                } else if (activeTrack && activeTrack.src !== audioEl.src) {
                                    pc.pauseAudio();
                                    pc.loadTrack();
                                }
                                pc.refreshIndices();
                                setOutput(`Deleted track ${idx + 1} from global index.`);
                            } else {
                                setOutput("Failed to remove track.", true);
                            }
                        } else {
                            setOutput("Invalid global track number.", true);
                        }
                    } else {
                        setOutput("Usage: del <-p> <index>", true);
                    }
                    break;

                case 'upload':
                    if (args[1] === '-p') {
                        pc.uploadFiles(true);
                        setOutput("Awaiting upload for custom playlist...");
                    } else {
                        pc.uploadFiles(false);
                        setOutput("Awaiting upload for global index...");
                    }
                    break;

                default:
                    setOutput(`Unknown command: ${cmd}`, true);
                    break;
            }
        } catch (e) {
            setOutput(`Error: ${e.message}`, true);
        }
    }

    return {
        init,
        parseCommand,
        setOutput
    };
})();