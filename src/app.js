document.addEventListener("DOMContentLoaded", function() {
    const cm = window.ConfigManager;
    const pm = window.PlaylistManager;
    const ae = window.AudioEngine;
    const ui = window.UIManager;

    const audioEl = document.getElementById('audio-local');
    const dlAddBtn = document.getElementById('music-dl-add');
    const localInput = document.getElementById('local-file-input');
    const folderInput = document.getElementById('local-folder-input');
    const dirBrowserModal = document.getElementById('dir-browser-modal');
    const indexingModal = document.getElementById('indexing-modal');
    const indexingDirPath = document.getElementById('indexing-dir-path');
    const indexingCancelBtn = document.getElementById('indexing-cancel-btn');
    const statusText = document.getElementById('playlist-status-text');
    const searchInput = document.getElementById('search-input');
    const asciiBg = document.getElementById('ascii-bg');
    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');
    const lyricsContent = document.getElementById('lyrics-content');
    const trackTitleDisplay = document.getElementById('track-title');
    const toggleBtn = document.getElementById('music-toggle');

    // Initialize modules
    cm.loadState();
    ae.init(audioEl);
    ui.initTextFilters();

    if (window.UIController) window.UIController.init();
    if (window.VisualEngine) window.VisualEngine.init();
    if (window.ListsManager) window.ListsManager.init();

    // Session Timer
    let sessionPlaybackTime = 0;

    function getSessionTimeStr() {
        const h = Math.floor(sessionPlaybackTime / 3600);
        const m = Math.floor((sessionPlaybackTime % 3600) / 60);
        const s = sessionPlaybackTime % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    window.SessionTimer = {
        getTimeStr: getSessionTimeStr,
        getSeconds: () => sessionPlaybackTime,
        setSeconds: (sec) => { sessionPlaybackTime = sec; }
    };

    setInterval(() => {
        if (audioEl && !audioEl.paused) {
            sessionPlaybackTime++;
        }
    }, 1000);

    // --- Directory Browser Bridge ---
    window.goUpdateDirList = function(path, items) {
        const pathEl = document.getElementById('dir-browser-path');
        const listEl = document.getElementById('dir-browser-list');
        if (pathEl) pathEl.innerText = path;

        let listHtml = '';
        if (path !== '/' && path !== '') {
            listHtml += `<a href="#" class="dir-item" data-isdir="true" data-name="..">[..] (up)</a><br>`;
        }
        for (let item of items) {
            if (item.isDir) {
                listHtml += `<a href="#" class="dir-item" data-isdir="true" data-name="${ui.t(item.name)}">[${ui.t(item.name)}]</a><br>`;
            } else {
                listHtml += `<span style="opacity: 0.5;">${ui.t(item.name)}</span><br>`;
            }
        }
        if (listEl) listEl.innerHTML = listHtml;

        document.querySelectorAll('.dir-item').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                let name = link.getAttribute('data-name');
                if (window.goNavigateDir) {
                    window.goNavigateDir(name);
                }
            });
        });
    };

    const dirBrowserClose = document.getElementById('dir-browser-close');
    if (dirBrowserClose) {
        dirBrowserClose.addEventListener('click', e => {
            e.preventDefault();
            if (dirBrowserModal) {
                dirBrowserModal.style.display = 'none';
                dirBrowserModal.classList.remove('overlay-modal');
            }
        });
    }

    const dirBrowserSelect = document.getElementById('dir-browser-select');
    if (dirBrowserSelect) {
        dirBrowserSelect.addEventListener('click', e => {
            e.preventDefault();
            const pathEl = document.getElementById('dir-browser-path');
            let path = pathEl ? pathEl.innerText : '';
            cm.state.nativeDir = path;
            if (cm.saveNativeDir) cm.saveNativeDir();

            if (window.goSelectDir) {
                window.goSelectDir(path);
            }
            if (dirBrowserModal) {
                dirBrowserModal.style.display = 'none';
                dirBrowserModal.classList.remove('overlay-modal');
            }
        });
    }

    // Auto-load saved native directory
    setTimeout(() => {
        if (cm.state.nativeDir && window.goSelectDir) {
            window.goSelectDir(cm.state.nativeDir);
        } else if (window.goGetDefaultDir) {
            window.goGetDefaultDir().then(defaultDir => {
                if (window.goSelectDir) {
                    window.goSelectDir(defaultDir);
                }
            });
        }
    }, 1000);

    // --- Indexing Modal Callbacks ---
    window.onIndexingStart = function(dirPath) {
        if (indexingDirPath) {
            indexingDirPath.innerText = dirPath || cm.state.nativeDir || '/';
        }
        if (indexingModal) {
            indexingModal.style.display = 'flex';
        }
    };

    let initialRestoreAttempted = false;
    let pendingRestoreTime = null;
    let lastSaveTime = 0;

    window.addEventListener('beforeunload', () => {
        if (window.PlayerController) window.PlayerController.saveCurrentQueueState();
    });
    window.addEventListener('pagehide', () => {
        if (window.PlayerController) window.PlayerController.saveCurrentQueueState();
    });

    async function attemptRestoreLastQueuePosition() {
        if (initialRestoreAttempted) return;
        if (cm.state.firstRun !== false) return;
        if (cm.state.options && cm.state.options.rememberLastQueue === false) return;
        if (pm.playlist.length === 0) return;

        initialRestoreAttempted = true;

        try {
            const qs = cm.state.queueState;
            if (!qs || !qs.currentTrackPath) {
                pm.resetQueueAndPosition();
                if (window.PlayerController) {
                    window.PlayerController.loadTrack();
                    if (cm.state.options && cm.state.options.autoPlayAtStartup) {
                        window.PlayerController.playAudio();
                    }
                }
                return;
            }

            let currentGIdx = pm.playlist.findIndex(t => t.originalPath === qs.currentTrackPath);
            if (currentGIdx === -1) {
                cm.saveQueueState(null);
                if (pm.playlist.length > 0) {
                    pm.resetQueueAndPosition();
                    if (window.PlayerController) {
                        window.PlayerController.loadTrack();
                        if (cm.state.options && cm.state.options.autoPlayAtStartup) {
                            window.PlayerController.playAudio();
                        }
                    }
                }
                return;
            }

            if (qs.isCustomMode && Array.isArray(qs.activeIndicesPaths) && qs.activeIndicesPaths.length > 0) {
                let restoredActive = qs.activeIndicesPaths
                    .map(p => pm.playlist.findIndex(t => t.originalPath === p))
                    .filter(idx => idx !== -1);
                if (restoredActive.length > 0) {
                    pm.activeIndices = restoredActive;
                    pm.isCustomMode = true;
                    pm.activePlaylistName = qs.activePlaylistName || null;
                }
            } else {
                pm.isCustomMode = false;
                pm.activePlaylistName = null;
            }

            pm.isShuffle = !!qs.isShuffle;
            const shuffleBtn = document.getElementById('music-shuffle');
            if (shuffleBtn) {
                shuffleBtn.innerText = pm.isShuffle ? ui.t('[shuffle (x)]') : ui.t('[shuffle ( )]');
            }

            pm.currentGlobalIdx = currentGIdx;

            if (Array.isArray(qs.manualQueuePaths)) {
                let restoredManual = qs.manualQueuePaths
                    .map(p => pm.playlist.findIndex(t => t.originalPath === p))
                    .filter(idx => idx !== -1);
                pm.manualQueue.length = 0;
                pm.manualQueue.push(...restoredManual);
            }

            if (Array.isArray(qs.historyPaths)) {
                let restoredHist = qs.historyPaths
                    .map(p => pm.playlist.findIndex(t => t.originalPath === p))
                    .filter(idx => idx !== -1);
                pm.history.length = 0;
                pm.history.push(...restoredHist);
            }

            if (Array.isArray(qs.upcomingQueuePaths) && qs.upcomingQueuePaths.length > 0) {
                let restoredUpcoming = qs.upcomingQueuePaths
                    .map(p => pm.playlist.findIndex(t => t.originalPath === p))
                    .filter(idx => idx !== -1);
                if (restoredUpcoming.length > 0) {
                    pm.upcomingQueue.length = 0;
                    pm.upcomingQueue.push(...restoredUpcoming);
                }
            }

            if (qs.currentTime > 0) {
                pendingRestoreTime = qs.currentTime;
            }

            if (window.UIController) {
                window.UIController.updateNowPlayingHeader();
                window.UIController.refreshIndices();
                if (searchInput && searchInput.value) window.UIController.executeSearch();
            }
            if (window.PlayerController) {
                window.PlayerController.loadTrack();
                if (cm.state.options && cm.state.options.autoPlayAtStartup) {
                    window.PlayerController.playAudio();
                }
            }
        } catch (err) {
            console.warn("Error restoring last queue position:", err);
        }
    }

    window.onIndexingComplete = function() {
        if (indexingModal) {
            indexingModal.style.display = 'none';
        }
        if (!initialRestoreAttempted && cm.state.firstRun === false) {
            if (cm.state.options && cm.state.options.rememberLastQueue !== false) {
                attemptRestoreLastQueuePosition();
            } else if (pm.playlist.length > 0) {
                pm.resetQueueAndPosition();
                if (window.PlayerController) {
                    window.PlayerController.loadTrack();
                    if (cm.state.options && cm.state.options.autoPlayAtStartup) {
                        window.PlayerController.playAudio();
                    }
                }
            }
        }
    };

    if (indexingCancelBtn) {
        indexingCancelBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (window.goCancelIndexing) {
                window.goCancelIndexing();
            }
            window.liveClearPlaylist();
            if (window.PlayerController) window.PlayerController.pauseAudio();
            if (audioEl) audioEl.removeAttribute('src');
            if (indexingModal) {
                indexingModal.style.display = 'none';
            }
            if (trackTitleDisplay) {
                trackTitleDisplay.innerText = ui.t("No songs indexed. Please select a directory in [ opt +] to automatically index");
            }
        });
    }

    // Go -> JS Push Notification
    window.liveAddTrack = function(trackInfo) {
        pm.addNativeTrack(trackInfo, (wasEmpty) => {
            if (statusText) statusText.innerText = "";
            if (window.UIController) {
                window.UIController.refreshIndices();
                if (searchInput && searchInput.value) window.UIController.executeSearch();
            }

            if (wasEmpty && window.PlayerController) {
                window.PlayerController.loadTrack();
                if (cm.state.options && cm.state.options.autoPlayAtStartup) {
                    window.PlayerController.playAudio();
                }
            }
        });
    };

    window.liveAddTracks = function(trackInfos) {
        if (!trackInfos || trackInfos.length === 0) return;
        let wasEmpty = pm.playlist.length === 0;

        window._suppressPlaylistReset = true;
        for (let track of trackInfos) {
            pm.addNativeTrack(track, null);
        }
        window._suppressPlaylistReset = false;
        pm.activeIndices = Array.from({ length: pm.playlist.length }, (_, i) => i);
        pm.isCustomMode = false;
        if (wasEmpty) pm.resetQueueAndPosition();

        if (statusText) statusText.innerText = "";
        if (window.UIController) {
            window.UIController.refreshIndices();
            if (searchInput && searchInput.value) window.UIController.executeSearch();
        }

        if (wasEmpty && pm.playlist.length > 0) {
            if (!initialRestoreAttempted && cm.state.firstRun === false) {
                if (cm.state.options && cm.state.options.rememberLastQueue !== false) {
                    attemptRestoreLastQueuePosition();
                } else {
                    pm.resetQueueAndPosition();
                    if (window.PlayerController) {
                        window.PlayerController.loadTrack();
                        if (cm.state.options && cm.state.options.autoPlayAtStartup) {
                            window.PlayerController.playAudio();
                        }
                    }
                }
            }
        }
    };

    window.liveClearPlaylist = function() {
        initialRestoreAttempted = false;
        pm.activeIndices = [];
        pm.playlist.length = 0;
        pm.activePlaylistName = null;
        pm.resetQueueAndPosition();
        if (window.UIController) {
            window.UIController.updateNowPlayingHeader();
            window.UIController.refreshIndices();
        }
    };

    function handleFileSelection(files) {
        if (files.length > 0) {
            pm.addFiles(files, (wasEmpty) => {
                if (statusText) statusText.innerText = "";
                if (window.UIController) {
                    window.UIController.refreshIndices();
                    if (searchInput && searchInput.value) window.UIController.executeSearch();
                }

                if (wasEmpty && window.PlayerController) {
                    window.PlayerController.loadTrack();
                    window.PlayerController.playAudio();
                }
            });
        }
    }

    if (localInput) {
        localInput.onchange = e => {
            handleFileSelection(e.target.files);
            localInput.value = '';
        };
    }

    if (folderInput) {
        folderInput.onchange = e => {
            handleFileSelection(e.target.files);
            folderInput.value = '';
        };
    }

    // Audio Event Handlers
    if (audioEl) {
        audioEl.addEventListener('loadedmetadata', () => {
            function formatTime(seconds) {
                if (isNaN(seconds)) return "0:00";
                const mins = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return mins + ":" + (secs < 10 ? "0" : "") + secs;
            }

            if (timeTotal) timeTotal.innerText = formatTime(audioEl.duration);
            if (pendingRestoreTime !== null && audioEl.duration) {
                audioEl.currentTime = Math.min(pendingRestoreTime, audioEl.duration);
                pendingRestoreTime = null;
            }
            let track = pm.getActiveTrack();
            if (track && audioEl.duration) {
                track.duration = audioEl.duration;
                ae.fetchLyrics(
                    track.title,
                    () => {},
                    (plain, isSynced = true) => {
                        if (lyricsContent) {
                            if (isSynced) lyricsContent.innerHTML = ui.t("synced lyrics loaded.\nplay track to scroll.");
                            else lyricsContent.innerText = ui.t(`+-- plain lyrics --------------+\n\n${plain}\n\n+------------------------------+`);
                        }
                    },
                    () => {},
                    () => {},
                    track.artist || '',
                    audioEl.duration
                );
            }
        });

        audioEl.addEventListener('timeupdate', () => {
            function formatTime(seconds) {
                if (isNaN(seconds)) return "0:00";
                const mins = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return mins + ":" + (secs < 10 ? "0" : "") + secs;
            }

            if (audioEl.duration) {
                if (window.UIController) {
                    window.UIController.updateAsciiBar(audioEl.currentTime / audioEl.duration);
                    window.UIController.updateLyricsScroll();
                }
                if (timeCurrent) timeCurrent.innerText = formatTime(audioEl.currentTime);
                if (window.goUpdateMprisPosition) window.goUpdateMprisPosition(audioEl.currentTime);

                const now = Date.now();
                if (now - lastSaveTime > 3000) {
                    lastSaveTime = now;
                    if (window.PlayerController) window.PlayerController.saveCurrentQueueState();
                }
            }
        });

        audioEl.addEventListener('ended', () => {
            if (window.PlayerController) window.PlayerController.nextTrack();
        });

        audioEl.addEventListener('error', () => {
            const err = audioEl.error;
            let errMsg = "Unknown audio error";
            if (err) {
                switch (err.code) {
                    case err.MEDIA_ERR_ABORTED: errMsg = "Audio playback aborted"; break;
                    case err.MEDIA_ERR_NETWORK: errMsg = "Audio network error"; break;
                    case err.MEDIA_ERR_DECODE: errMsg = "Audio decode error"; break;
                    case err.MEDIA_ERR_SRC_NOT_SUPPORTED: errMsg = "Audio format or sink unavailable"; break;
                }
            }
            console.error("Audio element error:", errMsg, err);
            if (trackTitleDisplay) trackTitleDisplay.innerText = ui.t(errMsg);
            if (toggleBtn) toggleBtn.innerText = ui.t('[play]');
            if (ui && ui.showNotification) {
                ui.showNotification(`Playback error: ${errMsg}`);
            }
            if (window.PlayerController) window.PlayerController.pauseAudio();
        });
    }

    // Background animation loop
    if (asciiBg) {
        setInterval(() => ui.drawBg(asciiBg, cm.state), 65);
    }

    // Notification Timers
    function getRandomInterval(minMins, maxMins) {
        return (Math.random() * (maxMins - minMins) + minMins) * 60000;
    }

    function scheduleTimeNotification() {
        setTimeout(() => {
            if (window.CommandPalette && window.SessionTimer) {
                window.CommandPalette.setOutput(`you have been listening for ${window.SessionTimer.getTimeStr()} :3`);
            }
            scheduleTimeNotification();
        }, getRandomInterval(5, 15));
    }

    const HINTS = [
        "there are many easter eggs you can find",
        "You can make a custom queue by pressing [middle click] on a song",
        "try out different theme combinations!",
        "does anyone even look at these?",
        "you can mute notifications (including these hints) in [opt +]."
    ];

    function scheduleHintNotification() {
        setTimeout(() => {
            if (cm.state.options && cm.state.options.hintsNotif) {
                if (window.CommandPalette) {
                    const randomHint = HINTS[Math.floor(Math.random() * HINTS.length)];
                    window.CommandPalette.setOutput(`hint: ${randomHint}`);
                }
            }
            scheduleHintNotification();
        }, getRandomInterval(5, 15));
    }

    // Version check & patch notes notification
    const CURRENT_VERSION = "0.0.64";
    const lastSeenVer = localStorage.getItem('svmp_last_seen_version');
    if (lastSeenVer === null) {
        localStorage.setItem('svmp_last_seen_version', CURRENT_VERSION);
    } else if (lastSeenVer !== CURRENT_VERSION) {
        localStorage.setItem('svmp_last_seen_version', CURRENT_VERSION);
        setTimeout(() => {
            if (ui && ui.showNotification) {
                ui.showNotification(`SvMP has been updated to ${CURRENT_VERSION}-LQM. Click to see changes.`, () => {
                    if (window.UIController) window.UIController.closeAllModalsAndMenus();
                    const pModal = document.getElementById('patch-notes-modal');
                    if (pModal) pModal.style.display = 'block';
                });
            }
        }, 1000);
    }

    const versionLink = document.getElementById('version-patch-link');
    if (versionLink) {
        versionLink.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            if (window.UIController) window.UIController.closeAllModalsAndMenus();
            const pModal = document.getElementById('patch-notes-modal');
            if (pModal) pModal.style.display = 'block';
        });
    }

    // Boot up UI render
    if (window.UIController) {
        window.UIController.updateNowPlayingHeader();
        window.UIController.updateOptionsUI();
        window.UIController.updateFxUI();
        window.UIController.refreshIndices();
    }
    if (window.VisualEngine) {
        window.VisualEngine.updateClock();
        window.VisualEngine.updateTimebarDisplay();
    }

    // Trigger default greeting notification
    setTimeout(() => {
        if (window.CommandPalette) {
            window.CommandPalette.parseCommand("msg -d hello");
        }
        scheduleTimeNotification();
        scheduleHintNotification();
    }, 750);
});
