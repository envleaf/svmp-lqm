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

    async function fetchLyrics(trackName, onStart, onSuccess, onFail, onEmpty) {
        onStart(trackName);
        currentParsedLyrics = [];
        try {
            let query = encodeURIComponent(trackName);
            let response = await fetch(`https://lrclib.net/api/search?q=${query}`);
            let data = await response.json();

            if (data && data.length > 0) {
                if (data[0].syncedLyrics) {
                    currentParsedLyrics = data[0].syncedLyrics.split('\n').map(line => {
                        let match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
                        if(match) {
                            let m = parseInt(match[1], 10);
                            let s = parseInt(match[2], 10);
                            let ms = parseInt(match[3], 10) / (match[3].length === 3 ? 1000 : 100);
                            return { time: (m * 60) + s + ms, text: match[4].trim() || '♪' };
                        }
                        return null;
                    }).filter(l => l);
                    onSuccess();
                } else if (data[0].plainLyrics) {
                    onSuccess(data[0].plainLyrics, false);
                } else {
                    onEmpty();
                }
            } else {
                onEmpty();
            }
        } catch (err) {
            onFail();
        }
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
