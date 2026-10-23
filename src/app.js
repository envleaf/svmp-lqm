document.addEventListener("DOMContentLoaded", function() {
    const cm = window.ConfigManager;
    const pm = window.PlaylistManager;
    const ae = window.AudioEngine;
    const ui = window.UIManager;

    // UI Elements
    const audioEl = document.getElementById('audio-local');
    const toggleBtn = document.getElementById('music-toggle');
    const prevBtn = document.getElementById('music-prev');
    const nextBtn = document.getElementById('music-next');
    const listsBtn = document.getElementById('music-lists');
    const favBtn = document.getElementById('music-fav');
    const shuffleBtn = document.getElementById('music-shuffle');
    const infoBtn = document.getElementById('music-info');
    const dlAddBtn = document.getElementById('music-dl-add');
    const localInput = document.getElementById('local-file-input');
    const dirBrowserModal = document.getElementById('dir-browser-modal');
    const indexingModal = document.getElementById('indexing-modal');
    const indexingDirPath = document.getElementById('indexing-dir-path');
    const indexingCancelBtn = document.getElementById('indexing-cancel-btn');
    const nowPlayingLabel = document.getElementById('now-playing-label');
    const trackTitleDisplay = document.getElementById('track-title');
    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');
    const asciiBar = document.getElementById('ascii-bar');
    const volBar = document.getElementById('vol-bar');
    const visualizerCanvas = document.getElementById('live-visualizer');
    const statusText = document.getElementById('playlist-status-text');
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const lyricsContent = document.getElementById('lyrics-content');
    const indexBox = document.getElementById('index-box');
    const customIndexBox = document.getElementById('custom-index-box');
    const playlistInput = document.getElementById('playlist-input');
    const asciiBg = document.getElementById('ascii-bg');

    // Command Palette & Dev Menu
    const cmdPalette = document.createElement('div');
    cmdPalette.id = 'cmd-palette';
    cmdPalette.innerHTML = `
        <a href="#" class="modal-close-x">[ x ]</a>
        <input type="text" id="cmd-input" placeholder="> enter command..." autocomplete="off">
        <pre id="cmd-output"></pre>
    `;
    document.body.appendChild(cmdPalette);

    const cmdInput = document.getElementById('cmd-input');
    const cmdOutput = document.getElementById('cmd-output');

    if (window.CommandPalette) {
        window.CommandPalette.init('cmd-output');
    }

    const devModal = document.createElement('div');
    devModal.id = 'dev-modal';
    devModal.className = 'overlay-modal';
    devModal.innerHTML = `
<a href="#" class="modal-close-x">[ x ]</a>
<pre style="margin: 0; color: var(--text-color);">
+-- developer tools --------------------+
|                                       |
|  -> <a href="#" id="dev-export-config">[export config]</a>                 |
|  -> <a href="#" id="dev-import-config">[import config]</a>                 |
|  -> <a href="#" id="dev-export-playlist">[export playlist]</a>               |
|  -> <a href="#" id="dev-import-playlist">[import playlist]</a>               |
|  -> <a href="#" id="dev-legacy-playlist">[toggle legacy playlist]</a>        |
|                                       |
|  -- toggles --                        |
|  <a href="#" id="opt-mobile" style="text-decoration: none;">[ ] mobile layout</a>                    |
|  <a href="#" id="opt-deck" style="text-decoration: none;">[ ] deck layout</a>                      |
|  <a href="#" id="opt-focus" style="text-decoration: none;">[ ] focus mode</a>                       |
|  <a href="#" id="opt-stat-monitor" style="text-decoration: none;">[ ] stat monitor</a>                     |
|  <a href="#" id="opt-disable-error-skip" style="text-decoration: none;">[ ] disable error skip</a>                 |
|  <a href="#" id="opt-legacy-playlist" style="text-decoration: none; display: none;">[ ] legacy playlist</a>                  |
|                                       |
|  <a href="#" id="opt-reset" style="color: #ff5555; text-decoration: none;">[factory reset]</a>                      |
+---------------------------------------+</pre>
    `;
    document.body.appendChild(devModal);

    const folderInput = document.getElementById('local-folder-input');

    // Initialization
    cm.loadState();
    ae.init(audioEl);
    ui.initTextFilters();

    // Session Timer
    let sessionPlaybackTime = 0; // in seconds

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
        if (!audioEl.paused) {
            sessionPlaybackTime++;
        }
    }, 1000);

    let isScpMode = false;

    // --- Stars ---
    const starContainer = document.getElementById('star-container');
    if (starContainer) {
        for (let i = 0; i < 75; i++) {
            let star = document.createElement('div');
            star.className = 'star';
            star.style.top = Math.random() * 100 + 'vh';
            star.style.left = Math.random() * 100 + 'vw';
            let size = Math.random() * 2 + 1;
            star.style.width = size + 'px';
            star.style.height = size + 'px';
            star.style.animationDuration = (Math.random() * 4 + 2) + 's';
            star.style.animationDelay = (Math.random() * 5) + 's';
            starContainer.appendChild(star);
        }
    }

    // --- Clock Engine ---
    function updateClock() {
        if (cm.state.clockState === 0) return;
        let now = new Date();
        let h = String(now.getHours()).padStart(2, '0');
        let m = String(now.getMinutes()).padStart(2, '0');
        let s = String(now.getSeconds()).padStart(2, '0');
        document.getElementById('clock-display').innerText = `[${h}:${m}:${s}]`;
    }
    setInterval(updateClock, 1000);

    // --- Timebar ---
    let timebarAnimationFrame = null;
    let timebarCanvas = document.getElementById('timebar-canvas');
    function resizeTimebarCanvas() {
        if (!timebarCanvas) return;
        timebarCanvas.width = window.innerWidth;
        timebarCanvas.height = 5;
    }
    window.addEventListener('resize', resizeTimebarCanvas);
    resizeTimebarCanvas();

    function updateTimebarDisplay() {
        if (!cm.state.options || cm.state.options.timebar === false || document.body.classList.contains('focus-mode')) {
            timebarCanvas.style.display = 'none';
            if (timebarAnimationFrame) {
                cancelAnimationFrame(timebarAnimationFrame);
                timebarAnimationFrame = null;
            }
        } else {
            timebarCanvas.style.display = 'block';
            if (!timebarAnimationFrame) {
                animateTimebar();
            }
        }
    }
    window.updateTimebarDisplay = updateTimebarDisplay;

    function animateTimebar() {
        if (timebarCanvas.style.display === 'none') return;
        timebarAnimationFrame = requestAnimationFrame(animateTimebar);

        const ctx = timebarCanvas.getContext('2d');
        const width = timebarCanvas.width;
        const height = timebarCanvas.height;

        ctx.clearRect(0, 0, width, height);

        // Fetch prompt color
        let barColor = '#d4d4d4';
        if (performance.now() - lastThemeUpdate > 1000) {
            const computedStyle = getComputedStyle(document.body);
            barColor = computedStyle.getPropertyValue('--prompt-color').trim() || '#888888';
            cachedBarColor = barColor;
        } else {
            barColor = cachedBarColor;
        }

        const pillWidth = 15;
        const gap = 2; // Matches visualizer gap feel
        const step = pillWidth + gap;
        const center = width / 2;
        const seconds = window.SessionTimer.getSeconds();
        const thirtyMins = 30 * 60; // 1800 seconds

        const totalPillsPerSide = Math.floor((width / 2) / step);
        const maxPills = (totalPillsPerSide * 2) + 1; // including center

        const periodCount = Math.floor(seconds / thirtyMins);
        const currentPeriodSecs = seconds % thirtyMins;
        let progress = currentPeriodSecs / thirtyMins;

        // Is it reversing? (i.e. every maxPills periods we reverse the direction)
        const isReversing = Math.floor(periodCount / maxPills) % 2 === 1;

        // Which pill index are we on in the current maxPills cycle?
        const pillCycleIdx = periodCount % maxPills;

        ctx.fillStyle = barColor;

        // 5 second pulse using sine wave. Active pill pulses slightly.
        // The active pill is still fading, but it has a slight variance.
        const pulse = (Math.sin(seconds * (2 * Math.PI / 5)) + 1) / 2; // 0 to 1
        const opacityVariance = (pulse * 0.1); // +/- 10% opacity, roughly

        for (let i = 0; i < maxPills; i++) {
            // Find pill's distance from center (center = 0)
            const sideIdx = Math.ceil(i / 2);
            // pill center calculation
            let x = 0;
            if (i === 0) {
                x = center - (pillWidth / 2);
            } else if (i % 2 === 1) {
                x = center - (pillWidth / 2) - (sideIdx * step); // left
            } else {
                x = center - (pillWidth / 2) + (sideIdx * step); // right
            }

            let opacity = 0;
            let isActive = false;

            if (isReversing) {
                if (i < pillCycleIdx) {
                    opacity = 0;
                } else if (i === pillCycleIdx) {
                    opacity = 1 - progress; // reversing fades out
                    isActive = true;
                } else {
                    opacity = 1;
                }
            } else {
                if (i < pillCycleIdx) {
                    opacity = 1;
                } else if (i === pillCycleIdx) {
                    opacity = progress;
                    isActive = true;
                } else {
                    opacity = 0;
                }
            }

            if (isActive) {
                // Apply slight pulse variation without exceeding bounds
                opacity = Math.max(0, Math.min(1, opacity + (opacityVariance - 0.05)));
            }

            if (opacity > 0) {
                ctx.globalAlpha = opacity;
                ctx.beginPath();
                ctx.roundRect(x, 0, pillWidth, height, 2); // 2px radius
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1.0;
    }

    // --- Visualizer ---
    let visualizerAnimationFrame = null;

    function resizeVisualizerCanvas() {
        if (!visualizerCanvas) return;
        visualizerCanvas.width = window.innerWidth;
        visualizerCanvas.height = window.innerHeight * 0.25;
    }
    window.addEventListener('resize', () => {
        resizeVisualizerCanvas();
        ui.syncMenuBoxWidth();
    });
    resizeVisualizerCanvas();

    function updateVisualizerDisplay() {
        if (!cm.state.visualizer || document.body.classList.contains('focus-mode') || audioEl.paused) {
            visualizerCanvas.style.display = 'none';
            if (visualizerAnimationFrame) {
                cancelAnimationFrame(visualizerAnimationFrame);
                visualizerAnimationFrame = null;
            }
        } else {
            visualizerCanvas.style.display = 'block';
            if (!visualizerAnimationFrame) {
                animateVisualizer();
            }
        }
    }
    window.updateVisualizerDisplay = updateVisualizerDisplay;
    
    let cachedBarColor = '#d4d4d4';
    let lastThemeUpdate = 0;

    function animateVisualizer() {
        if (visualizerCanvas.style.display === 'none') return;
        visualizerAnimationFrame = requestAnimationFrame(animateVisualizer);

        const ctx = visualizerCanvas.getContext('2d');
        const width = visualizerCanvas.width;
        const height = visualizerCanvas.height;

        ctx.clearRect(0, 0, width, height);

        const dataArray = ae.getFrequencyData();
        if (!dataArray) return;

        // Force exactly 256 bars total (128 on each side)
        const barsPerSide = 128;
        const gap = 3;
        const totalBars = barsPerSide * 2;
        
        // Calculate bar width considering gaps
        const barWidth = Math.max(1, (width - (totalBars * gap)) / totalBars);

        if (performance.now() - lastThemeUpdate > 1000) {
            const computedStyle = getComputedStyle(document.body);
            cachedBarColor = computedStyle.getPropertyValue('--text-color').trim() || '#d4d4d4';
            lastThemeUpdate = performance.now();
        }

        ctx.fillStyle = cachedBarColor;
        
        let centerX = Math.floor(width / 2);

        // We have 512 bins (from fftSize 1024), we only care about the lower 70% of frequencies
        // Resample the data to fit 128 bars
        const maxBins = Math.floor(dataArray.length * 0.7);
        const binsPerBar = Math.max(1, Math.floor(maxBins / barsPerSide));

        for(let i = 0; i < barsPerSide; i++) {
            // Average the frequencies for this bar
            let sum = 0;
            let startBin = i * binsPerBar;
            let endBin = startBin + binsPerBar;
            let actualCount = 0;
            
            for (let j = startBin; j < endBin && j < maxBins; j++) {
                sum += dataArray[j];
                actualCount++;
            }
            let avgFreq = actualCount > 0 ? sum / actualCount : 0;

            // Apply exponential gravity factor so they don't bounce too high instantly
            let normalized = avgFreq / 255;
            let gravityScaled = Math.pow(normalized, 2.5);
            
            let barHeight = gravityScaled * height;
            let offset = i * (barWidth + gap);
            
            // Draw Right side (Bass at center, treble outward)
            ctx.fillRect(centerX + offset, height - barHeight, barWidth, barHeight);
            
            // Draw Left side (Mirrored)
            ctx.fillRect(centerX - offset - barWidth - gap, height - barHeight, barWidth, barHeight);
        }
    }

    // --- Update UI State ---
    function updateFxUI() {
        let isK = cm.state.fx.kawaii || cm.state.isUwu;

        document.querySelector('[data-fx="kawaii"]').innerText = isK ? ui.t('[x] kawaii') : ui.t('[ ] kawaii');
        document.querySelector('[data-fx="maxTrip"]').innerText = cm.state.fx.maxTrip ? ui.t('[x] max trip (LAG)') : ui.t('[ ] max trip (LAG)');

        const stdFx = document.getElementById('standard-fx');
        if(stdFx) {
            stdFx.style.opacity = isK ? '0.3' : '1';
            stdFx.style.pointerEvents = isK ? 'none' : 'auto';
        }

        document.querySelectorAll('.fx-toggle:not([data-fx="kawaii"]):not([data-fx="maxTrip"])').forEach(btn => {
            let fx = btn.getAttribute('data-fx');
            let isActive = false;
            if (fx.startsWith('theme-')) isActive = (cm.state.fx.theme === fx.replace('theme-', ''));
            else if (fx.startsWith('bg-')) isActive = (cm.state.fx.bg === fx.replace('bg-', ''));
            else isActive = cm.state.fx[fx];

            let text = btn.innerText.substring(3);
            btn.innerText = isActive ? ui.t(`[x]${text}`) : ui.t(`[ ]${text}`);
        });

        let bodyClasses = [];
        if (document.body.classList.contains('focus-mode')) bodyClasses.push('focus-mode');
        if (cm.state.isSway) bodyClasses.push('sway-mode');
        if (cm.state.isMobile) bodyClasses.push('mobile-mode');
        if (isScpMode) bodyClasses.push('scp-mode');

        document.body.classList.remove('clock-small', 'clock-full');
        if (cm.state.clockState === 1) bodyClasses.push('clock-small');
        if (cm.state.clockState === 2) bodyClasses.push('clock-full');

        if (cm.state.fx.maxTrip) bodyClasses.push('max-trip-mode');

        if (isK) {
            document.documentElement.className = 'no-js theme-kawaii';
            document.body.className = bodyClasses.join(' ');
        } else {
            document.documentElement.className = 'no-js';
            if (cm.state.fx.theme !== 'default') document.documentElement.classList.add(`theme-${cm.state.fx.theme}`);
            document.documentElement.classList.toggle('invert-mode', cm.state.fx.invert);

            if (cm.state.fx.rgb) bodyClasses.push('rgb-mode');
            if (cm.state.fx.crt) bodyClasses.push('crt-mode');
            document.body.className = bodyClasses.join(' ');
        }

        if (!isK && cm.state.fx.bg === 'none') document.getElementById('ascii-bg').innerText = '';

        updateAsciiBar(audioEl.duration ? (audioEl.currentTime / audioEl.duration) : 0);
        volBar.innerText = ae.setVolume(ae.getVolume());
        updateEqUI();
        updateVisualizerDisplay();
    }

    function updateExpieUI() {
        const expieImg = document.getElementById('expie-img');
        if (!expieImg) return;
        if (cm.state.options && cm.state.options.expie) {
            expieImg.style.display = 'block';
            let notifPos = (cm.state.options && cm.state.options.notifPosition) ? cm.state.options.notifPosition : 'tl';
            if (notifPos.endsWith('r')) {
                // Notifications on right, expie on left (mirrored)
                expieImg.style.right = 'auto';
                expieImg.style.left = '0px';
                expieImg.style.transform = 'scaleX(-1)';
            } else {
                // Notifications on left, expie on right (normal)
                expieImg.style.left = 'auto';
                expieImg.style.right = '0px';
                expieImg.style.transform = 'scaleX(1)';
            }
        } else {
            expieImg.style.display = 'none';
        }
    }

    window.updateOptionsUI = function updateOptionsUI() {
        const optMobileBtn = document.getElementById('opt-mobile');
        const optDeckBtn = document.getElementById('opt-deck');
        const optFocusBtn = document.getElementById('opt-focus');
    const optStatMonitorBtn = document.getElementById('opt-stat-monitor');
        const optLocalBtn = document.getElementById('opt-local');
        const optDisableErrorSkipBtn = document.getElementById('opt-disable-error-skip');

        ui.syncMenuBoxWidth();

        if (optMobileBtn) optMobileBtn.innerText = cm.state.isMobile ? ui.t('[x] mobile layout') : ui.t('[ ] mobile layout');
        if (optDeckBtn) optDeckBtn.innerText = cm.state.isSway ? ui.t('[x] deck layout') : ui.t('[ ] deck layout');
        if (optFocusBtn) optFocusBtn.innerText = document.body.classList.contains('focus-mode') ? ui.t('[x] focus mode') : ui.t('[ ] focus mode');
    if (optStatMonitorBtn) optStatMonitorBtn.innerText = isStatMonitorEnabled ? ui.t('[x] stat monitor') : ui.t('[ ] stat monitor');
        if (optLocalBtn) optLocalBtn.innerText = ui.t('[mode: local]');
        if (dlAddBtn) dlAddBtn.innerText = ui.t(`[${cm.state.nativeDir || '/'}]`);
        if (optDisableErrorSkipBtn) {
            let isSkipped = cm.state.options && cm.state.options.disableErrorSkip;
            optDisableErrorSkipBtn.innerText = isSkipped ? ui.t('[x] disable error skip') : ui.t('[ ] disable error skip');
        }

        // Update notification position logic
        const notifContainer = document.getElementById('notification-container');
        if (notifContainer) {
            let pos = (cm.state.options && cm.state.options.notifPosition) ? cm.state.options.notifPosition : 'tl';
            notifContainer.className = `pos-${pos}`;

            const posBtn = document.getElementById('opt-notif-pos');
            if (posBtn) {
                let posLabels = { 'tl': 'topleft', 'tr': 'topright', 'bl': 'bottomleft', 'br': 'bottomright' };
                posBtn.innerText = ui.t(`[pos: ${posLabels[pos]}]`);
            }
        }

        updateExpieUI();

        if (cm.state.isMobile) {
            document.body.classList.add('mobile-mode');
            document.body.classList.remove('sway-mode');
        } else if (cm.state.isSway) {
            document.body.classList.add('sway-mode');
            document.body.classList.remove('mobile-mode');
        } else {
            document.body.classList.remove('mobile-mode', 'sway-mode');
        }
        
        // Update new options menu toggles
        document.querySelectorAll('.opt-toggle').forEach(btn => {
            let opt = btn.getAttribute('data-opt');
            let val = btn.getAttribute('data-val');
            
            // Convert to boolean/number if necessary
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (!isNaN(val)) val = parseInt(val, 10);
            
            let isActive = false;
            if (opt === 'visualizer') {
                isActive = cm.state[opt] === val;
            } else {
                isActive = cm.state.options && cm.state.options[opt] === val;
            }
            
            // Extract the original text label
            let text = btn.innerText.substring(3);
            btn.innerText = isActive ? ui.t(`[x]${text}`) : ui.t(`[ ]${text}`);
        });

        animateVisualizer();
        updateFxUI();
    }

    function updateEqUI() {
        ['bass', 'mid', 'treble'].forEach(band => {
            let val = cm.state.eq[band];
            let fill = Math.floor((val + 15) / 3);
            fill = Math.max(0, Math.min(10, fill));

            let cFill = (cm.state.fx.kawaii || cm.state.isUwu) ? '♥' : '|';
            let cEmpty = (cm.state.fx.kawaii || cm.state.isUwu) ? '♡' : '.';
            let bar = '[' + cFill.repeat(fill) + cEmpty.repeat(10 - fill) + ']';

            let el = document.getElementById(`eq-${band}-bar`);
            if (el) el.innerText = bar;
        });
        ae.applyEQ(cm.state.eq);
        cm.saveEq();
    }

    // --- ASCII Progress ---
    const barLength = 20;
    function updateAsciiBar(percent) {
        let fillCount = Math.floor(percent * barLength);
        fillCount = Math.max(0, Math.min(barLength, fillCount));
        let emptyCount = barLength - fillCount;
        let cFill = (cm.state.fx.kawaii || cm.state.isUwu) ? '♥' : '█';
        let cEmpty = (cm.state.fx.kawaii || cm.state.isUwu) ? '♡' : '-';
        asciiBar.innerText = '[' + cFill.repeat(fillCount) + cEmpty.repeat(emptyCount) + ']';
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins + ":" + (secs < 10 ? "0" : "") + secs;
    }

    function promptUser(title, callback) {
        const modal = document.getElementById('prompt-modal');
        const titleEl = document.getElementById('prompt-modal-title');
        const inputEl = document.getElementById('prompt-modal-input');
        const cancelBtn = document.getElementById('prompt-modal-cancel');
        const okBtn = document.getElementById('prompt-modal-ok');

        titleEl.innerText = ui.t(title);
        inputEl.value = '';
        modal.style.display = 'flex';
        inputEl.focus();

        function cleanup() {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            inputEl.removeEventListener('keydown', onKey);
            window.removeEventListener('keydown', onWindowKey);
        }

        function onOk(e) { if(e) e.preventDefault(); let val = inputEl.value.trim(); cleanup(); callback(val); }
        function onCancel(e) { if(e) e.preventDefault(); cleanup(); callback(null); }
        function onKey(e) { if (e.key === 'Enter') { onOk(); } else if (e.key === 'Escape') { onCancel(); } }
        function onWindowKey(e) { if (e.key === 'Escape') onCancel(); }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        inputEl.addEventListener('keydown', onKey);
        setTimeout(() => window.addEventListener('keydown', onWindowKey), 10);
    }

    // --- Search ---
    let matchingSearchResults = [];

    function executeSearch() {
        let searchQueueAllBtn = document.getElementById('search-queue-all');
        let query = searchInput.value.toLowerCase().trim();
        if (!query) {
            searchResults.innerHTML = '';
            matchingSearchResults = [];
            if (searchQueueAllBtn) searchQueueAllBtn.style.display = 'none';
            return;
        }
        let html = '';
        let count = 0;
        matchingSearchResults = [];

        const playlist = pm.playlist;
        const activeIndices = pm.activeIndices;

        activeIndices.forEach((globalIdx, localIdx) => {
            let track = playlist[globalIdx];
            if (track.title.toLowerCase().includes(query)) {
                matchingSearchResults.push(globalIdx);
                let num = String(localIdx + 1).padStart(2, '0');
                let titleLower = track.title.toLowerCase();
                let matchStart = titleLower.indexOf(query);
                let matchEnd = matchStart + query.length;

                let beforeMatch = track.title.substring(0, matchStart);
                let matchText = track.title.substring(matchStart, matchEnd);
                let afterMatch = track.title.substring(matchEnd);
                let qPrefix = getQueuePrefix(globalIdx);

                let highlightedTitle = `${ui.t(qPrefix)}${ui.t(beforeMatch)}<span style="background-color: var(--text-color); color: var(--bg-color);">${ui.t(matchText)}</span>${ui.t(afterMatch)}`;
                html += `<div style="display: flex;"><a href="#" class="info-btn" data-idx="${globalIdx}" style="text-decoration: none; margin-right: 5px;">[i]</a><a href="#" class="search-result-link track-link" data-idx="${globalIdx}" style="display: block; text-decoration: none; flex-grow: 1;">| ${num}. ${highlightedTitle}</a></div>`;
                count++;
            }
        });
        if (count === 0) {
            html = `<span style="color: var(--prompt-color);">${ui.t("no matches found.")}</span>`;
            if (searchQueueAllBtn) searchQueueAllBtn.style.display = 'none';
        } else {
            if (searchQueueAllBtn) searchQueueAllBtn.style.display = 'inline-block';
        }
        searchResults.innerHTML = html;

        document.querySelectorAll('.search-result-link').forEach(link => {
            link.addEventListener('click', e => handleTrackLinkClick(e, link));
            link.addEventListener('auxclick', e => handleTrackLinkClick(e, link));
        });
        bindInfoButtons(searchResults);
    }

    const searchQueueAllBtn = document.getElementById('search-queue-all');
    if (searchQueueAllBtn) {
        searchQueueAllBtn.addEventListener('click', e => {
            e.preventDefault();
            if (matchingSearchResults.length === 0) return;
            pm.prependToQueue(matchingSearchResults, pm.isShuffle);
            renderGlobalIndex();
            renderCustomPlaylistIndex();
            renderQueueIndex();
            executeSearch();
            if (audioEl.paused) {
                if (pm.getActiveTrack()) {
                    loadTrack();
                    playAudio();
                } else {
                    let nextGIdx = pm.nextTrack();
                    if (nextGIdx !== null && nextGIdx !== undefined) {
                        loadTrack();
                        playAudio();
                    }
                }
            }
        });
    }

    // --- Lyrics Syncing ---
    function updateLyricsScroll() {
        let parsed = ae.getParsedLyrics();
        if (parsed.length === 0) return;

        let t = audioEl.currentTime;
        let activeIdx = -1;
        for(let i = 0; i < parsed.length; i++) {
            if (t >= parsed[i].time) activeIdx = i;
            else break;
        }

        let html = "";
        if (activeIdx >= 1) html += `<span style="opacity: 0.4;">${ui.t(parsed[activeIdx-1].text)}</span>\n`;
        if (activeIdx >= 0) html += `<strong style="color: var(--text-color); text-shadow: 0 0 4px var(--prompt-color);">> ${ui.t(parsed[activeIdx].text)}</strong>\n`;

        let lookAhead = 5;
        for(let j = activeIdx + 1; j < parsed.length && j <= activeIdx + lookAhead; j++) {
            html += `${ui.t(parsed[j].text)}\n`;
        }

        lyricsContent.innerHTML = html || "♪";
    }

    // --- Directory Browser Bridge ---
    window.goUpdateDirList = function(path, items) {
        document.getElementById('dir-browser-path').innerText = path;
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
        document.getElementById('dir-browser-list').innerHTML = listHtml;

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

    document.getElementById('dir-browser-close').addEventListener('click', e => {
        e.preventDefault();
        dirBrowserModal.style.display = 'none';
        dirBrowserModal.classList.remove('overlay-modal');
    });

    document.getElementById('dir-browser-select').addEventListener('click', e => {
        e.preventDefault();
        let path = document.getElementById('dir-browser-path').innerText;
        cm.state.nativeDir = path;
        if (cm.saveNativeDir) cm.saveNativeDir();

        if (window.goSelectDir) {
            window.goSelectDir(path);
        }
        dirBrowserModal.style.display = 'none';
        dirBrowserModal.classList.remove('overlay-modal');
    });

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

    window.onIndexingComplete = function() {
        if (indexingModal) {
            indexingModal.style.display = 'none';
        }
    };

    if (indexingCancelBtn) {
        indexingCancelBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (window.goCancelIndexing) {
                window.goCancelIndexing();
            }
            window.liveClearPlaylist();
            pauseAudio();
            audioEl.removeAttribute('src');
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
        pm.addNativeTrack(trackInfo, (wasEmpty, newlyAddedIndices) => {
            statusText.innerText = "";
            renderGlobalIndex();
            renderCustomPlaylistIndex();
            renderQueueIndex();
            if (searchInput.value) executeSearch();

            if (wasEmpty) {
                loadTrack();
                playAudio();
            }
        });
    };

    window.liveAddTracks = function(trackInfos) {
        if (!trackInfos || trackInfos.length === 0) return;
        let wasEmpty = pm.playlist.length === 0;

        // Suppress UI updates per track
        window._suppressPlaylistReset = true;
        for (let track of trackInfos) {
             pm.addNativeTrack(track, null);
        }
        window._suppressPlaylistReset = false;
        pm.activeIndices = Array.from({length: pm.playlist.length}, (_, i) => i);
        pm.isCustomMode = false;
        if (wasEmpty) pm.resetQueueAndPosition();

        statusText.innerText = "";
        renderGlobalIndex();
        renderCustomPlaylistIndex();
        renderQueueIndex();
        if (searchInput.value) executeSearch();

        if (wasEmpty) {
            loadTrack();
            playAudio();
        }
    };

    function updateNowPlayingHeader() {
        if (!nowPlayingLabel) return;
        if (pm.activePlaylistName) {
            nowPlayingLabel.innerText = ui.t(`now playing (${pm.activePlaylistName}):`);
        } else {
            nowPlayingLabel.innerText = ui.t(`now playing:`);
        }
    }

    if (nowPlayingLabel) {
        nowPlayingLabel.addEventListener('click', e => {
            e.preventDefault();
            if (pm.activePlaylistName) {
                pm.exitPlaylistQueue();
                updateNowPlayingHeader();
                renderGlobalIndex();
                renderCustomPlaylistIndex();
                renderQueueIndex();
                if (searchInput.value) executeSearch();
                if (ui && ui.showNotification) {
                    ui.showNotification("Playlist queue ended.");
                }
            }
        });
    }

    window.liveClearPlaylist = function() {
        pm.activeIndices = [];
        pm.playlist.length = 0;
        pm.activePlaylistName = null;
        pm.resetQueueAndPosition();
        updateNowPlayingHeader();
        renderGlobalIndex();
        renderCustomPlaylistIndex();
        renderQueueIndex();
    };

    // --- Expose for Commands ---
    window.PlayerController = {
        playAudio: () => { if (pm.getActiveTrack()) { playAudio(); } },
        pauseAudio: () => pauseAudio(),
        togglePlay: () => {
            if (audioEl.paused) {
                if (pm.getActiveTrack()) playAudio();
            } else {
                pauseAudio();
            }
        },
        next: () => nextTrack(),
        prev: () => prevTrack(),
        loadTrack: () => loadTrack(),
        seek: (time) => { if (audioEl.duration) { audioEl.currentTime = time; if (window.goUpdateMprisSeeked) window.goUpdateMprisSeeked(audioEl.currentTime); } },
        seekRelative: (offset) => { if (audioEl.duration) { audioEl.currentTime += offset; if (window.goUpdateMprisSeeked) window.goUpdateMprisSeeked(audioEl.currentTime); } },
        refreshIndices: () => {
            renderGlobalIndex();
            renderCustomPlaylistIndex();
            renderQueueIndex();
            if (searchInput.value) executeSearch();
        },
        refreshFxUI: () => updateFxUI(),
        updateExpieUI: () => updateExpieUI(),
        triggerUwu: () => {
            cm.state.isUwu = true;
            cm.state.fx.kawaii = true;
            cm.state.charOverride = " uwonyx3^~";
            cm.saveFx();
            updateFxUI();
            ui.renderDomTextFilters();
            renderGlobalIndex();
            renderCustomPlaylistIndex();
            renderQueueIndex();
            loadTrack();
        },
        toggleRgb: () => {
            cm.state.fx.rgb = !cm.state.fx.rgb;
            cm.saveFx();
            updateFxUI();
        },
        toggleTrip: () => {
            cm.state.fx.maxTrip = !cm.state.fx.maxTrip;
            cm.saveFx();
            updateFxUI();
        },
        toggleScp: () => {
            isScpMode = !isScpMode;
            if (isScpMode) {
                pauseAudio();
            } else {
                document.body.classList.remove('blinking');
            }
            updateFxUI(); // updateFxUI handles setting 'scp-mode' class
        },
        triggerGrubError: () => {
            document.body.innerHTML = "<div style='color: #cccccc; background-color: #000000; font-family: monospace; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999999; padding: 10px; box-sizing: border-box;'>error: cannot boot: vmlinuz not found</div>";
        },
        refreshDevMode: () => {
            if (!cm.state.devMode) devModal.style.display = 'none';
        },
        toggleFetch: () => {
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
        },
        uploadFiles: (toPlaylist) => {
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

                        statusText.innerText = "";
                        renderGlobalIndex();
                        renderCustomPlaylistIndex();
                        renderQueueIndex();
                        if (searchInput.value) executeSearch();

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
    };

    // --- Marquee Logic ---
    let marqueeInterval = null;
    let fullTitleString = "";

    function updateMarquee() {
        if (!fullTitleString || audioEl.paused) return;
        if (fullTitleString.length <= 20) return; // Only scroll if it's long, you can adjust this if needed, or always scroll

        // Shift by 1 character
        fullTitleString = fullTitleString.substring(1) + fullTitleString[0];

        let trackNumDisplay = pm.currentIndex + 1;
        let totalDisplay = pm.activeIndices.length;

        // Display a substring for the marquee
        let displayStr = fullTitleString.substring(0, 30);
        if(fullTitleString.length > 30) {
            displayStr += "...";
        } else {
            displayStr = fullTitleString;
        }

        trackTitleDisplay.innerHTML = `${ui.t(displayStr)} <span style="color: var(--prompt-color); font-size: 0.9em;">[${trackNumDisplay}/${totalDisplay}]</span>`;
    }

    function startMarquee() {
        clearInterval(marqueeInterval);
        let speed = 400; // normal
        if (cm.state.options) {
            if (cm.state.options.marqueeSpeed === 'slow') speed = 800;
            else if (cm.state.options.marqueeSpeed === 'fast') speed = 150;
        }
        marqueeInterval = setInterval(updateMarquee, speed);
    }

    function stopMarquee() {
        clearInterval(marqueeInterval);
        // Reset to original full title when stopped
        if (pm.getActiveTrack()) {
            let trackNumDisplay = pm.currentIndex + 1;
            let totalDisplay = pm.activeIndices.length;

            let displayStr = pm.getActiveTrack().title;
            fullTitleString = displayStr + " *** "; // Reset string for next play

            trackTitleDisplay.innerHTML = `${ui.t(displayStr)} <span style="color: var(--prompt-color); font-size: 0.9em;">[${trackNumDisplay}/${totalDisplay}]</span>`;
        }
    }


    let consecutiveErrorCount = 0;

    // --- Player Logic ---
    function loadTrack() {
        clearInterval(marqueeInterval);
        let track = pm.getActiveTrack();
        if (track && cm.state.options && cm.state.options.trackNotif) {
            let notifStr = `${track.title}`;
            if (track.artist) notifStr = `${track.artist} - ${track.title}`;
            ui.showNotification(`now playing: ${notifStr}`);
        }

        if (window.goUpdateMprisMetadata && track) {
            window.goUpdateMprisMetadata(track.title || "Unknown Title", track.artist || "Unknown Artist", track.originalPath || "");
        }
        if (!track) {
            trackTitleDisplay.innerHTML = ui.t(`no local tracks mapped to RAM.`);
            updateAsciiBar(0);
            timeCurrent.innerText = "0:00";
            timeTotal.innerText = "0:00";
            audioEl.removeAttribute('src');
            return;
        }

        audioEl.src = track.src;

        let trackNumDisplay = pm.currentIndex + 1;
        let totalDisplay = pm.activeIndices.length;

        fullTitleString = track.title + " *** ";

        let initialDisplay = track.title;
        trackTitleDisplay.innerHTML = `${ui.t(initialDisplay)} <span style="color: var(--prompt-color); font-size: 0.9em;">[${trackNumDisplay}/${totalDisplay}]</span>`;

        updateAsciiBar(0);
        timeCurrent.innerText = "0:00";
        timeTotal.innerText = "0:00";

        // Update fav button UI
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

        ae.fetchLyrics(
            track.title,
            (name) => { lyricsContent.innerText = ui.t(`fetching lyrics for:\n${name}\n...`); },
            (plain, isSynced = true) => {
                if (isSynced) lyricsContent.innerHTML = ui.t("synced lyrics loaded.\nplay track to scroll.");
                else lyricsContent.innerText = ui.t(`+-- plain lyrics --------------+\n\n${plain}\n\n+------------------------------+`);
            },
            () => { lyricsContent.innerText = ui.t("error connecting to lyrics database."); },
            () => { lyricsContent.innerText = ui.t("no lyrics found in external database.\n(custom/indie tracks often return empty)"); }
        );
    }

    function playAudio() {
        if (!pm.getActiveTrack()) return;
        ae.initAudioAPI(cm.state.eq);
        try {
            let p = ae.play();
            if (p !== undefined && p !== null) {
                p.then(() => {
                    consecutiveErrorCount = 0;
                    toggleBtn.innerText = ui.t('[pause]');
                    updateVisualizerDisplay();
                    startMarquee();
                    if (window.goUpdateMprisStatus) window.goUpdateMprisStatus("Playing");
                }).catch(error => {
                    console.error("Audio playback failed:", error);
                    trackTitleDisplay.innerText = ui.t("Error loading audio file or missing audio sink");
                    toggleBtn.innerText = ui.t('[play]');

                    let isSkipped = cm.state.options && cm.state.options.disableErrorSkip;
                    if (!isSkipped) {
                        consecutiveErrorCount++;
                        if (consecutiveErrorCount > 3) {
                            ui.showNotification("Playback errors occurred consecutively. Stopping playback.");
                            pauseAudio();
                            audioEl.removeAttribute('src');
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
            toggleBtn.innerText = ui.t('[play]');
        }
    }

    function pauseAudio() {
        ae.pause();
        toggleBtn.innerText = ui.t('[play]');
        updateVisualizerDisplay();
        stopMarquee();
        if (window.goUpdateMprisStatus) window.goUpdateMprisStatus("Paused");
    }

    function nextTrack(isUserAction = false) {
        if (isUserAction) consecutiveErrorCount = 0;
        if (pm.activeIndices.length === 0) return;

        pm.nextTrack();

        loadTrack();
        renderGlobalIndex();
        renderCustomPlaylistIndex();
        renderQueueIndex();
        if (searchInput.value) executeSearch();

        if (toggleBtn.innerText.includes('pause')) playAudio();
    }

    function prevTrack() {
        consecutiveErrorCount = 0;
        if (pm.activeIndices.length === 0) return;

        pm.prevTrack();

        loadTrack();
        renderGlobalIndex();
        renderCustomPlaylistIndex();
        renderQueueIndex();
        if (searchInput.value) executeSearch();

        if (toggleBtn.innerText.includes('pause')) playAudio();
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
        renderGlobalIndex();
        renderCustomPlaylistIndex();
        renderQueueIndex();
        if (searchInput.value) executeSearch();
        if (toggleBtn.innerText.includes('pause')) playAudio();
    }

    function getQueuePrefix(idx) {
        let qIdx = pm.manualQueue.indexOf(idx);
        return qIdx > -1 ? `(${qIdx + 1}) ` : '';
    }

    function handleTrackLinkClick(e, link) {
        e.preventDefault();
        let globalIdx = parseInt(link.getAttribute('data-idx'), 10);

        if (e.button === 1) { // Middle click
            pm.toggleQueue(globalIdx);
            renderGlobalIndex();
            renderCustomPlaylistIndex();
            renderQueueIndex();
            if (searchInput.value) executeSearch();
        } else if (e.button === 0) { // Left click
            if (pm.activePlaylistName) {
                pm.exitPlaylistQueue();
                updateNowPlayingHeader();
            }
            consecutiveErrorCount = 0;
            pm.playTrackByGlobalIndex(globalIdx);
            loadTrack();
            playAudio();
            renderGlobalIndex();
            renderCustomPlaylistIndex();
            renderQueueIndex();
            if (searchInput.value) executeSearch();
        }
    }

    // --- Lists Modal (Playlists) ---
    const listsModal = document.getElementById('lists-modal');
    const listsModalTitle = document.getElementById('lists-modal-title');
    const listsModalContent = document.getElementById('lists-modal-content');
    const listsModalCreate = document.getElementById('lists-modal-create');
    const listsModalBack = document.getElementById('lists-modal-back');
    const listsModalClose = document.getElementById('lists-modal-close');

    let currentListsView = 'main'; // 'main', 'playlist', 'add'
    let currentViewingPlaylist = null;
    let trackToAdd = null;

    listsBtn.addEventListener('click', e => {
        e.preventDefault();
        openListsModal('main');
    });

    listsModalClose.addEventListener('click', e => {
        e.preventDefault();
        listsModal.style.display = 'none';
    });

    listsModalBack.addEventListener('click', e => {
        e.preventDefault();
        openListsModal('main');
    });

    listsModalCreate.addEventListener('click', e => {
        e.preventDefault();
        promptUser("enter playlist name (letters/numbers only):", async (name) => {
            if (!name) return;
            let cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!cleanName) {
                ui.showNotification("invalid playlist name (a-z, 0-9 only)");
                return;
            }

            if (currentListsView === 'add') {
                if (window.goAddTrackToPlaylist && trackToAdd) {
                    let success = await window.goAddTrackToPlaylist(cleanName, trackToAdd.originalPath);
                    if (success) {
                        ui.showNotification(`added to ${cleanName}`);
                    } else {
                        ui.showNotification(`failed to add to ${cleanName}`);
                    }
                }
                listsModal.style.display = 'none';
            } else {
                if (window.goCreatePlaylist) {
                    await window.goCreatePlaylist(cleanName);
                }
                openListsModal('main');
            }
        });
    });

    function openListsModal(view, data = null) {
        // Hide all active menus so modal is clearly visible
        document.querySelectorAll('.menu-box').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });

        currentListsView = view;
        listsModal.style.display = 'flex';

        if (view === 'main' || view === 'add') {
            listsModalTitle.innerText = ui.t(view === 'add' ? 'add to list' : 'playlists');
            listsModalBack.style.display = 'none';
            trackToAdd = view === 'add' ? data : null;
            renderPlaylistsList();
        } else if (view === 'playlist') {
            currentViewingPlaylist = data;
            listsModalTitle.innerText = ui.t(data);
            listsModalBack.style.display = 'inline';
            renderPlaylistTracks();
        }
    }

    async function renderPlaylistsList() {
        let html = '';
        let playlists = [];
        if (window.goListPlaylists) {
            try {
                playlists = await window.goListPlaylists();
            } catch (err) {
                playlists = [];
            }
        }
        if (!Array.isArray(playlists)) playlists = [];

        playlists.forEach(pl => {
            let key = pl.name;
            let count = pl.trackCount;
            let displayCount = `[${count} tracks]`;
            html += `<div style="display: flex; align-items: center; margin-bottom: 5px;">`;
            if (key !== "favorites" && currentListsView !== 'add') {
                html += `<a href="#" class="del-list-btn" data-name="${key}" style="color: #ff5555; text-decoration: none; margin-right: 10px;">[x]</a>`;
            } else if (currentListsView !== 'add') {
                html += `<span style="display: inline-block; width: 30px;"></span>`;
            }
            html += `<a href="#" class="list-link" data-name="${key}" style="display: block; text-decoration: none; flex-grow: 1;">${ui.t(key)} <span style="color: var(--prompt-color); font-size: 0.9em;">${ui.t(displayCount)}</span></a></div>`;
        });

        if (playlists.length === 0) {
            html = `<span style="color: var(--prompt-color);">${ui.t("no playlists.")}</span>`;
        }

        listsModalContent.innerHTML = html;

        document.querySelectorAll('.del-list-btn').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.preventDefault();
                let name = btn.getAttribute('data-name');
                if(confirm(`delete playlist '${name}'?`)) {
                    if (window.goDeletePlaylist) await window.goDeletePlaylist(name);
                    renderPlaylistsList();
                }
            });
        });

        document.querySelectorAll('.list-link').forEach(link => {
            link.addEventListener('click', async e => {
                e.preventDefault();
                let name = link.getAttribute('data-name');
                if (currentListsView === 'add') {
                    if (window.goAddTrackToPlaylist && trackToAdd) {
                        let success = await window.goAddTrackToPlaylist(name, trackToAdd.originalPath);
                        if (success) {
                            ui.showNotification(`added to ${name}`);
                        } else {
                            ui.showNotification(`already in or failed to add to ${name}`);
                        }
                    }
                    listsModal.style.display = 'none';
                } else {
                    openListsModal('playlist', name);
                }
            });
        });
    }

    async function renderPlaylistTracks() {
        let html = '';
        let listTracks = [];
        if (window.goGetPlaylistTracks) {
            try {
                listTracks = await window.goGetPlaylistTracks(currentViewingPlaylist);
            } catch (err) {
                listTracks = [];
            }
        }
        if (!Array.isArray(listTracks)) listTracks = [];

        if (listTracks.length === 0) {
            listsModalContent.innerHTML = `<span style="color: var(--prompt-color);">${ui.t("playlist is empty or tracks missing.")}</span>`;
            return;
        }

        listTracks.forEach((track, i) => {
            let displayTitle = track.title || track.originalName;
            let num = String(i + 1).padStart(2, '0');
            let line = `| ${num}. ${displayTitle}`;

            html += `<div style="display: flex;"><a href="#" class="del-track-btn" data-path="${encodeURIComponent(track.originalPath)}" style="color: #ff5555; text-decoration: none; margin-right: 5px;">[x]</a><a href="#" class="pl-track-link" data-idx="${i}" style="display: block; text-decoration: none; flex-grow: 1;">${ui.t(line)}</a></div>`;
        });

        listsModalContent.innerHTML = html;

        document.querySelectorAll('.del-track-btn').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.preventDefault();
                let originalPath = decodeURIComponent(btn.getAttribute('data-path'));
                if (window.goRemoveTrackFromPlaylist) {
                    await window.goRemoveTrackFromPlaylist(currentViewingPlaylist, originalPath);
                }
                renderPlaylistTracks();

                if (currentViewingPlaylist === "favorites") {
                    let playingTrack = pm.getActiveTrack();
                    if (playingTrack && favBtn) {
                        let isFav = window.goIsFavorite ? await window.goIsFavorite(playingTrack.originalPath) : false;
                        favBtn.innerText = isFav ? ui.t('[fav (x)]') : ui.t('[fav ( )]');
                    }
                }
            });
        });

        document.querySelectorAll('.pl-track-link').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                let idx = parseInt(link.getAttribute('data-idx'), 10);
                playPlaylistTrack(idx, listTracks);
            });
        });
    }

    function playPlaylistTrack(targetLocalIdx, listTracks) {
        if (!listTracks || listTracks.length === 0) return;

        let newActiveIndices = [];

        listTracks.forEach(track => {
            let globalIdx = pm.playlist.findIndex(t => t.originalPath === track.originalPath);
            if (globalIdx === -1) {
                pm.playlist.push(track);
                globalIdx = pm.playlist.length - 1;
            }
            newActiveIndices.push(globalIdx);
        });

        pm.isCustomMode = true;
        pm.activePlaylistName = currentViewingPlaylist;
        pm.activeIndices = newActiveIndices;
        pm.playTrackByGlobalIndex(newActiveIndices[targetLocalIdx]);

        updateNowPlayingHeader();
        renderGlobalIndex();
        renderCustomPlaylistIndex();
        renderQueueIndex();
        loadTrack();
        playAudio();

        if (ui && ui.showNotification) {
            ui.showNotification('Press "now playing" to cancel the playlist queue.');
        }

        listsModal.style.display = 'none';
        if (window.CommandPalette) window.CommandPalette.setOutput(`playing from ${currentViewingPlaylist}`);
    }

    function renderGlobalIndex() {
        const indexResults = document.getElementById('index-results');
        if (!indexResults) return;

        const pl = pm.playlist;

        if (pl.length === 0) {
            indexResults.innerHTML = `<span style="color: var(--prompt-color);">${ui.t("(no files added to RAM yet)")}</span>`;
            return;
        }

        let html = '';
        pl.forEach((track, i) => {
            let num = String(i + 1).padStart(2, '0');
            let titleStr = getQueuePrefix(i) + track.title;
            let line = `| ${num}. ${titleStr}`;
            html += `<div style="display: flex;"><a href="#" class="info-btn" data-idx="${i}" style="text-decoration: none; margin-right: 5px;">[i]</a><a href="#" class="track-link" data-idx="${i}" style="display: block; text-decoration: none; flex-grow: 1;">${ui.t(line)}</a></div>`;
        });
        
        indexResults.innerHTML = html;

        document.querySelectorAll('#index-results .track-link').forEach(link => {
            link.addEventListener('click', e => handleTrackLinkClick(e, link));
            link.addEventListener('auxclick', e => handleTrackLinkClick(e, link)); // For middle click
        });
        bindInfoButtons(indexResults);
    }

    function renderCustomPlaylistIndex() {
        let headerTitle = pm.isCustomMode ? "custom playlist queue" : "active queue";
        let str = `+-- ${headerTitle} `.padEnd(40, "-") + "+\n";
        const pl = pm.playlist;
        const ai = pm.activeIndices;

        if (ai.length === 0) {
            customIndexBox.innerHTML = ui.t(str + "| (queue empty)                         |\n+---------------------------------------+");
        } else {
            let html = ui.t(str);
            ai.forEach((globalIdx, i) => {
                let track = pl[globalIdx];
                let num = String(i + 1).padStart(2, '0');
                let titleStr = getQueuePrefix(globalIdx) + track.title;
                let line = `| ${num}. ${titleStr}`;
                if (line.length > 39) line = line.substring(0, 36) + "...";
                line = line.padEnd(40, " ") + "|";
                html += `<div style="display: flex;"><a href="#" class="info-btn" data-idx="${globalIdx}" style="text-decoration: none; margin-right: 5px;">[i]</a><a href="#" class="track-link" data-idx="${globalIdx}" style="display: block; text-decoration: none; flex-grow: 1;">${ui.t(line)}</a></div>`;
            });
            html += ui.t("+---------------------------------------+");
            customIndexBox.innerHTML = html;
        }

        document.querySelectorAll('#custom-index-box .track-link').forEach(link => {
            link.addEventListener('click', e => handleTrackLinkClick(e, link));
            link.addEventListener('auxclick', e => handleTrackLinkClick(e, link));
        });
        bindInfoButtons(customIndexBox);
    }

    function renderQueueIndex() {
        const queueResults = document.getElementById('queue-results');
        if (!queueResults) return;

        const queueList = pm.getQueueList();
        const pl = pm.playlist;

        if (queueList.length === 0) {
            queueResults.innerHTML = `<span style="color: var(--prompt-color);">${ui.t("queue is empty.")}</span>`;
            return;
        }

        let html = '';
        queueList.forEach((globalIdx, qIdx) => {
            let track = pl[globalIdx];
            if (!track) return;
            let displayNum = String(qIdx + 1).padStart(2, '0');
            let qPrefix = getQueuePrefix(globalIdx);
            let isCurrent = (globalIdx === pm.currentGlobalIdx && qIdx === 0);
            let nowPlayingSuffix = isCurrent ? " [ Now Playing ]" : "";
            let line = `| ${displayNum}. ${qPrefix}${track.title}${nowPlayingSuffix}`;

            html += `<div style="display: flex;"><a href="#" class="info-btn" data-idx="${globalIdx}" style="text-decoration: none; margin-right: 5px;">[i]</a><a href="#" class="track-link" data-idx="${globalIdx}" style="display: block; text-decoration: none; flex-grow: 1;">${ui.t(line)}</a></div>`;
        });

        queueResults.innerHTML = html;

        document.querySelectorAll('#queue-results .track-link').forEach(link => {
            link.addEventListener('click', e => handleTrackLinkClick(e, link));
            link.addEventListener('auxclick', e => handleTrackLinkClick(e, link));
        });
        bindInfoButtons(queueResults);
    }

    // --- Info Modal ---
    const infoModal = document.getElementById('song-info-modal');
    const infoArt = document.getElementById('song-info-artwork');
    const infoArtPlaceholder = document.getElementById('song-info-artwork-placeholder');
    let currentInfoIdx = -1;

    function bindInfoButtons(container) {
        container.querySelectorAll('.info-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                let idx = parseInt(btn.getAttribute('data-idx'), 10);
                openInfoModal(idx);
            });
            btn.addEventListener('contextmenu', e => {
                e.preventDefault();
                let idx = parseInt(btn.getAttribute('data-idx'), 10);
                removeTrackAction(idx);
            });
        });
    }

    function removeTrackAction(globalIdx) {
        let isCurrent = (pm.currentGlobalIdx === globalIdx);
        if (pm.removeTrack(globalIdx)) {
            let activeTrack = pm.getActiveTrack();
            if (!activeTrack && !audioEl.paused) {
                pauseAudio();
                audioEl.removeAttribute('src');
            } else if (isCurrent && activeTrack) {
                 pauseAudio();
                 loadTrack();
                 if (toggleBtn.innerText.includes('pause')) playAudio();
            }

            renderGlobalIndex();
            renderCustomPlaylistIndex();
            renderQueueIndex();
            if (searchInput.value) executeSearch();

            if (window.CommandPalette) {
                window.CommandPalette.setOutput(`Removed track from index.`);
            }
        }
    }

    function openInfoModal(globalIdx) {
        const track = pm.playlist[globalIdx];
        if (!track) return;
        currentInfoIdx = globalIdx;

        document.getElementById('song-info-title').innerText = track.title || "Unknown";
        document.getElementById('song-info-artist').innerText = track.artist || "Unknown";
        document.getElementById('song-info-album').innerText = track.album || "Unknown";
        document.getElementById('song-info-bitrate').innerText = "Unknown";

        const playAlbumBtn = document.getElementById('song-info-play-album');
        const playArtistBtn = document.getElementById('song-info-play-artist');

        let hasAlbum = track.album && track.album.trim() !== '' && track.album.toLowerCase() !== 'unknown';
        let hasArtist = track.artist && track.artist.trim() !== '' && track.artist.toLowerCase() !== 'unknown';

        if (playAlbumBtn) playAlbumBtn.style.display = hasAlbum ? 'inline-block' : 'none';
        if (playArtistBtn) playArtistBtn.style.display = hasArtist ? 'inline-block' : 'none';

        infoArt.style.display = 'none';
        infoArtPlaceholder.style.display = 'flex';

        if (track.file && window.jsmediatags) {
             window.jsmediatags.read(track.file, {
                 onSuccess: function(tag) {
                     if (tag.tags.album) {
                         document.getElementById('song-info-album').innerText = tag.tags.album;
                         track.album = tag.tags.album;
                         if (playAlbumBtn) playAlbumBtn.style.display = 'inline-block';
                     }

                     if (tag.tags.picture) {
                         const { data, format } = tag.tags.picture;
                         let base64String = "";
                         for (let i = 0; i < data.length; i++) {
                             base64String += String.fromCharCode(data[i]);
                         }
                         infoArt.src = `data:${format};base64,${window.btoa(base64String)}`;
                         infoArt.style.display = 'block';
                         infoArtPlaceholder.style.display = 'none';
                     }
                 },
                 onError: function(error) {}
             });
        } else if (!track.file && track.originalPath) {
             // For native tracks, hit the local Go server for artwork
             let currentHost = window.location.host;
             infoArt.src = `http://${currentHost}/art?path=${encodeURIComponent(track.originalPath)}`;
             infoArt.style.display = 'block';
             infoArtPlaceholder.style.display = 'none';
        }
        infoModal.style.display = 'block';
    }

    document.getElementById('song-info-close').addEventListener('click', e => {
        e.preventDefault();
        infoModal.style.display = 'none';
    });

    document.getElementById('song-info-play').addEventListener('click', e => {
        e.preventDefault();
        if (currentInfoIdx !== -1) {
            consecutiveErrorCount = 0;
            pm.playTrackByGlobalIndex(currentInfoIdx);
            loadTrack();
            playAudio();
            renderGlobalIndex();
            renderCustomPlaylistIndex();
            renderQueueIndex();
            if (searchInput.value) executeSearch();
            infoModal.style.display = 'none';
        }
    });

    document.getElementById('song-info-queue').addEventListener('click', e => {
        e.preventDefault();
        pm.toggleQueue(currentInfoIdx);
        renderGlobalIndex();
        renderCustomPlaylistIndex();
        renderQueueIndex();
        if (searchInput.value) executeSearch();
        infoModal.style.display = 'none';
    });

    document.getElementById('song-info-play-album').addEventListener('click', e => {
        e.preventDefault();
        if (currentInfoIdx !== -1) {
            let track = pm.playlist[currentInfoIdx];
            if (track && track.album && track.album.toLowerCase() !== 'unknown') {
                let targetAlbum = track.album.toLowerCase().trim();
                let matchingIndices = [];
                pm.playlist.forEach((t, gIdx) => {
                    if (t.album && t.album.toLowerCase().trim() === targetAlbum) {
                        matchingIndices.push(gIdx);
                    }
                });
                if (matchingIndices.length > 0) {
                    pm.prependToQueue(matchingIndices, pm.isShuffle);
                    renderGlobalIndex();
                    renderCustomPlaylistIndex();
                    renderQueueIndex();
                    if (searchInput.value) executeSearch();
                    if (audioEl.paused) {
                        if (pm.getActiveTrack()) {
                            loadTrack();
                            playAudio();
                        } else {
                            let nextGIdx = pm.nextTrack();
                            if (nextGIdx !== null && nextGIdx !== undefined) {
                                loadTrack();
                                playAudio();
                            }
                        }
                    }
                }
            }
            infoModal.style.display = 'none';
        }
    });

    document.getElementById('song-info-play-artist').addEventListener('click', e => {
        e.preventDefault();
        if (currentInfoIdx !== -1) {
            let track = pm.playlist[currentInfoIdx];
            if (track && track.artist && track.artist.toLowerCase() !== 'unknown') {
                let targetArtist = track.artist.toLowerCase().trim();
                let matchingIndices = [];
                pm.playlist.forEach((t, gIdx) => {
                    if (t.artist && t.artist.toLowerCase().trim() === targetArtist) {
                        matchingIndices.push(gIdx);
                    }
                });
                if (matchingIndices.length > 0) {
                    pm.prependToQueue(matchingIndices, pm.isShuffle);
                    renderGlobalIndex();
                    renderCustomPlaylistIndex();
                    renderQueueIndex();
                    if (searchInput.value) executeSearch();
                    if (audioEl.paused) {
                        if (pm.getActiveTrack()) {
                            loadTrack();
                            playAudio();
                        } else {
                            let nextGIdx = pm.nextTrack();
                            if (nextGIdx !== null && nextGIdx !== undefined) {
                                loadTrack();
                                playAudio();
                            }
                        }
                    }
                }
            }
            infoModal.style.display = 'none';
        }
    });

    document.getElementById('song-info-add-list').addEventListener('click', e => {
        e.preventDefault();
        if (currentInfoIdx > -1) {
            let track = pm.playlist[currentInfoIdx];
            if (track && track.originalPath) {
                infoModal.style.display = 'none';
                openListsModal('add', track);
            }
        }
    });

    document.getElementById('song-info-remove').addEventListener('click', e => {
        e.preventDefault();
        removeTrackAction(currentInfoIdx);
        infoModal.style.display = 'none';
    });

    function handleFileSelection(files) {
        if (files.length > 0) {
            pm.addFiles(files, (wasEmpty) => {
                statusText.innerText = "";
                renderGlobalIndex();
                renderCustomPlaylistIndex();
                renderQueueIndex();
                if (searchInput.value) executeSearch();

                if (wasEmpty) {
                    loadTrack();
                    playAudio();
                }
            });
        }
        revertUploadButtons();
    }

    // --- Events ---
    localInput.onchange = e => {
        handleFileSelection(e.target.files);
        localInput.value = '';
    };

    folderInput.onchange = e => {
        handleFileSelection(e.target.files);
        folderInput.value = '';
    };

    let isUploadSplit = false;
    let fileBtn, folderBtn;

    function revertUploadButtons() {
        if (isUploadSplit && fileBtn && folderBtn && dlAddBtn.parentNode) {
            dlAddBtn.parentNode.insertBefore(dlAddBtn, fileBtn);
            dlAddBtn.style.display = 'inline-block';
            dlAddBtn.innerText = ui.t(`[${cm.state.nativeDir || '/'}]`);
            fileBtn.remove();
            folderBtn.remove();
            isUploadSplit = false;
        }
    }

    dlAddBtn.addEventListener('click', e => {
        e.preventDefault();
        let startingDir = cm.state.nativeDir;
        if (window.goOpenDirBrowser) {
             if (startingDir) {
                 window.goOpenDirBrowser(startingDir);
             } else {
                 window.goOpenDirBrowser("");
             }
             dirBrowserModal.style.display = 'flex';
             dirBrowserModal.classList.add('overlay-modal');
        } else {
            console.warn("Go bridge not found for directory browser");
        }
    });

    toggleBtn.addEventListener('click', e => {
        e.preventDefault();
        if (isScpMode) return;
        audioEl.paused ? playAudio() : pauseAudio();
    });
    nextBtn.addEventListener('click', e => { e.preventDefault(); nextTrack(true); });
    prevBtn.addEventListener('click', e => { e.preventDefault(); prevTrack(); });

    shuffleBtn.addEventListener('click', e => {
        e.preventDefault();
        pm.isShuffle = !pm.isShuffle;
        shuffleBtn.innerText = pm.isShuffle ? ui.t('[shuffle (x)]') : ui.t('[shuffle ( )]');
        renderQueueIndex();
    });

    favBtn.addEventListener('click', async e => {
        e.preventDefault();
        let track = pm.getActiveTrack();
        if (!track || !track.originalPath) return;

        let isFav = window.goIsFavorite ? await window.goIsFavorite(track.originalPath) : false;
        if (isFav) {
            if (window.goRemoveTrackFromPlaylist) await window.goRemoveTrackFromPlaylist("favorites", track.originalPath);
            favBtn.innerText = ui.t('[fav ( )]');
        } else {
            if (window.goAddTrackToPlaylist) await window.goAddTrackToPlaylist("favorites", track.originalPath);
            favBtn.innerText = ui.t('[fav (x)]');
        }
    });

    infoBtn.addEventListener('click', e => {
        e.preventDefault();
        if (pm.activeIndices.length === 0) return;
        let globalIdx = pm.currentGlobalIdx;
        if (globalIdx !== undefined && globalIdx !== -1) {
            openInfoModal(globalIdx);
        }
    });

    volBar.addEventListener('click', e => {
        const rect = volBar.getBoundingClientRect();
        let clickX = e.clientX - rect.left - 8;
        let percent = Math.max(0, Math.min(1, clickX / (rect.width - 16)));
        ae.setMuted(false);
        ae.setVolume(percent);
    });

    volBar.addEventListener('wheel', e => {
        e.preventDefault();
        ae.setMuted(false);
        let step = e.deltaY < 0 ? 0.05 : -0.05;
        let currentVol = ae.getVolume();
        ae.setVolume(currentVol + step);
    }, { passive: false });

    asciiBar.addEventListener('click', e => {
        if (audioEl.duration) {
            const rect = asciiBar.getBoundingClientRect();
            let clickX = e.clientX - rect.left;
            let percent = Math.max(0, Math.min(1, clickX / rect.width));
            audioEl.currentTime = percent * audioEl.duration;
        }
    });

    document.getElementById('playlist-load').addEventListener('click', e => {
        e.preventDefault();
        if(playlistInput.value) {
            if(pm.buildCustomPlaylist(playlistInput.value)) {
                statusText.innerText = ui.t(">> custom playlist active");
                loadTrack();
                if (toggleBtn.innerText.includes('pause')) playAudio();
                renderCustomPlaylistIndex();
                renderQueueIndex();
                if(searchInput.value) executeSearch();
            }
        }
    });

    document.getElementById('playlist-clear').addEventListener('click', e => {
        e.preventDefault();
        pm.clearCustomPlaylist();
        updateNowPlayingHeader();
        playlistInput.value = '';
        statusText.innerText = "";
        loadTrack();
        renderCustomPlaylistIndex();
        renderQueueIndex();
        if(searchInput.value) executeSearch();
        if (toggleBtn.innerText.includes('pause')) playAudio();
    });

    document.querySelectorAll('.menu-toggle').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            let targetId = btn.getAttribute('data-target');
            let targetBox = document.getElementById(targetId);
            let isClosing = targetBox.style.display === 'block';

            // Remove modal classes from any previously modal'd menu boxes
            document.querySelectorAll('.menu-box').forEach(box => {
                box.style.display = 'none';
                box.classList.remove('overlay-modal');
            });

            document.querySelectorAll('.menu-toggle').forEach(tBtn => tBtn.innerText = ui.t(tBtn.innerText.replace('-', '+')));

            if (!isClosing) {
                targetBox.style.display = 'block';
                btn.innerText = ui.t(btn.innerText.replace('+', '-'));
                ui.syncMenuBoxWidth();
            }
        });

        btn.addEventListener('contextmenu', e => {
            e.preventDefault();
            let targetId = btn.getAttribute('data-target');
            let targetBox = document.getElementById(targetId);
            let isClosing = targetBox.style.display === 'block' && targetBox.classList.contains('overlay-modal');

            // Reset all boxes and toggles first
            document.querySelectorAll('.menu-box').forEach(box => {
                box.style.display = 'none';
                box.classList.remove('overlay-modal');
            });
            document.querySelectorAll('.menu-toggle').forEach(tBtn => tBtn.innerText = ui.t(tBtn.innerText.replace('-', '+')));

            if (!isClosing) {
                targetBox.classList.add('overlay-modal');
                targetBox.style.display = 'block';
                btn.innerText = ui.t(btn.innerText.replace('+', '-'));
                ui.syncMenuBoxWidth();
            }
        });
    });

    const notifPosBtn = document.getElementById('opt-notif-pos');
    if (notifPosBtn) {
        notifPosBtn.addEventListener('click', e => {
            e.preventDefault();
            const order = ['tl', 'tr', 'br', 'bl'];
            if (!cm.state.options) cm.state.options = {};
            let current = cm.state.options.notifPosition || 'tl';
            let nextIdx = (order.indexOf(current) + 1) % order.length;
            cm.state.options.notifPosition = order[nextIdx];
            cm.saveOptions();
            updateOptionsUI();
        });
    }

    document.getElementById('close-welcome').addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('welcome-modal').style.display = 'none';
    });

    // Audio Events
    audioEl.addEventListener('loadedmetadata', () => {
        timeTotal.innerText = formatTime(audioEl.duration);
    });
    audioEl.addEventListener('timeupdate', () => {
        if (audioEl.duration) {
            updateAsciiBar(audioEl.currentTime / audioEl.duration);
            timeCurrent.innerText = formatTime(audioEl.currentTime);
            updateLyricsScroll();
            if (window.goUpdateMprisPosition) window.goUpdateMprisPosition(audioEl.currentTime);
        }
    });
    audioEl.addEventListener('ended', () => {
        nextTrack();
    });
    audioEl.addEventListener('error', (e) => {
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
        trackTitleDisplay.innerText = ui.t(errMsg);
        toggleBtn.innerText = ui.t('[play]');
        if (ui && ui.showNotification) {
            ui.showNotification(`Playback error: ${errMsg}`);
        }
        pauseAudio();
    });

    // --- Stat Monitor Logic ---
    let isStatMonitorEnabled = false;
    let fpsCount = 0;
    let currentFps = 0;
    let lastFpsTime = performance.now();
    let statMonitorAnimationFrame = null;
    let cachedBackendStats = null;
    let backendStatsInterval = null;

    const statMonitorEl = document.getElementById('stat-monitor');

    function updateFps() {
        if (!isStatMonitorEnabled) return;
        fpsCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            currentFps = Math.round((fpsCount * 1000) / (now - lastFpsTime));
            fpsCount = 0;
            lastFpsTime = now;
            renderStatMonitor();
        }
        statMonitorAnimationFrame = requestAnimationFrame(updateFps);
    }

    function fetchBackendStats() {
        if (!isStatMonitorEnabled) return;
        if (window.goGetStats) {
            const res = window.goGetStats();
            const handleRes = (dataStr) => {
                try {
                    cachedBackendStats = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
                } catch (e) {
                    cachedBackendStats = null;
                }
                renderStatMonitor();
            };
            if (res && typeof res.then === 'function') {
                res.then(handleRes);
            } else {
                handleRes(res);
            }
        } else {
            renderStatMonitor();
        }
    }

    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
    }

    function formatDuration(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0s';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        let parts = [];
        if (h > 0) parts.push(`${h}h`);
        if (m > 0 || h > 0) parts.push(`${m}m`);
        parts.push(`${s}s`);
        return parts.join(' ');
    }

    function renderStatMonitor() {
        if (!isStatMonitorEnabled || !statMonitorEl) return;

        const activeTrack = pm.getActiveTrack();
        const stateStr = audioEl.paused ? (audioEl.currentTime > 0 ? 'Paused' : 'Stopped') : 'Playing';
        const posStr = `${formatTime(audioEl.currentTime)} / ${formatTime(audioEl.duration)}`;

        let lines = [
            `+-- STATS FOR NERDS --------------------+`,
            `| Version: svmp-lqm 0.0.60 (nightly-lqm)`,
            `| FPS: ${currentFps}`,
            `| Audio State: ${stateStr}`,
            `| Audio Position: ${posStr}`,
            `| Volume: ${Math.round(ae.getVolume() * 100)}% (Muted: ${ae.getMuted()})`
        ];

        if (activeTrack) {
            lines.push(`| Active Track: ${activeTrack.title || activeTrack.originalName || 'Unknown'}`);
        }

        if (cachedBackendStats) {
            const bs = cachedBackendStats;
            lines.push(`| OS/Arch: ${bs.os}/${bs.arch} (${bs.numCpu} CPUs)`);
            lines.push(`| Go Runtime: ${bs.goVersion} (${bs.goroutines} goroutines)`);
            lines.push(`| Go Mem Alloc: ${formatBytes(bs.memAlloc)} / Sys: ${formatBytes(bs.memSys)}`);
            lines.push(`| Server Port: ${bs.serverPort}`);
            lines.push(`| Server Uptime: ${formatDuration(bs.uptimeSecs)}`);
        } else {
            lines.push(`| Backend: Browser Mode (No Go Server)`);
        }

        lines.push(`+---------------------------------------+`);

        statMonitorEl.innerText = lines.join('\n');
    }

    function toggleStatMonitor() {
        isStatMonitorEnabled = !isStatMonitorEnabled;
        if (statMonitorEl) {
            statMonitorEl.style.display = isStatMonitorEnabled ? 'block' : 'none';
        }

        if (isStatMonitorEnabled) {
            fpsCount = 0;
            lastFpsTime = performance.now();
            updateFps();
            fetchBackendStats();
            backendStatsInterval = setInterval(fetchBackendStats, 1000);
        } else {
            if (statMonitorAnimationFrame) {
                cancelAnimationFrame(statMonitorAnimationFrame);
                statMonitorAnimationFrame = null;
            }
            if (backendStatsInterval) {
                clearInterval(backendStatsInterval);
                backendStatsInterval = null;
            }
        }
        updateOptionsUI();
    }

    // UI Toggles
    const optMobileBtn = document.getElementById('opt-mobile');
    const optDeckBtn = document.getElementById('opt-deck');
    const optFocusBtn = document.getElementById('opt-focus');
    const optStatMonitorBtn = document.getElementById('opt-stat-monitor');
    const optResetBtn = document.getElementById('opt-reset');
    const optDisableErrorSkipBtn = document.getElementById('opt-disable-error-skip');

    if (optMobileBtn) optMobileBtn.addEventListener('click', e => { e.preventDefault(); cm.state.isMobile = !cm.state.isMobile; if(cm.state.isMobile) cm.state.isSway = false; localStorage.setItem('env_mobile', cm.state.isMobile); updateOptionsUI(); });
    if (optStatMonitorBtn) optStatMonitorBtn.addEventListener('click', e => { e.preventDefault(); toggleStatMonitor(); });
    if (optDisableErrorSkipBtn) optDisableErrorSkipBtn.addEventListener('click', e => {
        e.preventDefault();
        if (!cm.state.options) cm.state.options = {};
        cm.state.options.disableErrorSkip = !cm.state.options.disableErrorSkip;
        cm.saveOptions();
        updateOptionsUI();
    });
    if (optDeckBtn) optDeckBtn.addEventListener('click', e => { e.preventDefault(); cm.state.isSway = !cm.state.isSway; if(cm.state.isSway) cm.state.isMobile = false; localStorage.setItem('env_mobile', cm.state.isSway); updateOptionsUI(); });

    function toggleFocus() {
        document.body.classList.toggle('focus-mode');
        if (document.body.classList.contains('focus-mode')) {
            document.querySelectorAll('.menu-box').forEach(box => box.style.display = 'none');
            document.querySelectorAll('.menu-toggle').forEach(btn => btn.innerText = ui.t(btn.innerText.replace('-', '+')));
        }
        updateVisualizerDisplay();
        if (window.updateTimebarDisplay) window.updateTimebarDisplay();
        updateOptionsUI();
    }

    if (optFocusBtn) optFocusBtn.addEventListener('click', e => { e.preventDefault(); toggleFocus(); });
    document.getElementById('music-unfocus').addEventListener('click', e => { e.preventDefault(); toggleFocus(); });

    let resetTimer = null;
    if (optResetBtn) optResetBtn.addEventListener('click', e => {
        e.preventDefault();
        if (optResetBtn.innerText.includes('sure') || optResetBtn.innerText.includes('suwe') || optResetBtn.innerText.includes('s...')) {
            localStorage.clear();
            window.location.reload();
        } else {
            optResetBtn.innerText = ui.t('[sure?]');
            clearTimeout(resetTimer);
            resetTimer = setTimeout(() => {
                optResetBtn.innerText = ui.t('[factory reset]');
            }, 3000);
        }
    });

    document.querySelectorAll('.opt-toggle').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            let opt = btn.getAttribute('data-opt');
            let val = btn.getAttribute('data-val');
            
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (!isNaN(val)) val = parseInt(val, 10);
            
            if (opt === 'visualizer') {
                cm.state.visualizer = val;
                if (cm.saveVisualizer) cm.saveVisualizer();
                updateVisualizerDisplay();
            } else {
                if (!cm.state.options) cm.state.options = {};
                cm.state.options[opt] = val;
                cm.saveOptions();
                if (opt === 'timebar') {
                    if (window.updateTimebarDisplay) window.updateTimebarDisplay();
                } else if (opt === 'fullscreen') {
                    syncFullscreenState(val);
                }
            }
            updateOptionsUI();
            
            if (opt === 'marqueeSpeed' && !audioEl.paused) {
                startMarquee();
            }
        });
    });

    document.querySelectorAll('.fx-toggle').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            let fx = btn.getAttribute('data-fx');
            if (fx === 'kawaii') {
                cm.state.fx.kawaii = !cm.state.fx.kawaii;
                cm.state.isUwu = cm.state.fx.kawaii;
                ui.renderDomTextFilters();
                renderGlobalIndex();
                renderCustomPlaylistIndex();
                renderQueueIndex();
                if(searchInput.value) executeSearch();
                loadTrack();
            }
            else if (fx === 'maxTrip') cm.state.fx.maxTrip = !cm.state.fx.maxTrip;
            else if (fx === 'obfuscate') {
                cm.state.fx.obfuscate = !cm.state.fx.obfuscate;
                ui.renderDomTextFilters();
                renderGlobalIndex();
                renderCustomPlaylistIndex();
                renderQueueIndex();
                if(searchInput.value) executeSearch();
                loadTrack();
            }
            else if (fx.startsWith('theme-')) cm.state.fx.theme = fx.replace('theme-', '');
            else if (fx.startsWith('bg-')) cm.state.fx.bg = fx.replace('bg-', '');
            else cm.state.fx[fx] = !cm.state.fx[fx];

            cm.saveFx();
            updateFxUI();
        });
    });

    document.querySelectorAll('.eq-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            let band = btn.getAttribute('data-eq');
            let dir = parseInt(btn.getAttribute('data-dir'), 10);
            cm.state.eq[band] += dir * 3;
            cm.state.eq[band] = Math.max(-15, Math.min(15, cm.state.eq[band]));
            updateEqUI();
        });
    });

    // SCP
    const handleBlinkEnd = (e) => {
        if (!isScpMode) return;
        if (e.type === 'blur' || e.button === 0) {
            document.body.classList.remove('blinking');
            pauseAudio();
        }
    };
    window.addEventListener('mousedown', e => {
        if (!isScpMode || e.button !== 0) return;
        document.body.classList.add('blinking');
        if (pm.getActiveTrack()) playAudio();
    });
    window.addEventListener('mouseup', handleBlinkEnd);
    window.addEventListener('blur', handleBlinkEnd);

    // Search Input
    let searchDebounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(executeSearch, 250);
    });

    // Background loop
    setInterval(() => ui.drawBg(asciiBg, cm.state), 65);

    // Command Palette Events
    cmdInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const val = cmdInput.value;
            if (window.CommandPalette) {
                window.CommandPalette.parseCommand(val);
            }
            cmdInput.value = '';
            // Do not close cmdPalette automatically
        } else if (e.key === 'Escape') {
            cmdInput.value = '';
            cmdPalette.style.display = 'none';
        }
    });

    // Dev Tools Features
    document.getElementById('dev-export-config').addEventListener('click', e => {
        e.preventDefault();
        const data = cm.exportConfig();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'config.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('dev-import-config').addEventListener('click', e => {
        e.preventDefault();
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                if (cm.importConfig(ev.target.result)) {
                    alert('Config imported successfully. Page will reload.');
                    window.location.reload();
                } else {
                    alert('Failed to parse config.json');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });


    document.getElementById('dev-legacy-playlist').addEventListener('click', e => {
        e.preventDefault();
        const legacyBtn = document.getElementById('music-playlist');
        const optLegacy = document.getElementById('opt-legacy-playlist');
        let isHidden = legacyBtn.style.display === 'none';
        legacyBtn.style.display = isHidden ? 'inline-block' : 'none';
        optLegacy.style.display = isHidden ? 'inline-block' : 'none';
        optLegacy.innerText = isHidden ? ui.t('[x] legacy playlist') : ui.t('[ ] legacy playlist');
    });

    document.getElementById('dev-export-playlist').addEventListener('click', e => {
        e.preventDefault();
        const data = pm.exportPlaylist();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'playlist.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('dev-import-playlist').addEventListener('click', e => {
        e.preventDefault();
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const importedList = JSON.parse(ev.target.result);
                    alert(`Playlist expects ${importedList.length} files. Please select the matching local audio files.`);
                    const audioInput = document.createElement('input');
                    audioInput.type = 'file';
                    audioInput.accept = 'audio/*';
                    audioInput.multiple = true;
                    audioInput.onchange = audioEvent => {
                        const files = audioEvent.target.files;
                        pm.addFiles(files, (wasEmpty) => {
                            // Note: We could attempt to reorder based on importedList, but for simplicity we just load the files.
                            renderGlobalIndex();
                            renderCustomPlaylistIndex();
                            renderQueueIndex();
                            if (wasEmpty) {
                                pm.currentIndex = 0;
                                loadTrack();
                                playAudio();
                            }
                            devModal.style.display = 'none';
                        });
                    };
                    audioInput.click();
                } catch(err) {
                    alert('Invalid playlist JSON');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    // Global Close / Esc Helper
    function closeAllModalsAndMenus() {
        document.getElementById('keybind-modal').style.display = 'none';
        document.getElementById('welcome-modal').style.display = 'none';
        document.getElementById('song-info-modal').style.display = 'none';
        document.getElementById('dir-browser-modal').style.display = 'none';
        if (document.getElementById('dir-browser-modal')) document.getElementById('dir-browser-modal').classList.remove('overlay-modal');
        if (indexingModal) indexingModal.style.display = 'none';
        document.getElementById('prompt-modal').style.display = 'none';
        document.getElementById('lists-modal').style.display = 'none';
        devModal.style.display = 'none';
        cmdPalette.style.display = 'none';
        document.querySelectorAll('.menu-box').forEach(box => {
            box.classList.remove('overlay-modal');
            if (!cm.state.isSway && !cm.state.isMobile) {
                box.style.display = 'none';
            }
        });
        if (!cm.state.isSway && !cm.state.isMobile) {
            document.querySelectorAll('.menu-toggle').forEach(btn => btn.innerText = ui.t(btn.innerText.replace('-', '+')));
        }
    }

    // Attach click listeners to all top-right modal close icons [ x ]
    document.addEventListener('click', e => {
        if (e.target.classList.contains('modal-close-x')) {
            e.preventDefault();
            e.stopPropagation();
            closeAllModalsAndMenus();
        }
    });

    // Right-click anywhere on page to close active modals/menus (if right-clicking outside interactive targets like menu-toggles, info-btns, notifications)
    document.addEventListener('contextmenu', e => {
        // If clicking on a menu-toggle button, info button, or notification item, let its own contextmenu handler deal with it
        if (e.target.closest('.menu-toggle') || e.target.closest('.info-btn') || e.target.closest('.notification-item')) {
            return;
        }

        // Check if any modal or menu box (overlay or open) is currently active/visible
        const openModal = document.querySelector('.overlay-modal[style*="display: block"], .overlay-modal[style*="display: flex"], #cmd-palette[style*="display: block"]');
        const openMenu = document.querySelector('.menu-box[style*="display: block"]');

        if (openModal || openMenu) {
            e.preventDefault();
            closeAllModalsAndMenus();
        }
    });

    // Keybinds
    document.addEventListener('keydown', e => {
        if (e.key === 'F11') {
            e.preventDefault();
            toggleFullscreen();
            return;
        }

        if (e.code === 'Backquote' && e.target.tagName !== 'INPUT') {
            e.preventDefault();
            cmdPalette.style.display = cmdPalette.style.display === 'block' ? 'none' : 'block';
            if (cmdPalette.style.display === 'block') cmdInput.focus();
            return;
        }

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'F1') {
            e.preventDefault();
            let searchBtn = document.getElementById('music-search');
            if (searchBtn) {
                // simulate right click / contextmenu to open as modal
                searchBtn.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }));
                let searchBox = document.getElementById('search-box');
                if (searchBox && searchBox.style.display === 'block') {
                    setTimeout(() => searchInput.focus(), 10);
                }
            }
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            closeAllModalsAndMenus();
            return;
        }

        if (e.shiftKey && e.key === '?') { // Shift + / (Usually '?')
             e.preventDefault();
             if (cm.state.devMode) {
                 devModal.style.display = devModal.style.display === 'none' ? 'block' : 'none';
             }
             return;
        }

        if (e.ctrlKey || e.metaKey || e.altKey) return;

        switch(e.code) {
            case 'Space':
                e.preventDefault();
                if (isScpMode) break;
                if (pm.getActiveTrack()) audioEl.paused ? playAudio() : pauseAudio();
                break;
            case 'ArrowRight':
                e.preventDefault();
                nextTrack(true);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                prevTrack();
                break;
            case 'KeyR':
                e.preventDefault();
                if (e.shiftKey) {
                    playRandomTrack();
                } else {
                    if (audioEl.duration) audioEl.currentTime = 0;
                }
                break;
            case 'Slash':
                // Handled in Shift+? check above, but if standard slash without shift:
                if (!e.shiftKey) {
                    e.preventDefault();
                    let modal = document.getElementById('keybind-modal');
                    modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
                }
                break;
            case 'Minus':
            case 'NumpadSubtract':
                e.preventDefault();
                ae.setMuted(false);
                ae.setVolume(ae.getVolume() - 0.1);
                break;
            case 'Equal':
            case 'NumpadAdd':
                e.preventDefault();
                ae.setMuted(false);
                ae.setVolume(ae.getVolume() + 0.1);
                break;
            case 'Digit0':
                e.preventDefault();
                toggleFocus();
                break;
            case 'Digit1':
                e.preventDefault();
                cm.state.visualizer = !cm.state.visualizer;
                if(cm.saveVisualizer) cm.saveVisualizer();
                updateVisualizerDisplay();
                updateOptionsUI();
                break;
            case 'Digit2':
                e.preventDefault();
                cm.state.clockState = (cm.state.clockState + 1) % 3;
                updateClock();
                updateFxUI();
                break;
            case 'Digit3':
                e.preventDefault();
                if (isScpMode) break;
                infoBtn.click();
                break;
            case 'Digit4':
                e.preventDefault();
                ae.toggleMute();
                break;
            case 'Digit6':
                e.preventDefault();
                cm.state.charOverride = null;
                cm.state.isSway = !cm.state.isSway;
                if (cm.state.isSway) cm.state.isMobile = false;
                localStorage.setItem('env_mobile', cm.state.isSway);
                updateOptionsUI();
                updateFxUI();
                break;
            case 'Digit7':
                e.preventDefault();
                if (audioEl.duration) audioEl.currentTime = Math.max(0, audioEl.currentTime - 5);
                break;
            case 'Digit8':
                e.preventDefault();
                if (audioEl.duration) audioEl.currentTime = Math.min(audioEl.duration || 0, audioEl.currentTime + 5);
                break;
        }
    });

    // --- Fullscreen Engine ---
    function syncFullscreenState(requestedState) {
        if (!cm.state.options) cm.state.options = {};

        if (requestedState === undefined) {
            requestedState = !!cm.state.options.fullscreen;
        }

        const isCurrentlyFS = !!document.fullscreenElement;

        if (requestedState && !isCurrentlyFS) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn("Fullscreen request failed:", err);
            });
        } else if (!requestedState && isCurrentlyFS) {
            document.exitFullscreen().catch(err => {
                console.warn("Exit fullscreen failed:", err);
            });
        }

        cm.state.options.fullscreen = requestedState;
        cm.saveOptions();
        updateOptionsUI();
    }

    document.addEventListener('fullscreenchange', () => {
        const isFS = !!document.fullscreenElement;
        if (cm.state.options && cm.state.options.fullscreen !== isFS) {
            cm.state.options.fullscreen = isFS;
            cm.saveOptions();
            updateOptionsUI();
        }
    });

    function toggleFullscreen() {
        const isFS = !!document.fullscreenElement;
        syncFullscreenState(!isFS);
    }

    // Auto-restore fullscreen on first user interaction if enabled in config
    let hasAttemptedInitialFullscreen = false;
    document.addEventListener('click', () => {
        if (!hasAttemptedInitialFullscreen) {
            hasAttemptedInitialFullscreen = true;
            if (cm.state.options && cm.state.options.fullscreen) {
                syncFullscreenState(true);
            }
        }
    });

    // Boot up UI render
    updateNowPlayingHeader();
    updateOptionsUI();
    updateFxUI();
    renderGlobalIndex();
    renderCustomPlaylistIndex();
    renderQueueIndex();
    updateClock();
    if (window.updateTimebarDisplay) window.updateTimebarDisplay();

    // --- Notification Timers ---
    function getRandomInterval(minMins, maxMins) {
        // use random float to avoid exact multiples of 5 (e.g. 5.0, 10.0, 15.0)
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

    // Trigger default greeting notification
    setTimeout(() => {
        if (window.CommandPalette) {
            window.CommandPalette.parseCommand("msg -d hello");
        }
        scheduleTimeNotification();
        scheduleHintNotification();
    }, 750);
});
