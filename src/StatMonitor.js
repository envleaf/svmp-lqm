window.StatMonitor = (function() {
    const ae = window.AudioEngine;
    const pm = window.PlaylistManager;

    let isStatMonitorEnabled = false;
    let fpsCount = 0;
    let currentFps = 0;
    let lastFpsTime = performance.now();
    let statMonitorAnimationFrame = null;
    let cachedBackendStats = null;
    let backendStatsInterval = null;

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

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins + ":" + (secs < 10 ? "0" : "") + secs;
    }

    function renderStatMonitor() {
        const statMonitorEl = document.getElementById('stat-monitor');
        if (!isStatMonitorEnabled || !statMonitorEl) return;

        const audioEl = document.getElementById('audio-local');
        const activeTrack = pm ? pm.getActiveTrack() : null;
        const currentTime = audioEl ? audioEl.currentTime : 0;
        const duration = audioEl ? audioEl.duration : 0;
        const isPaused = audioEl ? audioEl.paused : true;

        const stateStr = isPaused ? (currentTime > 0 ? 'Paused' : 'Stopped') : 'Playing';
        const posStr = `${formatTime(currentTime)} / ${formatTime(duration)}`;

        let lines = [
            `+-- STATS FOR NERDS --------------------+`,
            `| Version: svmp-lqm 0.0.64 (nightly-lqm)`,
            `| FPS: ${currentFps}`,
            `| Audio State: ${stateStr}`,
            `| Audio Position: ${posStr}`,
            `| Volume: ${Math.round((ae ? ae.getVolume() : 1) * 100)}% (Muted: ${ae ? ae.getMuted() : false})`
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

    function toggleStatMonitor() {
        isStatMonitorEnabled = !isStatMonitorEnabled;
        const statMonitorEl = document.getElementById('stat-monitor');
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
        if (window.UIController && window.UIController.updateOptionsUI) {
            window.UIController.updateOptionsUI();
        }
    }

    return {
        toggleStatMonitor,
        renderStatMonitor,
        get isStatMonitorEnabled() { return isStatMonitorEnabled; }
    };
})();
