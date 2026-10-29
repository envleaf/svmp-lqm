window.VisualEngine = (function() {
    let cm = window.ConfigManager;
    let ae = window.AudioEngine;
    let ui = window.UIManager;

    let visualizerAnimationFrame = null;
    let visualizerCanvas = null;
    let cachedBarColor = '#d4d4d4';
    let lastThemeUpdate = 0;

    function initStars() {
        const starContainer = document.getElementById('star-container');
        if (starContainer && starContainer.children.length === 0) {
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
    }

    function updateClock() {
        if (!cm || !cm.state || cm.state.clockState === 0) return;
        let clockEl = document.getElementById('clock-display');
        if (!clockEl) return;
        let now = new Date();
        let h = String(now.getHours()).padStart(2, '0');
        let m = String(now.getMinutes()).padStart(2, '0');
        let s = String(now.getSeconds()).padStart(2, '0');
        clockEl.innerText = `[${h}:${m}:${s}]`;
    }

    function resizeVisualizerCanvas() {
        if (!visualizerCanvas) visualizerCanvas = document.getElementById('live-visualizer');
        if (!visualizerCanvas) return;
        visualizerCanvas.width = window.innerWidth;
        visualizerCanvas.height = window.innerHeight * 0.25;
    }

    function updateVisualizerDisplay() {
        if (!visualizerCanvas) visualizerCanvas = document.getElementById('live-visualizer');
        if (!visualizerCanvas) return;

        const audioEl = document.getElementById('audio-local');
        if (!cm.state.visualizer || (audioEl && audioEl.paused)) {
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

    function animateVisualizer() {
        if (!visualizerCanvas || visualizerCanvas.style.display === 'none') return;
        visualizerAnimationFrame = requestAnimationFrame(animateVisualizer);

        const ctx = visualizerCanvas.getContext('2d');
        const width = visualizerCanvas.width;
        const height = visualizerCanvas.height;

        ctx.clearRect(0, 0, width, height);

        const dataArray = ae.getFrequencyData();
        if (!dataArray) return;

        const barsPerSide = 128;
        const gap = 3;
        const totalBars = barsPerSide * 2;
        const barWidth = Math.max(1, (width - (totalBars * gap)) / totalBars);

        if (performance.now() - lastThemeUpdate > 1000) {
            const computedStyle = getComputedStyle(document.body);
            cachedBarColor = computedStyle.getPropertyValue('--text-color').trim() || '#d4d4d4';
            lastThemeUpdate = performance.now();
        }

        ctx.fillStyle = cachedBarColor;
        let centerX = Math.floor(width / 2);

        const maxBins = Math.floor(dataArray.length * 0.7);
        const binsPerBar = Math.max(1, Math.floor(maxBins / barsPerSide));

        for (let i = 0; i < barsPerSide; i++) {
            let sum = 0;
            let startBin = i * binsPerBar;
            let endBin = startBin + binsPerBar;
            let actualCount = 0;

            for (let j = startBin; j < endBin && j < maxBins; j++) {
                sum += dataArray[j];
                actualCount++;
            }
            let avgFreq = actualCount > 0 ? sum / actualCount : 0;

            let normalized = avgFreq / 255;
            let gravityScaled = Math.pow(normalized, 2.5);

            let barHeight = gravityScaled * height;
            let offset = i * (barWidth + gap);

            ctx.fillRect(centerX + offset, height - barHeight, barWidth, barHeight);
            ctx.fillRect(centerX - offset - barWidth - gap, height - barHeight, barWidth, barHeight);
        }
    }

    function updateExpieUI() {
        const expieImg = document.getElementById('expie-img');
        if (!expieImg) return;
        if (cm.state.options && cm.state.options.expie) {
            expieImg.style.display = 'block';
            let notifPos = (cm.state.options && cm.state.options.notifPosition) ? cm.state.options.notifPosition : 'tl';
            if (notifPos.endsWith('r')) {
                expieImg.style.right = 'auto';
                expieImg.style.left = '0px';
                expieImg.style.transform = 'scaleX(-1)';
            } else {
                expieImg.style.left = 'auto';
                expieImg.style.right = '0px';
                expieImg.style.transform = 'scaleX(1)';
            }
        } else {
            expieImg.style.display = 'none';
        }
    }

    function init() {
        visualizerCanvas = document.getElementById('live-visualizer');
        initStars();
        resizeVisualizerCanvas();

        window.addEventListener('resize', () => {
            resizeVisualizerCanvas();
            if (ui && ui.syncMenuBoxWidth) ui.syncMenuBoxWidth();
        });

        setInterval(updateClock, 1000);
    }

    // Expose globals
    window.updateVisualizerDisplay = updateVisualizerDisplay;
    window.updateClock = updateClock;

    return {
        init,
        initStars,
        updateClock,
        updateVisualizerDisplay,
        animateVisualizer,
        updateExpieUI,
        resizeVisualizerCanvas
    };
})();
