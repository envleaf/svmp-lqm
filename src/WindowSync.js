window.WindowSync = (function() {
    const CHANNEL_NAME = 'svmp_window_sync';
    let channel = null;
    let windowId = 'win_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    let masterId = null;
    let isMaster = false;
    let heartbeatTimer = null;
    let masterTimeoutTimer = null;

    function init() {
        if (!('BroadcastChannel' in window)) {
            console.warn('BroadcastChannel not supported in this browser.');
            return;
        }

        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = handleMessage;

        // Announce presence to ask existing windows for state
        postMessage('ANNOUNCE', { windowId });

        // Wait brief window to see if an existing master answers
        setTimeout(() => {
            if (!masterId) {
                claimMaster();
            } else {
                muteIfSecondary();
            }
        }, 300);

        heartbeatTimer = setInterval(sendHeartbeat, 1000);

        // Listen to local audio events
        hookLocalEvents();
    }

    function postMessage(type, payload = {}) {
        if (!channel) return;
        try {
            channel.postMessage({
                type: type,
                sender: windowId,
                payload: payload,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error('Error posting WindowSync message:', e);
        }
    }

    function claimMaster() {
        isMaster = true;
        masterId = windowId;
        unmuteLocalAudio();
        postMessage('CLAIM_MASTER', { windowId });
    }

    function sendHeartbeat() {
        if (isMaster) {
            postMessage('HEARTBEAT', { windowId });
        }
    }

    function resetMasterTimeout() {
        if (masterTimeoutTimer) clearTimeout(masterTimeoutTimer);
        masterTimeoutTimer = setTimeout(() => {
            if (!isMaster) {
                // Master timed out or closed, claim master
                claimMaster();
            }
        }, 2500);
    }

    function muteIfSecondary() {
        const audioEl = document.getElementById('audio-local');
        if (!audioEl) return;
        if (!isMaster) {
            audioEl.muted = true;
        }
    }

    function unmuteLocalAudio() {
        const audioEl = document.getElementById('audio-local');
        if (!audioEl) return;
        const ae = window.AudioEngine;
        if (ae) {
            audioEl.muted = ae.isMuted();
        } else {
            audioEl.muted = false;
        }
    }

    function handleMessage(event) {
        const msg = event.data;
        if (!msg || msg.sender === windowId) return;

        switch (msg.type) {
            case 'CLAIM_MASTER':
                if (msg.payload.windowId !== windowId) {
                    isMaster = false;
                    masterId = msg.payload.windowId;
                    muteIfSecondary();
                    resetMasterTimeout();
                }
                break;

            case 'HEARTBEAT':
                if (msg.payload.windowId !== windowId) {
                    masterId = msg.payload.windowId;
                    if (isMaster && msg.sender < windowId) {
                        isMaster = false;
                        muteIfSecondary();
                    }
                    resetMasterTimeout();
                }
                break;

            case 'ANNOUNCE':
                if (isMaster) {
                    postMessage('CLAIM_MASTER', { windowId });
                    broadcastFullState();
                }
                break;

            case 'SYNC_PLAYBACK_STATE':
                applyPlaybackState(msg.payload);
                break;

            case 'SYNC_TRACK_LOAD':
                applyTrackLoad(msg.payload);
                break;

            case 'SYNC_SEEK':
                applySeek(msg.payload);
                break;

            case 'SYNC_VOLUME':
                applyVolume(msg.payload);
                break;

            case 'SYNC_FX':
                applyFx(msg.payload);
                break;

            case 'SYNC_EQ':
                applyEq(msg.payload);
                break;

            case 'SYNC_OPTIONS':
                applyOptions(msg.payload);
                break;

            case 'SYNC_QUEUE':
                applyQueue(msg.payload);
                break;

            case 'SYNC_PLAYLIST_LISTS':
                applyPlaylistLists(msg.payload);
                break;
        }
    }

    let isReceivingRemote = false;

    function runRemoteAction(fn) {
        isReceivingRemote = true;
        try {
            fn();
        } finally {
            isReceivingRemote = false;
        }
    }

    function broadcastFullState() {
        const cm = window.ConfigManager;
        const pm = window.PlaylistManager;
        const ae = window.AudioEngine;
        const audioEl = document.getElementById('audio-local');

        if (cm) {
            postMessage('SYNC_FX', { fx: cm.state.fx, isUwu: cm.state.isUwu, clockState: cm.state.clockState, isSway: cm.state.isSway, isMobile: cm.state.isMobile });
            postMessage('SYNC_EQ', { eq: cm.state.eq });
            postMessage('SYNC_OPTIONS', { options: cm.state.options, nativeDir: cm.state.nativeDir });
        }

        if (pm) {
            postMessage('SYNC_QUEUE', {
                playlist: pm.playlist,
                activeIndices: pm.activeIndices,
                manualQueue: pm.manualQueue,
                currentGlobalIdx: pm.currentGlobalIdx,
                isShuffle: pm.isShuffle,
                isCustomMode: pm.isCustomMode,
                activePlaylistName: pm.activePlaylistName
            });
        }

        if (audioEl) {
            postMessage('SYNC_PLAYBACK_STATE', {
                paused: audioEl.paused,
                currentTime: audioEl.currentTime
            });
        }

        if (ae) {
            postMessage('SYNC_VOLUME', {
                volume: ae.getVolume(),
                muted: ae.isMuted()
            });
        }
    }

    function hookLocalEvents() {
        const audioEl = document.getElementById('audio-local');

        if (audioEl) {
            audioEl.addEventListener('play', () => {
                if (isReceivingRemote) return;
                postMessage('SYNC_PLAYBACK_STATE', {
                    paused: false,
                    currentTime: audioEl.currentTime
                });
            });

            audioEl.addEventListener('pause', () => {
                if (isReceivingRemote) return;
                postMessage('SYNC_PLAYBACK_STATE', {
                    paused: true,
                    currentTime: audioEl.currentTime
                });
            });

            audioEl.addEventListener('seeked', () => {
                if (isReceivingRemote) return;
                postMessage('SYNC_SEEK', {
                    currentTime: audioEl.currentTime
                });
            });
        }
    }

    function applyPlaybackState(data) {
        const audioEl = document.getElementById('audio-local');
        const toggleBtn = document.getElementById('music-toggle');
        const ui = window.UIManager;

        runRemoteAction(() => {
            if (audioEl) {
                if (Math.abs(audioEl.currentTime - data.currentTime) > 1) {
                    audioEl.currentTime = data.currentTime;
                }
                if (data.paused) {
                    audioEl.pause();
                    if (toggleBtn && ui) toggleBtn.innerText = ui.t('[play]');
                } else {
                    audioEl.play().catch(() => {});
                    if (toggleBtn && ui) toggleBtn.innerText = ui.t('[pause]');
                }
            }
        });
    }

    function applyTrackLoad(data) {
        const pm = window.PlaylistManager;
        const pc = window.PlayerController;

        runRemoteAction(() => {
            if (pm && data.globalIdx !== undefined) {
                pm.currentGlobalIdx = data.globalIdx;
                if (pc) pc.loadTrack();
            }
        });
    }

    function applySeek(data) {
        const audioEl = document.getElementById('audio-local');
        runRemoteAction(() => {
            if (audioEl && data.currentTime !== undefined) {
                audioEl.currentTime = data.currentTime;
            }
        });
    }

    function applyVolume(data) {
        const ae = window.AudioEngine;
        runRemoteAction(() => {
            if (ae) {
                if (data.volume !== undefined) ae.setVolume(data.volume);
                if (data.muted !== undefined) ae.setMuted(data.muted);
                if (isMaster) unmuteLocalAudio();
                else muteIfSecondary();
            }
        });
    }

    function applyFx(data) {
        const cm = window.ConfigManager;
        const uic = window.UIController;

        runRemoteAction(() => {
            if (cm && data.fx) {
                cm.state.fx = Object.assign({}, cm.state.fx, data.fx);
                if (data.isUwu !== undefined) cm.state.isUwu = data.isUwu;
                if (data.clockState !== undefined) cm.state.clockState = data.clockState;
                if (data.isSway !== undefined) cm.state.isSway = data.isSway;
                if (data.isMobile !== undefined) cm.state.isMobile = data.isMobile;

                if (window.UIManager) window.UIManager.renderDomTextFilters();
                if (uic) {
                    uic.updateFxUI();
                    uic.refreshIndices();
                }
            }
        });
    }

    function applyEq(data) {
        const cm = window.ConfigManager;
        const uic = window.UIController;

        runRemoteAction(() => {
            if (cm && data.eq) {
                cm.state.eq = Object.assign({}, cm.state.eq, data.eq);
                if (uic) uic.updateEqUI();
            }
        });
    }

    function applyOptions(data) {
        const cm = window.ConfigManager;
        const uic = window.UIController;

        runRemoteAction(() => {
            if (cm && data.options) {
                cm.state.options = Object.assign({}, cm.state.options, data.options);
                if (data.nativeDir !== undefined) cm.state.nativeDir = data.nativeDir;
                if (uic) uic.updateOptionsUI();
            }
        });
    }

    function applyQueue(data) {
        const pm = window.PlaylistManager;
        const uic = window.UIController;

        runRemoteAction(() => {
            if (pm) {
                if (data.playlist !== undefined) pm.playlist = data.playlist;
                if (data.activeIndices !== undefined) pm.activeIndices = data.activeIndices;
                if (data.manualQueue !== undefined) pm.manualQueue = data.manualQueue;
                if (data.currentGlobalIdx !== undefined) pm.currentGlobalIdx = data.currentGlobalIdx;
                if (data.isShuffle !== undefined) pm.isShuffle = data.isShuffle;
                if (data.isCustomMode !== undefined) pm.isCustomMode = data.isCustomMode;
                if (data.activePlaylistName !== undefined) pm.activePlaylistName = data.activePlaylistName;

                const shuffleBtn = document.getElementById('music-shuffle');
                const ui = window.UIManager;
                if (shuffleBtn && ui) {
                    shuffleBtn.innerText = pm.isShuffle ? ui.t('[shuffle (x)]') : ui.t('[shuffle ( )]');
                }

                if (uic) {
                    uic.updateNowPlayingHeader();
                    uic.refreshIndices();
                    const searchInput = document.getElementById('search-input');
                    if (searchInput && searchInput.value) uic.executeSearch();
                }
            }
        });
    }

    function applyPlaylistLists(data) {
        const lm = window.ListsManager;
        runRemoteAction(() => {
            if (lm && lm.renderListsModalContent) {
                lm.renderListsModalContent();
            }
        });
    }

    function broadcastState(type, payload) {
        if (isReceivingRemote) return;
        postMessage(type, payload);
    }

    return {
        init,
        broadcastState,
        isReceivingRemote: () => isReceivingRemote
    };
})();
