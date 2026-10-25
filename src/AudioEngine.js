window.AudioEngine = (function() {
    let audio = null;
    let audioCtx = null;
    let gainNode = null;
    let bassFilter, midFilter, trebleFilter, analyser;
    let isMuted = false;
    let vizInterval = null;
    let dataArray = null;
    const volLength = 10;
    let currentVolume = 0.5;

    // Lyrics state
    let currentParsedLyrics = [];
    let lyricsTimeoutId = null;
    let currentFetchRequestId = 0;

    function calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        const s1 = String(str1).toLowerCase().replace(/[^\w\s]/gi, '').trim();
        const s2 = String(str2).toLowerCase().replace(/[^\w\s]/gi, '').trim();
        if (s1 === s2) return 1.0;
        if (s1.includes(s2) || s2.includes(s1)) return 0.8;

        const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 0));
        const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 0));
        if (words1.size === 0 || words2.size === 0) return 0;

        let intersection = 0;
        for (let w of words1) {
            if (words2.has(w)) intersection++;
        }
        const union = new Set([...words1, ...words2]).size;
        return union > 0 ? intersection / union : 0;
    }

    function init(audioElement) {
        audio = audioElement;
        let savedVol = localStorage.getItem('env_vol');
        if (savedVol !== null) {
            let parsedVol = parseFloat(savedVol);
            if (!isNaN(parsedVol)) {
                currentVolume = Math.max(0, Math.min(1, parsedVol));
            }
        }
        let savedMute = localStorage.getItem('env_mute');
        if (savedMute !== null) {
            isMuted = (savedMute === 'true');
        }
        setVolume(currentVolume);
    }

    function initAudioAPI(eqState) {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            gainNode = audioCtx.createGain();
            gainNode.gain.value = isMuted ? 0 : currentVolume;

            bassFilter = audioCtx.createBiquadFilter();
            bassFilter.type = "lowshelf";
            bassFilter.frequency.value = 250;

            midFilter = audioCtx.createBiquadFilter();
            midFilter.type = "peaking";
            midFilter.frequency.value = 1500;
            midFilter.Q.value = 1;

            trebleFilter = audioCtx.createBiquadFilter();
            trebleFilter.type = "highshelf";
            trebleFilter.frequency.value = 4000;

            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 1024;
            analyser.maxDecibels = -15; // Prevent frequency data from hitting the absolute ceiling
            analyser.smoothingTimeConstant = 0.92;
            dataArray = new Uint8Array(analyser.frequencyBinCount);

            let source = audioCtx.createMediaElementSource(audio);
            source.connect(gainNode);
            gainNode.connect(bassFilter);
            bassFilter.connect(midFilter);
            midFilter.connect(trebleFilter);
            trebleFilter.connect(analyser);
            analyser.connect(audioCtx.destination);

            applyEQ(eqState);
        } catch (e) {
            console.warn("Web Audio API failed to init:", e);
        }
    }

    function applyEQ(eqState) {
        if (audioCtx) {
            if (bassFilter) bassFilter.gain.value = eqState.bass;
            if (midFilter) midFilter.gain.value = eqState.mid;
            if (trebleFilter) trebleFilter.gain.value = eqState.treble;
        }
    }

    function play() {
        if (!audio.src || audio.src === window.location.href) return;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return audio.play();
    }

    function pause() {
        audio.pause();
    }

    function setVolume(val) {
        let v = Math.max(0, Math.min(1, val));
        currentVolume = v;
        if (audio) {
            audio.volume = v;
        }
        if (gainNode && audioCtx) {
            gainNode.gain.value = isMuted ? 0 : v;
        }
        localStorage.setItem('env_vol', v);
        localStorage.setItem('env_mute', isMuted);

        let displayStr = "";
        if (isMuted) {
            if (audio) audio.muted = true;
            displayStr = '[   MUTE   ]';
        } else {
            if (audio) audio.muted = false;
            let fillCount = Math.round(v * volLength);
            let state = (window.ConfigManager && window.ConfigManager.state) ? window.ConfigManager.state : { fx: {}, isUwu: false };
            let cFill = (state.fx && (state.fx.kawaii || state.isUwu)) ? '♥' : '|';
            let cEmpty = (state.fx && (state.fx.kawaii || state.isUwu)) ? '♡' : '.';
            displayStr = '[' + cFill.repeat(fillCount) + cEmpty.repeat(volLength - fillCount) + ']';
        }

        const volBar = document.getElementById('vol-bar');
        if (volBar) {
            volBar.innerText = displayStr;
        }

        return displayStr;
    }

    function toggleMute() {
        isMuted = !isMuted;
        return setVolume(currentVolume);
    }

    function getVolume() { return currentVolume; }
    function setMuted(m) {
        isMuted = m;
        setVolume(currentVolume);
    }
    function getMuted() { return isMuted; }

    async function fetchLyrics(trackName, onStart, onSuccess, onFail, onEmpty, artistName = '', trackDuration = 0) {
        if (lyricsTimeoutId) {
            clearTimeout(lyricsTimeoutId);
            lyricsTimeoutId = null;
        }

        currentFetchRequestId++;
        const requestId = currentFetchRequestId;
        currentParsedLyrics = [];

        let targetTitle = trackName;
        if (typeof trackName === 'object' && trackName !== null) {
            targetTitle = trackName.title || '';
            artistName = trackName.artist || artistName;
            trackDuration = trackName.duration || trackDuration;
        }

        onStart(targetTitle);

        // 2.5 second debounce delay to prevent fetching lyrics for skipped songs
        lyricsTimeoutId = setTimeout(async () => {
            if (requestId !== currentFetchRequestId) return;

            try {
                let searchQuery = targetTitle;
                if (artistName && artistName.toLowerCase() !== 'unknown') {
                    searchQuery = `${artistName} ${targetTitle}`;
                }

                let query = encodeURIComponent(searchQuery);
                let response = await fetch(`https://lrclib.net/api/search?q=${query}`);
                let data = await response.json();

                if (requestId !== currentFetchRequestId) return;

                if (data && Array.isArray(data) && data.length > 0) {
                    // Score candidates using fuzzy matching
                    let bestCandidate = null;
                    let bestScore = -1;

                    for (let item of data) {
                        let score = 0;
                        const itemTitle = item.trackName || item.name || '';
                        const itemArtist = item.artistName || '';

                        const titleSim = calculateSimilarity(targetTitle, itemTitle);
                        score += titleSim * 40;

                        if (artistName && artistName.toLowerCase() !== 'unknown') {
                            const artistSim = calculateSimilarity(artistName, itemArtist);
                            score += artistSim * 30;
                        } else {
                            score += 15;
                        }

                        if (trackDuration > 0 && item.duration > 0) {
                            const diff = Math.abs(trackDuration - item.duration);
                            if (diff <= 3) score += 20;
                            else if (diff <= 8) score += 15;
                            else if (diff <= 15) score += 10;
                            else if (diff <= 30) score += 5;
                        }

                        if (item.syncedLyrics && item.syncedLyrics.trim().length > 0) {
                            score += 25;
                        } else if (item.plainLyrics && item.plainLyrics.trim().length > 0) {
                            score += 10;
                        }

                        if (score > bestScore) {
                            bestScore = score;
                            bestCandidate = item;
                        }
                    }

                    if (bestCandidate && bestScore >= 25) {
                        if (bestCandidate.syncedLyrics && bestCandidate.syncedLyrics.trim().length > 0) {
                            let lines = bestCandidate.syncedLyrics.split('\n');
                            let parsed = [];

                            for (let line of lines) {
                                line = line.trim();
                                if (!line) continue;

                                let timestampRegex = /\[(\d{1,2}):(\d{2})[.:](\d{1,3})\]/g;
                                let matches = [...line.matchAll(timestampRegex)];
                                if (matches.length === 0) continue;

                                let text = line.replace(/\[\d{1,2}:\d{2}[.:]\d{1,3}\]/g, '').trim() || '♪';

                                for (let match of matches) {
                                    let m = parseInt(match[1], 10);
                                    let s = parseInt(match[2], 10);
                                    let fractionStr = match[3];
                                    let fraction = parseFloat("0." + fractionStr);
                                    let time = (m * 60) + s + (isNaN(fraction) ? 0 : fraction);
                                    parsed.push({ time, text });
                                }
                            }

                            parsed.sort((a, b) => a.time - b.time);
                            currentParsedLyrics = parsed;

                            if (requestId === currentFetchRequestId) {
                                onSuccess(null, true);
                            }
                        } else if (bestCandidate.plainLyrics && bestCandidate.plainLyrics.trim().length > 0) {
                            if (requestId === currentFetchRequestId) {
                                onSuccess(bestCandidate.plainLyrics, false);
                            }
                        } else {
                            if (requestId === currentFetchRequestId) onEmpty();
                        }
                    } else {
                        if (requestId === currentFetchRequestId) onEmpty();
                    }
                } else {
                    if (requestId === currentFetchRequestId) onEmpty();
                }
            } catch (err) {
                if (requestId === currentFetchRequestId) onFail();
            }
        }, 2500);
    }

    function getParsedLyrics() {
        return currentParsedLyrics;
    }

    function getFrequencyData() {
        if (!analyser || !dataArray) return null;
        analyser.getByteFrequencyData(dataArray);
        return dataArray;
    }

    return {
        init,
        initAudioAPI,
        applyEQ,
        play,
        pause,
        setVolume,
        toggleMute,
        getVolume,
        getMuted,
        setMuted,
        fetchLyrics,
        getParsedLyrics,
        getFrequencyData,
        get audio() { return audio; },

        get vizInterval() { return vizInterval; },
        set vizInterval(val) { vizInterval = val; },
    };
})();
