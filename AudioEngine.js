window.AudioEngine = (function() {
    let audio = null;
    let audioCtx = null;
    let bassFilter, midFilter, trebleFilter, analyser;
    let isMuted = false;
    let vizInterval = null;
    let dataArray = null;
    const volLength = 10;

    // Lyrics state
    let currentParsedLyrics = [];

    function init(audioElement) {
        audio = audioElement;
        // set up dual-sync listeners removed, only single audio element now
    }

    function initAudioAPI(eqState) {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();

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
            source.connect(bassFilter);
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
        audio.volume = v;
        localStorage.setItem('env_vol', v);

        let displayStr = "";
        if (isMuted) {
            audio.muted = true;
            displayStr = '[   MUTE   ]';
        } else {
            audio.muted = false;
            let fillCount = Math.round(v * volLength);
            let state = window.ConfigManager.state;
            let cFill = (state.fx.kawaii || state.isUwu) ? '♥' : '|';
            let cEmpty = (state.fx.kawaii || state.isUwu) ? '♡' : '.';
            displayStr = '[' + cFill.repeat(fillCount) + cEmpty.repeat(volLength - fillCount) + ']';
        }
        return displayStr;
    }

    function toggleMute() {
        isMuted = !isMuted;
        return setVolume(audio.volume);
    }

    function getVolume() { return audio.volume; }
    function setMuted(m) { isMuted = m; }
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
