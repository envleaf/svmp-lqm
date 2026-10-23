window.ConfigManager = (function() {
    let state = {
        fx: { kawaii: false, maxTrip: false, theme: 'default', rgb: false, crt: false, invert: false, obfuscate: false, bg: 'plasma' },
        eq: { bass: 0, mid: 0, treble: 0 },
        isMobile: false,
        isSway: false,
        clockState: 0, // 0=off, 1=small, 2=full
        devMode: false,
        visualizer: true,
        charOverride: null,
        isUwu: false,
        options: { notifications: true, trackNotif: true, hintsNotif: true, notifDuration: 5000, marqueeSpeed: 'normal', notifPosition: 'tl', expie: false, timebar: true, fullscreen: false },
        nativeDir: "",
        playlists: { "Favorites": [] },
        firstRun: true
    };

    function syncState() {
        if (window.goSaveConfig) {
            window.goSaveConfig(JSON.stringify(state));
        }
    }

    function loadState() {
        if (window.__INITIAL_CONFIG__) {
            // Merge all keys deeply if possible, or just reassign objects
            for (let k in window.__INITIAL_CONFIG__) {
                if (typeof window.__INITIAL_CONFIG__[k] === 'object' && window.__INITIAL_CONFIG__[k] !== null && state[k] && typeof state[k] === 'object') {
                    Object.assign(state[k], window.__INITIAL_CONFIG__[k]);
                } else {
                    state[k] = window.__INITIAL_CONFIG__[k];
                }
            }
        }

        if (state.firstRun !== false) {
            document.getElementById('welcome-modal').style.display = 'block';
            state.firstRun = false;
            syncState();
        }

        // mobile check still relevant to client
        if (!window.__INITIAL_CONFIG__ || window.__INITIAL_CONFIG__.isMobile === undefined) {
            state.isMobile = window.innerWidth <= 768;
            syncState();
        }
    }

    function saveNativeDir() {
        syncState();
    }

    function savePlaylists() {
        syncState();
    }

    function saveVisualizer() {
        syncState();
    }

    function saveOptions() {
        syncState();
    }

    function saveFx() {
        syncState();
    }

    function saveEq() {
        syncState();
    }

    function saveDevMode() {
        syncState();
    }

    return {
        get state() { return state; },
        loadState,
        saveFx,
        saveEq,
        saveDevMode,
        saveOptions,
        saveVisualizer,
        saveNativeDir,
        savePlaylists,
        syncState,
        importConfig(jsonStr) {
            try {
                let parsed = JSON.parse(jsonStr);
                for (let k in parsed) {
                    if (typeof parsed[k] === 'object' && parsed[k] !== null && state[k] && typeof state[k] === 'object') {
                        Object.assign(state[k], parsed[k]);
                    } else {
                        state[k] = parsed[k];
                    }
                }
                syncState();
                return true;
            } catch (e) {
                console.error("Failed to import config", e);
                return false;
            }
        },
        exportConfig() {
            return JSON.stringify(state, null, 2);
        }
    };
})();
