window.PlayerController = (function() {
    const cm = window.ConfigManager;
    const pm = window.PlaylistManager;
    const ae = window.AudioEngine;
    const ui = window.UIManager;

    let marqueeInterval = null;
    let fullTitleString = "";
    let consecutiveErrorCount = 0;

    function getAudioEl() {
        return document.getElementById('audio-local');
    }

    function getToggleBtn() {
        return document.getElementById('music-toggle');
    }

    function getTrackTitleDisplay() {
        return document.getElementById('track-title');
    }

    function updateMarquee() {
        const audioEl = getAudioEl();
        const trackTitleDisplay = getTrackTitleDisplay();
        if (!fullTitleString || (audioEl && audioEl.paused) || !trackTitleDisplay) return;
        if (fullTitleString.length <= 20) return;

        fullTitleString = fullTitleString.substring(1) + fullTitleString[0];

        let trackNumDisplay = pm.currentIndex + 1;
        let totalDisplay = pm.activeIndices.length;

        let displayStr = fullTitleString;

        trackTitleDisplay.innerHTML = `${ui.t(displayStr)} <span style="color: var(--prompt-color); font-size: 0.9em;">[${trackNumDisplay}/${totalDisplay}]</span>`;
    }

    function startMarquee() {
        clearInterval(marqueeInterval);
        let speed = 400;
        if (cm.state.options) {
            if (cm.state.options.marqueeSpeed === 'slow') speed = 800;
            else if (cm.state.options.marqueeSpeed === 'fast') speed = 150;
        }
        marqueeInterval = setInterval(updateMarquee, speed);
    }

    function stopMarquee() {
        clearInterval(marqueeInterval);
        const trackTitleDisplay = getTrackTitleDisplay();
        if (pm.getActiveTrack() && trackTitleDisplay) {
            let trackNumDisplay = pm.currentIndex + 1;
            let totalDisplay = pm.activeIndices.length;

            let displayStr = pm.getActiveTrack().title;
            fullTitleString = displayStr + " *** ";

            trackTitleDisplay.innerHTML = `${ui.t(displayStr)} <span style="color: var(--prompt-color); font-size: 0.9em;">[${trackNumDisplay}/${totalDisplay}]</span>`;
        }
    }

    async function fetchOnlineTrackMetadata(track) {
        if (!track) return null;
        if (track._fetchedOnlineMetadata) return track;
        track._fetchedOnlineMetadata = true;

        let targetTitle = track.title || track.originalName || '';
        let targetArtist = track.artist || '';

        targetTitle = targetTitle.replace(/\.(mp3|flac|wav|ogg|m4a)$/i, '').trim();

        let query = (targetArtist && targetArtist.toLowerCase() !== 'unknown') ? `${targetArtist} ${targetTitle}` : targetTitle;
        if (!query) return track;

        try {
            let resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`);
            let data = await resp.json();

            if (data && data.results && data.results.length > 0) {
                let bestMatch = data.results[0];
                if (targetArtist && targetArtist.toLowerCase() !== 'unknown') {
                    let match = data.results.find(r =>
                        r.artistName && r.artistName.toLowerCase().includes(targetArtist.toLowerCase())
                    );
                    if (match) bestMatch = match;
                }

                if (bestMatch) {
                    if ((!track.artist || track.artist.toLowerCase() === 'unknown' || track.artist === '') && bestMatch.artistName) {
                        track.artist = bestMatch.artistName;
                    }
                    if ((!track.album || track.album.toLowerCase() === 'unknown' || track.album === '') && bestMatch.collectionName) {
                        track.album = bestMatch.collectionName;
                    }
                    if ((!track.title || track.title.toLowerCase() === 'unknown' || track.title === '') && bestMatch.trackName) {
                        track.title = bestMatch.trackName;
                    }

                    if (bestMatch.artworkUrl100) {
                        track.onlineArtUrl = bestMatch.artworkUrl100.replace('100x100bb', '600x600bb').replace('100x100', '600x600');
                    }
                }
            }
        } catch (e) {
            console.warn("iTunes online metadata lookup failed:", e);
        }
        return track;
    }

    function loadTrack() {
        clearInterval(marqueeInterval);
        let track = pm.getActiveTrack();

        if (window.WindowSync && !window.WindowSync.isReceivingRemote()) {
            window.WindowSync.broadcastState('SYNC_TRACK_LOAD', { globalIdx: pm.currentGlobalIdx });
        }

        const audioEl = getAudioEl();
        const trackTitleDisplay = getTrackTitleDisplay();
        const timeCurrent = document.getElementById('time-current');
        const timeTotal = document.getElementById('time-total');
        const favBtn = document.getElementById('music-fav');
        const lyricsContent = document.getElementById('lyrics-content');

        if (track && cm.state.options && cm.state.options.trackNotif) {
            let notifStr = `${track.title}`;
            if (track.artist) notifStr = `${track.artist} - ${track.title}`;
            ui.showNotification(`now playing: ${notifStr}`, null, 'track');
        }

        let initialArtUrl = track ? (track.onlineArtUrl || '') : '';
        if (window.goUpdateMprisMetadata && track) {
            window.goUpdateMprisMetadata(track.title || "Unknown Title", track.artist || "Unknown Artist", track.originalPath || "", initialArtUrl);
        }

        if (track && (!track.artist || track.artist.toLowerCase() === 'unknown' || !track.album || track.album.toLowerCase() === 'unknown' || !track.onlineArtUrl)) {
            fetchOnlineTrackMetadata(track).then(() => {
                let currentTrack = pm.getActiveTrack();
                if (currentTrack && currentTrack === track) {
                    if (window.goUpdateMprisMetadata) {
                        let updatedArt = track.onlineArtUrl || '';
                        window.goUpdateMprisMetadata(track.title || "Unknown Title", track.artist || "Unknown Artist", track.originalPath || "", updatedArt);
                    }
                    if (trackTitleDisplay && pm.currentIndex >= 0) {
                        let trackNumDisplay = pm.currentIndex + 1;
                        let totalDisplay = pm.activeIndices.length;
                        fullTitleString = track.title + " *** ";
                        trackTitleDisplay.innerHTML = `${ui.t(track.title)} <span style="color: var(--prompt-color); font-size: 0.9em;">[${trackNumDisplay}/${totalDisplay}]</span>`;
                    }
                    if (window.UIController) window.UIController.refreshIndices();
                }
            });
        }

        if (!track) {
            if (trackTitleDisplay) trackTitleDisplay.innerHTML = ui.t(`no local tracks mapped to RAM.`);
            if (window.UIController) window.UIController.updateAsciiBar(0);
            if (timeCurrent) timeCurrent.innerText = "0:00";
            if (timeTotal) timeTotal.innerText = "0:00";
            if (audioEl) audioEl.removeAttribute('src');
            return;
        }

        if (audioEl) audioEl.src = track.src;

        let trackNumDisplay = pm.currentIndex + 1;
        let totalDisplay = pm.activeIndices.length;

        fullTitleString = track.title + " *** ";

        let initialDisplay = track.title;
        if (trackTitleDisplay) {
            trackTitleDisplay.innerHTML = `${ui.t(initialDisplay)} <span style="color: var(--prompt-color); font-size: 0.9em;">[${trackNumDisplay}/${totalDisplay}]</span>`;
        }

        if (window.UIController) window.UIController.updateAsciiBar(0);
        if (timeCurrent) timeCurrent.innerText = "0:00";
        if (timeTotal) timeTotal.innerText = "0:00";

        if (favBtn) {
            if (window.goIsFavorite && track.originalPath) {
                Promise.resolve(window.goIsFavorite(track.originalPath)).then(isFav => {
                    favBtn.innerText = isFav ? ui.t('[fav (x)]') : ui.t('[fav ( )]');
                }).catch(() => {
                    favBtn.innerText = ui.t('[fav ( )]');
                });
            } else {
                favBtn.innerText = ui.t('[fav ( )]');
            }
        }

        if (lyricsContent) {
            ae.fetchLyrics(
                track.title,
                (name) => { lyricsContent.innerText = ui.t(`fetching lyrics for:\n${name}\n...`); },
                (plain, isSynced = true) => {
                    if (isSynced) lyricsContent.innerHTML = ui.t("synced lyrics loaded.\nplay track to scroll.");
                    else lyricsContent.innerText = ui.t(`+-- plain lyrics --------------+\n\n${plain}\n\n+------------------------------+`);
                },
                () => { lyricsContent.innerText = ui.t("error connecting to lyrics database."); },
                () => { lyricsContent.innerText = ui.t("no lyrics found in external database.\n(custom/indie tracks often return empty)"); },
                track.artist || '',
                (audioEl ? audioEl.duration : 0) || track.duration || 0
            );
        }
    }

    function playAudio() {
        const audioEl = getAudioEl();
        const toggleBtn = getToggleBtn();
        const trackTitleDisplay = getTrackTitleDisplay();

        if (!pm.getActiveTrack()) return;
        let activeTrack = pm.getActiveTrack();
        if (activeTrack && activeTrack.originalPath && window.goAddToRecents) {
            window.goAddToRecents(activeTrack.originalPath);
            if (window.ListsManager && window.ListsManager.currentListsView === 'playlist' && window.ListsManager.currentViewingPlaylist === 'recents') {
                window.ListsManager.renderPlaylistTracks();
            }
        }
        ae.initAudioAPI(cm.state.eq);
        try {
            let p = ae.play();
            if (window.WindowSync && !window.WindowSync.isReceivingRemote()) {
                const audioEl = getAudioEl();
                window.WindowSync.broadcastState('SYNC_PLAYBACK_STATE', {
                    paused: false,
                    currentTime: audioEl ? audioEl.currentTime : 0
                });
            }
            if (p !== undefined && p !== null) {
                p.then(() => {
                    consecutiveErrorCount = 0;
                    if (toggleBtn) toggleBtn.innerText = ui.t('[pause]');
                    if (window.VisualEngine) window.VisualEngine.updateVisualizerDisplay();
                    startMarquee();
                    if (window.goUpdateMprisStatus) window.goUpdateMprisStatus("Playing");
                }).catch(error => {
                    console.error("Audio playback failed:", error);
                    if (trackTitleDisplay) trackTitleDisplay.innerText = ui.t("Error loading audio file or missing audio sink");
                    if (toggleBtn) toggleBtn.innerText = ui.t('[play]');

                    let isSkipped = cm.state.options && cm.state.options.disableErrorSkip;
                    if (!isSkipped) {
                        consecutiveErrorCount++;
                        if (consecutiveErrorCount > 3) {
                            ui.showNotification("Playback errors occurred consecutively. Stopping playback.");
                            pauseAudio();
                            if (audioEl) audioEl.removeAttribute('src');
                        } else {
                            ui.showNotification("Playback encountered an error, skipping.");
                            nextTrack();
                        }
                    } else {
                        pauseAudio();
                    }
                });
            }
        } catch (err) {
            console.error("Audio play exception:", err);
            if (toggleBtn) toggleBtn.innerText = ui.t('[play]');
        }
    }

    function pauseAudio() {
        const toggleBtn = getToggleBtn();
        ae.pause();
        if (window.WindowSync && !window.WindowSync.isReceivingRemote()) {
            const audioEl = getAudioEl();
            window.WindowSync.broadcastState('SYNC_PLAYBACK_STATE', {
                paused: true,
                currentTime: audioEl ? audioEl.currentTime : 0
            });
        }
        if (toggleBtn) toggleBtn.innerText = ui.t('[play]');
        if (window.VisualEngine) window.VisualEngine.updateVisualizerDisplay();
        stopMarquee();
        if (window.goUpdateMprisStatus) window.goUpdateMprisStatus("Paused");
    }

    function nextTrack(isUserAction = false) {
        if (isUserAction) consecutiveErrorCount = 0;
        if (pm.activeIndices.length === 0) return;

        pm.nextTrack();

        loadTrack();
        if (window.UIController) window.UIController.refreshIndices();

        const toggleBtn = getToggleBtn();
        if (toggleBtn && toggleBtn.innerText.includes('pause')) playAudio();
    }

    function prevTrack() {
        consecutiveErrorCount = 0;
        if (pm.activeIndices.length === 0) return;

        pm.prevTrack();

        loadTrack();
        if (window.UIController) window.UIController.refreshIndices();

        const toggleBtn = getToggleBtn();
        if (toggleBtn && toggleBtn.innerText.includes('pause')) playAudio();
    }

    function playRandomTrack() {
        consecutiveErrorCount = 0;
        if (pm.activeIndices.length === 0) return;
        if (pm.activeIndices.length > 1) {
            let newIndex;
            let currentGlobal = pm.currentGlobalIdx;
            do {
                newIndex = pm.activeIndices[Math.floor(Math.random() * pm.activeIndices.length)];
            } while (newIndex === currentGlobal && pm.activeIndices.length > 1);
            pm.playTrackByGlobalIndex(newIndex);
        }
        loadTrack();
        if (window.UIController) window.UIController.refreshIndices();

        const toggleBtn = getToggleBtn();
        if (toggleBtn && toggleBtn.innerText.includes('pause')) playAudio();
    }

    function uploadFiles(toPlaylist) {
        const statusText = document.getElementById('playlist-status-text');
        let tempInput = document.createElement('input');
        tempInput.type = 'file';
        tempInput.accept = 'audio/*';
        tempInput.multiple = true;

        tempInput.onchange = e => {
            if (e.target.files.length > 0) {
                if (toPlaylist) window._suppressPlaylistReset = true;

                pm.addFiles(e.target.files, (wasEmpty, newlyAddedIndices) => {
                    window._suppressPlaylistReset = false;
                    if (toPlaylist) {
                        if (!pm.isCustomMode) {
                            pm.isCustomMode = true;
                        }
                        pm.activeIndices.push(...newlyAddedIndices);
                    }

                    if (statusText) statusText.innerText = "";
                    if (window.UIController) window.UIController.refreshIndices();

                    if (wasEmpty || (toPlaylist && pm.activeIndices.length === newlyAddedIndices.length)) {
                        if (toPlaylist) pm.currentIndex = Math.max(0, pm.activeIndices.length - newlyAddedIndices.length);
                        else pm.currentIndex = 0;
                        loadTrack();
                        playAudio();
                    }
                });
            }
        };
        tempInput.click();
    }

    function toggleFetch() {
        const fetchEl = document.getElementById('fetch-display');
        if (fetchEl && (fetchEl.style.display === 'block' || fetchEl.style.display === 'flex')) {
            fetchEl.style.display = 'none';
            return;
        }

        const cmdPal = document.getElementById('cmd-palette');
        if (cmdPal) cmdPal.style.display = 'none';

        function escapeHtml(str) {
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        if (window.goFetchSystemInfo) {
            const res = window.goFetchSystemInfo();
            const processResult = (rawOutput) => {
                if (!rawOutput || !rawOutput.trim()) {
                    if (ui && ui.showNotification) {
                        ui.showNotification("No fetch utility found (hyfetch, fastfetch, neofetch required)");
                    }
                    return;
                }

                const cleanText = rawOutput.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
                const lines = cleanText.split('\n');

                let osLineFound = false;
                let htmlLines = lines.map(line => {
                    if (!osLineFound && /OS:/i.test(line)) {
                        osLineFound = true;
                        const replaced = escapeHtml(line).replace(/(OS:)/i, '$1 <a href="#" id="fetch-close-btn" style="color: var(--text-color); text-decoration: none; cursor: pointer;">[ x ]</a>');
                        return `<div>${replaced}</div>`;
                    }
                    return `<div>${escapeHtml(line)}</div>`;
                });

                if (!osLineFound && htmlLines.length > 0) {
                    htmlLines[0] = `<div><a href="#" id="fetch-close-btn" style="color: var(--text-color); text-decoration: none; cursor: pointer;">[ x ]</a> ${htmlLines[0]}</div>`;
                }

                let el = document.getElementById('fetch-display');
                if (!el) {
                    el = document.createElement('div');
                    el.id = 'fetch-display';
                    const playerContainer = document.querySelector('.player-container');
                    if (playerContainer) playerContainer.appendChild(el);
                    else document.body.appendChild(el);
                }

                el.innerHTML = htmlLines.join('');
                el.style.display = 'block';

                const closeBtn = document.getElementById('fetch-close-btn');
                if (closeBtn) {
                    closeBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        el.style.display = 'none';
                    });
                }
            };

            if (res && typeof res.then === 'function') {
                res.then(processResult);
            } else {
                processResult(res);
            }
        } else {
            if (ui && ui.showNotification) {
                ui.showNotification("No fetch utility found (hyfetch, fastfetch, neofetch required)");
            }
        }
    }

    // Define PlayerController interface
    const controller = {
        playAudio,
        pauseAudio,
        togglePlay: () => {
            const audioEl = getAudioEl();
            if (audioEl && audioEl.paused) {
                if (pm.getActiveTrack()) playAudio();
            } else {
                pauseAudio();
            }
        },
        next: () => nextTrack(true),
        prev: () => prevTrack(),
        nextTrack,
        prevTrack,
        playRandomTrack,
        loadTrack,
        seek: (time) => {
            const audioEl = getAudioEl();
            if (audioEl && audioEl.duration) {
                audioEl.currentTime = time;
                if (window.goUpdateMprisSeeked) window.goUpdateMprisSeeked(audioEl.currentTime);
            }
        },
        seekRelative: (offset) => {
            const audioEl = getAudioEl();
            if (audioEl && audioEl.duration) {
                audioEl.currentTime += offset;
                if (window.goUpdateMprisSeeked) window.goUpdateMprisSeeked(audioEl.currentTime);
            }
        },
        refreshIndices: () => {
            if (window.UIController) window.UIController.refreshIndices();
        },
        refreshFxUI: () => {
            if (window.UIController) window.UIController.updateFxUI();
        },
        updateExpieUI: () => {
            if (window.VisualEngine) window.VisualEngine.updateExpieUI();
        },
        triggerUwu: () => {
            cm.state.isUwu = true;
            cm.state.fx.kawaii = true;
            cm.state.charOverride = " uwonyx3^~";
            cm.saveFx();
            if (window.UIController) {
                window.UIController.updateFxUI();
                ui.renderDomTextFilters();
                window.UIController.refreshIndices();
            }
            loadTrack();
        },
        toggleRgb: () => {
            cm.state.fx.rgb = !cm.state.fx.rgb;
            cm.saveFx();
            if (window.UIController) window.UIController.updateFxUI();
        },
        toggleTrip: () => {
            cm.state.fx.maxTrip = !cm.state.fx.maxTrip;
            cm.saveFx();
            if (window.UIController) window.UIController.updateFxUI();
        },
        toggleScp: () => {
            if (window.UIController) window.UIController.toggleScp();
        },
        triggerGrubError: () => {
            document.body.innerHTML = "<div style='color: #cccccc; background-color: #000000; font-family: monospace; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999999; padding: 10px; box-sizing: border-box;'>error: cannot boot: vmlinuz not found</div>";
        },
        refreshDevMode: () => {
            const devModal = document.getElementById('dev-modal');
            if (!cm.state.devMode && devModal) devModal.style.display = 'none';
        },
        toggleFetch: () => toggleFetch(),
        uploadFiles: (toPlaylist) => uploadFiles(toPlaylist),
        startMarquee,
        stopMarquee,
        fetchOnlineTrackMetadata
    };

    return controller;
})();
