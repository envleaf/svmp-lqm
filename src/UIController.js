window.UIController = (function() {
    const cm = window.ConfigManager;
    const pm = window.PlaylistManager;
    const ae = window.AudioEngine;
    const ui = window.UIManager;

    let matchingSearchResults = [];
    let isScpMode = false;
    let currentInfoIdx = -1;

    function buildDynamicElements() {
        if (!document.getElementById('cmd-palette')) {
            const cmdPalette = document.createElement('div');
            cmdPalette.id = 'cmd-palette';
            cmdPalette.innerHTML = `
                <a href="#" class="modal-close-x">[ x ]</a>
                <input type="text" id="cmd-input" placeholder="> enter command..." autocomplete="off">
                <pre id="cmd-output"></pre>
            `;
            document.body.appendChild(cmdPalette);

            if (window.CommandPalette) {
                window.CommandPalette.init('cmd-output');
            }
        }

        if (!document.getElementById('dev-modal')) {
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
        }
    }

    function getQueuePrefix(idx) {
        let qIdx = pm.manualQueue.indexOf(idx);
        return qIdx > -1 ? `(${qIdx + 1}) ` : '';
    }

    function updateAsciiBar(percent) {
        const asciiBar = document.getElementById('ascii-bar');
        if (!asciiBar) return;
        const barLength = 20;
        let fillCount = Math.floor(percent * barLength);
        fillCount = Math.max(0, Math.min(barLength, fillCount));
        let emptyCount = barLength - fillCount;
        let cFill = (cm.state.fx.kawaii || cm.state.isUwu) ? '♥' : '█';
        let cEmpty = (cm.state.fx.kawaii || cm.state.isUwu) ? '♡' : '-';
        asciiBar.innerText = '[' + cFill.repeat(fillCount) + cEmpty.repeat(emptyCount) + ']';
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

    function updateFxUI() {
        const audioEl = document.getElementById('audio-local');
        const volBar = document.getElementById('vol-bar');
        let isK = cm.state.fx.kawaii || cm.state.isUwu;

        let kawaiiToggle = document.querySelector('[data-fx="kawaii"]');
        let maxTripToggle = document.querySelector('[data-fx="maxTrip"]');
        if (kawaiiToggle) kawaiiToggle.innerText = isK ? ui.t('[x] kawaii') : ui.t('[ ] kawaii');
        if (maxTripToggle) maxTripToggle.innerText = cm.state.fx.maxTrip ? ui.t('[x] max trip (LAG)') : ui.t('[ ] max trip (LAG)');

        const stdFx = document.getElementById('standard-fx');
        if (stdFx) {
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

        const asciiBg = document.getElementById('ascii-bg');
        if (!isK && cm.state.fx.bg === 'none' && asciiBg) asciiBg.innerText = '';

        updateAsciiBar(audioEl && audioEl.duration ? (audioEl.currentTime / audioEl.duration) : 0);
        if (volBar) volBar.innerText = ae.setVolume(ae.getVolume());
        updateEqUI();
        if (window.VisualEngine) window.VisualEngine.updateVisualizerDisplay();
    }

    function updateOptionsUI() {
        const dlAddBtn = document.getElementById('music-dl-add');
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
        if (optStatMonitorBtn) {
            let isEnabled = window.StatMonitor ? window.StatMonitor.isStatMonitorEnabled : false;
            optStatMonitorBtn.innerText = isEnabled ? ui.t('[x] stat monitor') : ui.t('[ ] stat monitor');
        }
        if (optLocalBtn) optLocalBtn.innerText = ui.t('[mode: local]');
        if (dlAddBtn) dlAddBtn.innerText = ui.t(`[${cm.state.nativeDir || '/'}]`);
        if (optDisableErrorSkipBtn) {
            let isSkipped = cm.state.options && cm.state.options.disableErrorSkip;
            optDisableErrorSkipBtn.innerText = isSkipped ? ui.t('[x] disable error skip') : ui.t('[ ] disable error skip');
        }

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

        if (window.VisualEngine) window.VisualEngine.updateExpieUI();

        if (cm.state.isMobile) {
            document.body.classList.add('mobile-mode');
            document.body.classList.remove('sway-mode');
        } else if (cm.state.isSway) {
            document.body.classList.add('sway-mode');
            document.body.classList.remove('mobile-mode');
        } else {
            document.body.classList.remove('mobile-mode', 'sway-mode');
        }

        document.querySelectorAll('.opt-toggle').forEach(btn => {
            let opt = btn.getAttribute('data-opt');
            let val = btn.getAttribute('data-val');

            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (!isNaN(val)) val = parseInt(val, 10);

            let isActive = false;
            if (opt === 'visualizer') {
                isActive = cm.state[opt] === val;
            } else {
                isActive = cm.state.options && cm.state.options[opt] === val;
            }

            let text = btn.innerText.substring(3);
            btn.innerText = isActive ? ui.t(`[x]${text}`) : ui.t(`[ ]${text}`);
        });

        if (window.VisualEngine) window.VisualEngine.animateVisualizer();
        updateFxUI();
    }

    function updateNowPlayingHeader() {
        const nowPlayingLabel = document.getElementById('now-playing-label');
        if (!nowPlayingLabel) return;
        if (pm.activePlaylistName) {
            nowPlayingLabel.innerText = ui.t(`now playing (${pm.activePlaylistName}):`);
        } else {
            nowPlayingLabel.innerText = ui.t(`now playing:`);
        }
    }

    function handleTrackLinkClick(e, link) {
        e.preventDefault();
        const searchInput = document.getElementById('search-input');
        let globalIdx = parseInt(link.getAttribute('data-idx'), 10);

        if (e.button === 1) { // Middle click
            pm.toggleQueue(globalIdx);
            refreshIndices();
            if (searchInput && searchInput.value) executeSearch();
            if (window.PlayerController) window.PlayerController.saveCurrentQueueState();
        } else if (e.button === 0) { // Left click
            if (pm.activePlaylistName) {
                pm.exitPlaylistQueue();
                updateNowPlayingHeader();
            }
            pm.playTrackByGlobalIndex(globalIdx);
            if (window.PlayerController) {
                window.PlayerController.loadTrack();
                window.PlayerController.playAudio();
            }
            refreshIndices();
            if (searchInput && searchInput.value) executeSearch();
        }
    }

    function bindInfoButtons(container) {
        if (!container) return;
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
        const audioEl = document.getElementById('audio-local');
        const toggleBtn = document.getElementById('music-toggle');
        const searchInput = document.getElementById('search-input');
        let isCurrent = (pm.currentGlobalIdx === globalIdx);

        if (pm.removeTrack(globalIdx)) {
            let activeTrack = pm.getActiveTrack();
            if (!activeTrack && audioEl && !audioEl.paused) {
                if (window.PlayerController) window.PlayerController.pauseAudio();
                audioEl.removeAttribute('src');
            } else if (isCurrent && activeTrack) {
                if (window.PlayerController) {
                    window.PlayerController.pauseAudio();
                    window.PlayerController.loadTrack();
                    if (toggleBtn && toggleBtn.innerText.includes('pause')) {
                        window.PlayerController.playAudio();
                    }
                }
            }

            refreshIndices();
            if (searchInput && searchInput.value) executeSearch();

            if (window.CommandPalette) {
                window.CommandPalette.setOutput(`Removed track from index.`);
            }
        }
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
            link.addEventListener('auxclick', e => handleTrackLinkClick(e, link));
        });
        bindInfoButtons(indexResults);
    }

    function renderCustomPlaylistIndex() {
        const customIndexBox = document.getElementById('custom-index-box');
        if (!customIndexBox) return;

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
                if (!track) return;
                let num = String(i + 1).padStart(2, '0');
                let titleStr = getQueuePrefix(globalIdx) + track.title;
                let line = `| ${num}. ${titleStr}`;
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

    function refreshIndices() {
        renderGlobalIndex();
        renderCustomPlaylistIndex();
        renderQueueIndex();
    }

    function parseSearchQuery(rawQuery) {
        let q = rawQuery.trim();
        if (!q) return { title: '', artist: null, album: null };

        const operandRegex = /(?:^|\s)(a:|b:)/gi;
        let matches = [];
        let match;
        while ((match = operandRegex.exec(q)) !== null) {
            let operand = match[1].toLowerCase();
            let operandStart = match.index + (match[0].length - match[1].length);
            matches.push({ operand: operand, start: operandStart, length: match[1].length });
        }

        if (matches.length === 0) {
            return { title: q, artist: null, album: null };
        }

        let title = q.substring(0, matches[0].start).trim();
        let artist = null;
        let album = null;

        for (let i = 0; i < matches.length; i++) {
            let current = matches[i];
            let valStart = current.start + current.length;
            let valEnd = (i + 1 < matches.length) ? matches[i + 1].start : q.length;
            let val = q.substring(valStart, valEnd).trim();

            if (current.operand === 'a:') {
                artist = val;
            } else if (current.operand === 'b:') {
                album = val;
            }
        }

        return { title, artist, album };
    }

    function executeSearch() {
        const searchInput = document.getElementById('search-input');
        const searchResults = document.getElementById('search-results');
        const searchQueueAllBtn = document.getElementById('search-queue-all');
        const searchClearBtn = document.getElementById('search-clear');
        if (!searchInput || !searchResults) return;

        let rawQuery = searchInput.value.trim();
        if (!rawQuery) {
            searchResults.innerHTML = '';
            matchingSearchResults = [];
            if (searchQueueAllBtn) searchQueueAllBtn.style.display = 'none';
            if (searchClearBtn) searchClearBtn.style.display = 'none';
            return;
        } else {
            if (searchClearBtn) searchClearBtn.style.display = 'inline-block';
        }

        const parsed = parseSearchQuery(rawQuery);
        let titleQ = parsed.title.toLowerCase();
        let artistQ = parsed.artist !== null ? parsed.artist.toLowerCase() : null;
        let albumQ = parsed.album !== null ? parsed.album.toLowerCase() : null;

        let html = '';
        let count = 0;
        matchingSearchResults = [];

        const playlist = pm.playlist;
        const activeIndices = pm.activeIndices;

        activeIndices.forEach((globalIdx, localIdx) => {
            let track = playlist[globalIdx];

            // Artist filter check
            if (artistQ !== null) {
                if (!track.artist || track.artist.trim() === '' || track.artist.trim().toLowerCase() === 'unknown') {
                    return;
                }
                if (!track.artist.toLowerCase().includes(artistQ)) {
                    return;
                }
            }

            // Album filter check
            if (albumQ !== null) {
                if (!track.album || track.album.trim() === '' || track.album.trim().toLowerCase() === 'unknown') {
                    return;
                }
                if (!track.album.toLowerCase().includes(albumQ)) {
                    return;
                }
            }

            // Title filter check
            if (titleQ.length > 0) {
                if (!track.title.toLowerCase().includes(titleQ)) {
                    return;
                }
            }

            matchingSearchResults.push(globalIdx);
            let num = String(localIdx + 1).padStart(2, '0');
            let qPrefix = getQueuePrefix(globalIdx);

            let highlightedTitle;
            if (titleQ.length > 0) {
                let titleLower = track.title.toLowerCase();
                let matchStart = titleLower.indexOf(titleQ);
                let matchEnd = matchStart + titleQ.length;

                let beforeMatch = track.title.substring(0, matchStart);
                let matchText = track.title.substring(matchStart, matchEnd);
                let afterMatch = track.title.substring(matchEnd);

                highlightedTitle = `${ui.t(qPrefix)}${ui.t(beforeMatch)}<span style="background-color: var(--text-color); color: var(--bg-color);">${ui.t(matchText)}</span>${ui.t(afterMatch)}`;
            } else {
                highlightedTitle = `${ui.t(qPrefix)}${ui.t(track.title)}`;
            }

            html += `<div style="display: flex;"><a href="#" class="info-btn" data-idx="${globalIdx}" style="text-decoration: none; margin-right: 5px;">[i]</a><a href="#" class="search-result-link track-link" data-idx="${globalIdx}" style="display: block; text-decoration: none; flex-grow: 1;">| ${num}. ${highlightedTitle}</a></div>`;
            count++;
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

    function updateLyricsScroll() {
        const audioEl = document.getElementById('audio-local');
        const lyricsContent = document.getElementById('lyrics-content');
        if (!audioEl || !lyricsContent) return;

        let parsed = ae.getParsedLyrics();
        if (parsed.length === 0) return;

        let t = audioEl.currentTime;
        let activeIdx = -1;
        for (let i = 0; i < parsed.length; i++) {
            if (t >= parsed[i].time) activeIdx = i;
            else break;
        }

        let html = "";
        if (activeIdx >= 1) html += `<span style="opacity: 0.4;">${ui.t(parsed[activeIdx-1].text)}</span>\n`;
        if (activeIdx >= 0) html += `<strong style="color: var(--text-color); text-shadow: 0 0 4px var(--prompt-color);">> ${ui.t(parsed[activeIdx].text)}</strong>\n`;

        let lookAhead = 5;
        for (let j = activeIdx + 1; j < parsed.length && j <= activeIdx + lookAhead; j++) {
            html += `${ui.t(parsed[j].text)}\n`;
        }

        lyricsContent.innerHTML = html || "♪";
    }

    async function openInfoModal(globalIdx) {
        const track = pm.playlist[globalIdx];
        if (!track) return;
        currentInfoIdx = globalIdx;

        const infoModal = document.getElementById('song-info-modal');
        const infoArt = document.getElementById('song-info-artwork');
        const infoArtPlaceholder = document.getElementById('song-info-artwork-placeholder');

        if (!track._fetchedOnlineMetadata && (!track.artist || track.artist.toLowerCase() === 'unknown' || !track.album || track.album.toLowerCase() === 'unknown' || !track.onlineArtUrl)) {
            if (window.PlayerController) await window.PlayerController.fetchOnlineTrackMetadata(track);
        }

        document.getElementById('song-info-title').innerText = track.title || "Unknown";
        document.getElementById('song-info-artist').innerText = track.artist || "Unknown";
        document.getElementById('song-info-album').innerText = track.album || "Unknown";
        document.getElementById('song-info-bitrate').innerText = "Unknown";

        const playFromBtn = document.getElementById('song-info-play-from');
        const goToBtn = document.getElementById('song-info-go-to');
        const playAlbumBtn = document.getElementById('song-info-play-album');
        const playArtistBtn = document.getElementById('song-info-play-artist');
        const gotoAlbumBtn = document.getElementById('song-info-goto-album');
        const gotoArtistBtn = document.getElementById('song-info-goto-artist');

        let hasAlbum = track.album && track.album.trim() !== '' && track.album.toLowerCase() !== 'unknown';
        let hasArtist = track.artist && track.artist.trim() !== '' && track.artist.toLowerCase() !== 'unknown';

        if (playFromBtn) playFromBtn.style.display = (hasAlbum || hasArtist) ? 'inline-block' : 'none';
        if (goToBtn) goToBtn.style.display = (hasAlbum || hasArtist) ? 'inline-block' : 'none';
        if (playAlbumBtn) playAlbumBtn.style.display = 'none';
        if (playArtistBtn) playArtistBtn.style.display = 'none';
        if (gotoAlbumBtn) gotoAlbumBtn.style.display = 'none';
        if (gotoArtistBtn) gotoArtistBtn.style.display = 'none';

        if (infoArt) infoArt.style.display = 'none';
        if (infoArtPlaceholder) infoArtPlaceholder.style.display = 'flex';

        if (infoArt) {
            infoArt.onerror = async function() {
                if (track && !track._onlineArtFailed) {
                    track._onlineArtFailed = true;
                    if (!track._fetchedOnlineMetadata && window.PlayerController) {
                        await window.PlayerController.fetchOnlineTrackMetadata(track);
                    }
                    if (track.onlineArtUrl) {
                        infoArt.onerror = null;
                        infoArt.src = track.onlineArtUrl;
                        infoArt.style.display = 'block';
                        if (infoArtPlaceholder) infoArtPlaceholder.style.display = 'none';
                        return;
                    }
                }
                infoArt.style.display = 'none';
                if (infoArtPlaceholder) infoArtPlaceholder.style.display = 'flex';
            };

            if (track.file && window.jsmediatags) {
                window.jsmediatags.read(track.file, {
                    onSuccess: function(tag) {
                        if (tag.tags.album) {
                            document.getElementById('song-info-album').innerText = tag.tags.album;
                            track.album = tag.tags.album;
                            let hasAlbumNow = true;
                            let hasArtistNow = track.artist && track.artist.trim() !== '' && track.artist.toLowerCase() !== 'unknown';
                            if (playFromBtn && playFromBtn.style.display !== 'none') playFromBtn.style.display = 'inline-block';
                            if (goToBtn && goToBtn.style.display !== 'none') goToBtn.style.display = 'inline-block';
                        }

                        if (tag.tags.picture) {
                            const { data, format } = tag.tags.picture;
                            let base64String = "";
                            for (let i = 0; i < data.length; i++) {
                                base64String += String.fromCharCode(data[i]);
                            }
                            infoArt.src = `data:${format};base64,${window.btoa(base64String)}`;
                            infoArt.style.display = 'block';
                            if (infoArtPlaceholder) infoArtPlaceholder.style.display = 'none';
                        } else if (track.onlineArtUrl) {
                            infoArt.src = track.onlineArtUrl;
                            infoArt.style.display = 'block';
                            if (infoArtPlaceholder) infoArtPlaceholder.style.display = 'none';
                        }
                    },
                    onError: function() {
                        if (track.onlineArtUrl) {
                            infoArt.src = track.onlineArtUrl;
                            infoArt.style.display = 'block';
                            if (infoArtPlaceholder) infoArtPlaceholder.style.display = 'none';
                        }
                    }
                });
            } else if (!track.file && track.originalPath) {
                let currentHost = window.location.host;
                let artSrc = `http://${currentHost}/art?path=${encodeURIComponent(track.originalPath)}`;
                if (track.onlineArtUrl) {
                    artSrc += `&url=${encodeURIComponent(track.onlineArtUrl)}`;
                }
                infoArt.src = artSrc;
                infoArt.style.display = 'block';
                if (infoArtPlaceholder) infoArtPlaceholder.style.display = 'none';
            } else if (track.onlineArtUrl) {
                infoArt.src = track.onlineArtUrl;
                infoArt.style.display = 'block';
                if (infoArtPlaceholder) infoArtPlaceholder.style.display = 'none';
            }
        }

        if (infoModal) infoModal.style.display = 'block';
    }

    function promptUser(title, callback) {
        const modal = document.getElementById('prompt-modal');
        const titleEl = document.getElementById('prompt-modal-title');
        const inputEl = document.getElementById('prompt-modal-input');
        const cancelBtn = document.getElementById('prompt-modal-cancel');
        const okBtn = document.getElementById('prompt-modal-ok');

        if (!modal) return;
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

        function onOk(e) { if (e) e.preventDefault(); let val = inputEl.value.trim(); cleanup(); callback(val); }
        function onCancel(e) { if (e) e.preventDefault(); cleanup(); callback(null); }
        function onKey(e) { if (e.key === 'Enter') { onOk(); } else if (e.key === 'Escape') { onCancel(); } }
        function onWindowKey(e) { if (e.key === 'Escape') onCancel(); }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        inputEl.addEventListener('keydown', onKey);
        setTimeout(() => window.addEventListener('keydown', onWindowKey), 10);
    }

    function closeAllModalsAndMenus() {
        const devModal = document.getElementById('dev-modal');
        const cmdPalette = document.getElementById('cmd-palette');
        const indexingModal = document.getElementById('indexing-modal');

        document.getElementById('keybind-modal').style.display = 'none';
        const patchNotesModal = document.getElementById('patch-notes-modal');
        if (patchNotesModal) patchNotesModal.style.display = 'none';
        document.getElementById('welcome-modal').style.display = 'none';
        document.getElementById('song-info-modal').style.display = 'none';
        const dirBrowserModal = document.getElementById('dir-browser-modal');
        if (dirBrowserModal) {
            dirBrowserModal.style.display = 'none';
            dirBrowserModal.classList.remove('overlay-modal');
        }
        if (indexingModal) indexingModal.style.display = 'none';
        document.getElementById('prompt-modal').style.display = 'none';
        document.getElementById('lists-modal').style.display = 'none';
        if (devModal) devModal.style.display = 'none';
        if (cmdPalette) cmdPalette.style.display = 'none';

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

    function toggleFullscreen() {
        const isFS = !!document.fullscreenElement;
        syncFullscreenState(!isFS);
    }

    function toggleFocus() {
        document.body.classList.toggle('focus-mode');
        if (document.body.classList.contains('focus-mode')) {
            document.querySelectorAll('.menu-box').forEach(box => box.style.display = 'none');
            document.querySelectorAll('.menu-toggle').forEach(btn => btn.innerText = ui.t(btn.innerText.replace('-', '+')));
        }
        if (window.VisualEngine) window.VisualEngine.updateVisualizerDisplay();
        if (window.updateTimebarDisplay) window.updateTimebarDisplay();
        updateOptionsUI();
    }

    function toggleScp() {
        const audioEl = document.getElementById('audio-local');
        isScpMode = !isScpMode;
        if (isScpMode) {
            if (window.PlayerController) window.PlayerController.pauseAudio();
        } else {
            document.body.classList.remove('blinking');
        }
        updateFxUI();
    }

    function bindEvents() {
        const audioEl = document.getElementById('audio-local');
        const toggleBtn = document.getElementById('music-toggle');
        const nextBtn = document.getElementById('music-next');
        const prevBtn = document.getElementById('music-prev');
        const shuffleBtn = document.getElementById('music-shuffle');
        const favBtn = document.getElementById('music-fav');
        const infoBtn = document.getElementById('music-info');
        const dlAddBtn = document.getElementById('music-dl-add');
        const volBar = document.getElementById('vol-bar');
        const asciiBar = document.getElementById('ascii-bar');
        const searchInput = document.getElementById('search-input');
        const searchClearBtn = document.getElementById('search-clear');
        const playlistInput = document.getElementById('playlist-input');
        const nowPlayingLabel = document.getElementById('now-playing-label');

        if (nowPlayingLabel) {
            nowPlayingLabel.addEventListener('click', e => {
                e.preventDefault();
                if (pm.activePlaylistName) {
                    pm.exitPlaylistQueue();
                    updateNowPlayingHeader();
                    refreshIndices();
                    if (searchInput && searchInput.value) executeSearch();
                    if (ui && ui.showNotification) {
                        ui.showNotification("Playlist queue ended.");
                    }
                }
            });
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', e => {
                e.preventDefault();
                if (isScpMode) return;
                if (audioEl) {
                    audioEl.paused ? window.PlayerController.playAudio() : window.PlayerController.pauseAudio();
                }
            });
        }

        if (nextBtn) nextBtn.addEventListener('click', e => { e.preventDefault(); window.PlayerController.nextTrack(true); });
        if (prevBtn) prevBtn.addEventListener('click', e => { e.preventDefault(); window.PlayerController.prevTrack(); });

        if (shuffleBtn) {
            shuffleBtn.addEventListener('click', e => {
                e.preventDefault();
                pm.isShuffle = !pm.isShuffle;
                shuffleBtn.innerText = pm.isShuffle ? ui.t('[shuffle (x)]') : ui.t('[shuffle ( )]');
                renderQueueIndex();
                if (window.PlayerController) window.PlayerController.saveCurrentQueueState();
            });
        }

        if (favBtn) {
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
        }

        if (infoBtn) {
            infoBtn.addEventListener('click', e => {
                e.preventDefault();
                if (pm.activeIndices.length === 0) return;
                let globalIdx = pm.currentGlobalIdx;
                if (globalIdx !== undefined && globalIdx !== -1) {
                    openInfoModal(globalIdx);
                }
            });
        }

        if (volBar) {
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
        }

        if (asciiBar) {
            asciiBar.addEventListener('click', e => {
                if (audioEl && audioEl.duration) {
                    const rect = asciiBar.getBoundingClientRect();
                    let clickX = e.clientX - rect.left;
                    let percent = Math.max(0, Math.min(1, clickX / rect.width));
                    audioEl.currentTime = percent * audioEl.duration;
                }
            });
        }

        const playlistLoad = document.getElementById('playlist-load');
        if (playlistLoad) {
            playlistLoad.addEventListener('click', e => {
                e.preventDefault();
                if (playlistInput && playlistInput.value) {
                    if (pm.buildCustomPlaylist(playlistInput.value)) {
                        const statusText = document.getElementById('playlist-status-text');
                        if (statusText) statusText.innerText = ui.t(">> custom playlist active");
                        window.PlayerController.loadTrack();
                        if (toggleBtn && toggleBtn.innerText.includes('pause')) window.PlayerController.playAudio();
                        renderCustomPlaylistIndex();
                        renderQueueIndex();
                        if (searchInput && searchInput.value) executeSearch();
                    }
                }
            });
        }

        const playlistClear = document.getElementById('playlist-clear');
        if (playlistClear) {
            playlistClear.addEventListener('click', e => {
                e.preventDefault();
                pm.clearCustomPlaylist();
                updateNowPlayingHeader();
                if (playlistInput) playlistInput.value = '';
                const statusText = document.getElementById('playlist-status-text');
                if (statusText) statusText.innerText = "";
                window.PlayerController.loadTrack();
                renderCustomPlaylistIndex();
                renderQueueIndex();
                if (searchInput && searchInput.value) executeSearch();
                if (toggleBtn && toggleBtn.innerText.includes('pause')) window.PlayerController.playAudio();
            });
        }

        document.querySelectorAll('.menu-toggle').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                let targetId = btn.getAttribute('data-target');
                let targetBox = document.getElementById(targetId);
                let isClosing = targetBox.style.display === 'block';

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

        if (dlAddBtn) {
            dlAddBtn.addEventListener('click', e => {
                e.preventDefault();
                let startingDir = cm.state.nativeDir;
                const dirBrowserModal = document.getElementById('dir-browser-modal');
                if (window.goOpenDirBrowser) {
                    if (startingDir) {
                        window.goOpenDirBrowser(startingDir);
                    } else {
                        window.goOpenDirBrowser("");
                    }
                    if (dirBrowserModal) {
                        dirBrowserModal.style.display = 'flex';
                        dirBrowserModal.classList.add('overlay-modal');
                    }
                } else {
                    console.warn("Go bridge not found for directory browser");
                }
            });
        }

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

        const closeWelcome = document.getElementById('close-welcome');
        if (closeWelcome) {
            closeWelcome.addEventListener('click', e => {
                e.preventDefault();
                document.getElementById('welcome-modal').style.display = 'none';
            });
        }

        const songInfoClose = document.getElementById('song-info-close');
        if (songInfoClose) {
            songInfoClose.addEventListener('click', e => {
                e.preventDefault();
                document.getElementById('song-info-modal').style.display = 'none';
            });
        }

        const songInfoQueue = document.getElementById('song-info-queue');
        if (songInfoQueue) {
            songInfoQueue.addEventListener('click', e => {
                e.preventDefault();
                pm.toggleQueue(currentInfoIdx);
                refreshIndices();
                if (searchInput && searchInput.value) executeSearch();
                document.getElementById('song-info-modal').style.display = 'none';
            });
        }

        const playFromBtn = document.getElementById('song-info-play-from');
        const goToBtn = document.getElementById('song-info-go-to');
        const songInfoPlayAlbum = document.getElementById('song-info-play-album');
        const songInfoPlayArtist = document.getElementById('song-info-play-artist');
        const gotoArtistBtn = document.getElementById('song-info-goto-artist');
        const gotoAlbumBtn = document.getElementById('song-info-goto-album');

        if (playFromBtn) {
            playFromBtn.addEventListener('click', e => {
                e.preventDefault();
                if (currentInfoIdx === -1) return;
                let track = pm.playlist[currentInfoIdx];
                if (!track) return;
                let hasAlbum = track.album && track.album.trim() !== '' && track.album.toLowerCase() !== 'unknown';
                let hasArtist = track.artist && track.artist.trim() !== '' && track.artist.toLowerCase() !== 'unknown';

                playFromBtn.style.display = 'none';
                if (songInfoPlayArtist) songInfoPlayArtist.style.display = hasArtist ? 'inline-block' : 'none';
                if (songInfoPlayAlbum) songInfoPlayAlbum.style.display = hasAlbum ? 'inline-block' : 'none';

                if (goToBtn) goToBtn.style.display = (hasAlbum || hasArtist) ? 'inline-block' : 'none';
                if (gotoArtistBtn) gotoArtistBtn.style.display = 'none';
                if (gotoAlbumBtn) gotoAlbumBtn.style.display = 'none';
            });
        }

        if (goToBtn) {
            goToBtn.addEventListener('click', e => {
                e.preventDefault();
                if (currentInfoIdx === -1) return;
                let track = pm.playlist[currentInfoIdx];
                if (!track) return;
                let hasAlbum = track.album && track.album.trim() !== '' && track.album.toLowerCase() !== 'unknown';
                let hasArtist = track.artist && track.artist.trim() !== '' && track.artist.toLowerCase() !== 'unknown';

                goToBtn.style.display = 'none';
                if (gotoArtistBtn) gotoArtistBtn.style.display = hasArtist ? 'inline-block' : 'none';
                if (gotoAlbumBtn) gotoAlbumBtn.style.display = hasAlbum ? 'inline-block' : 'none';

                if (playFromBtn) playFromBtn.style.display = (hasAlbum || hasArtist) ? 'inline-block' : 'none';
                if (songInfoPlayArtist) songInfoPlayArtist.style.display = 'none';
                if (songInfoPlayAlbum) songInfoPlayAlbum.style.display = 'none';
            });
        }

        function triggerSearchQuery(queryStr) {
            document.getElementById('song-info-modal').style.display = 'none';
            const searchBox = document.getElementById('search-box');
            const searchBtn = document.getElementById('music-search');
            const searchInput = document.getElementById('search-input');

            if (searchBox && searchBox.style.display !== 'block') {
                if (searchBtn) {
                    searchBtn.click();
                }
            }

            if (searchInput) {
                searchInput.value = queryStr;
                executeSearch();
                setTimeout(() => searchInput.focus(), 10);
            }
        }

        if (gotoArtistBtn) {
            gotoArtistBtn.addEventListener('click', e => {
                e.preventDefault();
                if (currentInfoIdx !== -1) {
                    let track = pm.playlist[currentInfoIdx];
                    if (track && track.artist && track.artist.toLowerCase() !== 'unknown') {
                        triggerSearchQuery(`a: ${track.artist.toLowerCase().trim()}`);
                    }
                }
            });
        }

        if (gotoAlbumBtn) {
            gotoAlbumBtn.addEventListener('click', e => {
                e.preventDefault();
                if (currentInfoIdx !== -1) {
                    let track = pm.playlist[currentInfoIdx];
                    if (track && track.album && track.album.toLowerCase() !== 'unknown') {
                        triggerSearchQuery(`b: ${track.album.toLowerCase().trim()}`);
                    }
                }
            });
        }

        if (songInfoPlayAlbum) {
            songInfoPlayAlbum.addEventListener('click', e => {
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
                            refreshIndices();
                            if (searchInput && searchInput.value) executeSearch();
                            if (audioEl && audioEl.paused) {
                                if (pm.getActiveTrack()) {
                                    window.PlayerController.loadTrack();
                                    window.PlayerController.playAudio();
                                } else {
                                    let nextGIdx = pm.nextTrack();
                                    if (nextGIdx !== null && nextGIdx !== undefined) {
                                        window.PlayerController.loadTrack();
                                        window.PlayerController.playAudio();
                                    }
                                }
                            }
                        }
                    }
                    document.getElementById('song-info-modal').style.display = 'none';
                }
            });
        }

        if (songInfoPlayArtist) {
            songInfoPlayArtist.addEventListener('click', e => {
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
                            refreshIndices();
                            if (searchInput && searchInput.value) executeSearch();
                            if (audioEl && audioEl.paused) {
                                if (pm.getActiveTrack()) {
                                    window.PlayerController.loadTrack();
                                    window.PlayerController.playAudio();
                                } else {
                                    let nextGIdx = pm.nextTrack();
                                    if (nextGIdx !== null && nextGIdx !== undefined) {
                                        window.PlayerController.loadTrack();
                                        window.PlayerController.playAudio();
                                    }
                                }
                            }
                        }
                    }
                    document.getElementById('song-info-modal').style.display = 'none';
                }
            });
        }

        const songInfoAddList = document.getElementById('song-info-add-list');
        if (songInfoAddList) {
            songInfoAddList.addEventListener('click', e => {
                e.preventDefault();
                if (currentInfoIdx > -1) {
                    let track = pm.playlist[currentInfoIdx];
                    if (track && track.originalPath) {
                        document.getElementById('song-info-modal').style.display = 'none';
                        if (window.ListsManager) window.ListsManager.openListsModal('add', track);
                    }
                }
            });
        }

        const songInfoRemove = document.getElementById('song-info-remove');
        if (songInfoRemove) {
            songInfoRemove.addEventListener('click', e => {
                e.preventDefault();
                removeTrackAction(currentInfoIdx);
                document.getElementById('song-info-modal').style.display = 'none';
            });
        }

        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', e => {
                e.preventDefault();
                if (searchInput) searchInput.value = '';
                executeSearch();
                if (searchInput) searchInput.focus();
            });
        }

        const searchQueueAllBtn = document.getElementById('search-queue-all');
        if (searchQueueAllBtn) {
            searchQueueAllBtn.addEventListener('click', e => {
                e.preventDefault();
                if (matchingSearchResults.length === 0) return;
                pm.prependToQueue(matchingSearchResults, pm.isShuffle);
                refreshIndices();
                executeSearch();
                if (audioEl && audioEl.paused) {
                    if (pm.getActiveTrack()) {
                        window.PlayerController.loadTrack();
                        window.PlayerController.playAudio();
                    } else {
                        let nextGIdx = pm.nextTrack();
                        if (nextGIdx !== null && nextGIdx !== undefined) {
                            window.PlayerController.loadTrack();
                            window.PlayerController.playAudio();
                        }
                    }
                }
            });
        }

        // Search Input Debounce
        if (searchInput) {
            let searchDebounceTimer;
            searchInput.addEventListener('input', () => {
                if (searchClearBtn) {
                    searchClearBtn.style.display = searchInput.value.length > 0 ? 'inline-block' : 'none';
                }
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(executeSearch, 250);
            });
        }

        // Toggles & Dev Modal Events
        const optMobileBtn = document.getElementById('opt-mobile');
        const optDeckBtn = document.getElementById('opt-deck');
        const optFocusBtn = document.getElementById('opt-focus');
        const optStatMonitorBtn = document.getElementById('opt-stat-monitor');
        const optResetBtn = document.getElementById('opt-reset');
        const optDisableErrorSkipBtn = document.getElementById('opt-disable-error-skip');
        const checkUpdatesBtn = document.getElementById('opt-check-updates');
        const musicUnfocus = document.getElementById('music-unfocus');

        if (checkUpdatesBtn) {
            checkUpdatesBtn.addEventListener('click', e => {
                e.preventDefault();
                if (window.UpdateManager) {
                    window.UpdateManager.checkForUpdates(true);
                }
            });
        }

        if (optMobileBtn) optMobileBtn.addEventListener('click', e => { e.preventDefault(); cm.state.isMobile = !cm.state.isMobile; if (cm.state.isMobile) cm.state.isSway = false; localStorage.setItem('env_mobile', cm.state.isMobile); updateOptionsUI(); });
        if (optStatMonitorBtn) optStatMonitorBtn.addEventListener('click', e => { e.preventDefault(); if (window.StatMonitor) window.StatMonitor.toggleStatMonitor(); });
        if (optDisableErrorSkipBtn) optDisableErrorSkipBtn.addEventListener('click', e => {
            e.preventDefault();
            if (!cm.state.options) cm.state.options = {};
            cm.state.options.disableErrorSkip = !cm.state.options.disableErrorSkip;
            cm.saveOptions();
            updateOptionsUI();
        });
        if (optDeckBtn) optDeckBtn.addEventListener('click', e => { e.preventDefault(); cm.state.isSway = !cm.state.isSway; if (cm.state.isSway) cm.state.isMobile = false; localStorage.setItem('env_mobile', cm.state.isSway); updateOptionsUI(); });
        if (optFocusBtn) optFocusBtn.addEventListener('click', e => { e.preventDefault(); toggleFocus(); });
        if (musicUnfocus) musicUnfocus.addEventListener('click', e => { e.preventDefault(); toggleFocus(); });

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
                    if (window.VisualEngine) window.VisualEngine.updateVisualizerDisplay();
                } else {
                    if (!cm.state.options) cm.state.options = {};
                    cm.state.options[opt] = val;
                    cm.saveOptions();
                    if (opt === 'timebar') {
                        if (window.updateTimebarDisplay) window.updateTimebarDisplay();
                    } else if (opt === 'fullscreen') {
                        syncFullscreenState(val);
                    } else if (opt === 'rememberLastQueue') {
                        if (val === true) {
                            if (window.PlayerController) window.PlayerController.saveCurrentQueueState();
                        } else if (val === false) {
                            cm.saveQueueState(null);
                        }
                    }
                }
                updateOptionsUI();

                if (opt === 'marqueeSpeed' && audioEl && !audioEl.paused) {
                    if (window.PlayerController) window.PlayerController.startMarquee();
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
                    refreshIndices();
                    if (searchInput && searchInput.value) executeSearch();
                    if (window.PlayerController) window.PlayerController.loadTrack();
                } else if (fx === 'maxTrip') cm.state.fx.maxTrip = !cm.state.fx.maxTrip;
                else if (fx === 'obfuscate') {
                    cm.state.fx.obfuscate = !cm.state.fx.obfuscate;
                    ui.renderDomTextFilters();
                    refreshIndices();
                    if (searchInput && searchInput.value) executeSearch();
                    if (window.PlayerController) window.PlayerController.loadTrack();
                } else if (fx.startsWith('theme-')) cm.state.fx.theme = fx.replace('theme-', '');
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

        // SCP Mouse/Focus handlers
        const handleBlinkEnd = (e) => {
            if (!isScpMode) return;
            if (e.type === 'blur' || e.button === 0) {
                document.body.classList.remove('blinking');
                if (window.PlayerController) window.PlayerController.pauseAudio();
            }
        };
        window.addEventListener('mousedown', e => {
            if (!isScpMode || e.button !== 0) return;
            document.body.classList.add('blinking');
            if (pm.getActiveTrack() && window.PlayerController) window.PlayerController.playAudio();
        });
        window.addEventListener('mouseup', handleBlinkEnd);
        window.addEventListener('blur', handleBlinkEnd);

        // Command Palette & Keydown setup
        const cmdInput = document.getElementById('cmd-input');
        const cmdPalette = document.getElementById('cmd-palette');
        const devModal = document.getElementById('dev-modal');

        if (cmdInput) {
            cmdInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    const val = cmdInput.value;
                    if (window.CommandPalette) {
                        window.CommandPalette.parseCommand(val);
                    }
                    cmdInput.value = '';
                } else if (e.key === 'Escape') {
                    cmdInput.value = '';
                    if (cmdPalette) cmdPalette.style.display = 'none';
                }
            });
        }

        // Dev tools buttons
        const devExpCfg = document.getElementById('dev-export-config');
        const devImpCfg = document.getElementById('dev-import-config');
        const devLegacyPl = document.getElementById('dev-legacy-playlist');
        const devExpPl = document.getElementById('dev-export-playlist');
        const devImpPl = document.getElementById('dev-import-playlist');

        if (devExpCfg) {
            devExpCfg.addEventListener('click', e => {
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
        }

        if (devImpCfg) {
            devImpCfg.addEventListener('click', e => {
                e.preventDefault();
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = ev => {
                    const file = ev.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = fileEv => {
                        if (cm.importConfig(fileEv.target.result)) {
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
        }

        if (devLegacyPl) {
            devLegacyPl.addEventListener('click', e => {
                e.preventDefault();
                const legacyBtn = document.getElementById('music-playlist');
                const optLegacy = document.getElementById('opt-legacy-playlist');
                if (legacyBtn && optLegacy) {
                    let isHidden = legacyBtn.style.display === 'none';
                    legacyBtn.style.display = isHidden ? 'inline-block' : 'none';
                    optLegacy.style.display = isHidden ? 'inline-block' : 'none';
                    optLegacy.innerText = isHidden ? ui.t('[x] legacy playlist') : ui.t('[ ] legacy playlist');
                }
            });
        }

        if (devExpPl) {
            devExpPl.addEventListener('click', e => {
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
        }

        if (devImpPl) {
            devImpPl.addEventListener('click', e => {
                e.preventDefault();
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = ev => {
                    const file = ev.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = fileEv => {
                        try {
                            const importedList = JSON.parse(fileEv.target.result);
                            alert(`Playlist expects ${importedList.length} files. Please select the matching local audio files.`);
                            const audioInput = document.createElement('input');
                            audioInput.type = 'file';
                            audioInput.accept = 'audio/*';
                            audioInput.multiple = true;
                            audioInput.onchange = audioEvent => {
                                const files = audioEvent.target.files;
                                pm.addFiles(files, (wasEmpty) => {
                                    refreshIndices();
                                    if (wasEmpty) {
                                        pm.currentIndex = 0;
                                        if (window.PlayerController) {
                                            window.PlayerController.loadTrack();
                                            window.PlayerController.playAudio();
                                        }
                                    }
                                    if (devModal) devModal.style.display = 'none';
                                });
                            };
                            audioInput.click();
                        } catch (err) {
                            alert('Invalid playlist JSON');
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });
        }

        // Close icon listener
        document.addEventListener('click', e => {
            if (e.target.classList.contains('modal-close-x')) {
                e.preventDefault();
                e.stopPropagation();
                closeAllModalsAndMenus();
            }
        });

        // Contextmenu overlay close
        document.addEventListener('contextmenu', e => {
            if (e.target.closest('.menu-toggle') || e.target.closest('.info-btn') || e.target.closest('.notification-item')) {
                return;
            }

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
                if (cmdPalette) {
                    cmdPalette.style.display = cmdPalette.style.display === 'block' ? 'none' : 'block';
                    if (cmdPalette.style.display === 'block' && cmdInput) cmdInput.focus();
                }
                return;
            }

            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'F1') {
                e.preventDefault();
                let searchBtn = document.getElementById('music-search');
                if (searchBtn) {
                    searchBtn.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }));
                    let searchBox = document.getElementById('search-box');
                    if (searchBox && searchBox.style.display === 'block' && searchInput) {
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

            if (e.shiftKey && e.key === '?') {
                e.preventDefault();
                if (cm.state.devMode && devModal) {
                    devModal.style.display = devModal.style.display === 'none' ? 'block' : 'none';
                }
                return;
            }

            if (e.ctrlKey || e.metaKey || e.altKey) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    if (isScpMode) break;
                    if (pm.getActiveTrack() && audioEl && window.PlayerController) {
                        audioEl.paused ? window.PlayerController.playAudio() : window.PlayerController.pauseAudio();
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (window.PlayerController) window.PlayerController.nextTrack(true);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (window.PlayerController) window.PlayerController.prevTrack();
                    break;
                case 'KeyR':
                    e.preventDefault();
                    if (e.shiftKey) {
                        if (window.PlayerController) window.PlayerController.playRandomTrack();
                    } else {
                        if (audioEl && audioEl.duration) audioEl.currentTime = 0;
                    }
                    break;
                case 'Slash':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        let modal = document.getElementById('keybind-modal');
                        if (modal) modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
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
                    if (cm.saveVisualizer) cm.saveVisualizer();
                    if (window.VisualEngine) window.VisualEngine.updateVisualizerDisplay();
                    updateOptionsUI();
                    break;
                case 'Digit2':
                    e.preventDefault();
                    cm.state.clockState = (cm.state.clockState + 1) % 3;
                    if (window.VisualEngine) window.VisualEngine.updateClock();
                    updateFxUI();
                    break;
                case 'Digit3':
                    e.preventDefault();
                    if (isScpMode) break;
                    if (infoBtn) infoBtn.click();
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
                    if (audioEl && audioEl.duration) audioEl.currentTime = Math.max(0, audioEl.currentTime - 5);
                    break;
                case 'Digit8':
                    e.preventDefault();
                    if (audioEl && audioEl.duration) audioEl.currentTime = Math.min(audioEl.duration || 0, audioEl.currentTime + 5);
                    break;
            }
        });

        document.addEventListener('fullscreenchange', () => {
            const isFS = !!document.fullscreenElement;
            if (cm.state.options && cm.state.options.fullscreen !== isFS) {
                cm.state.options.fullscreen = isFS;
                cm.saveOptions();
                updateOptionsUI();
            }
        });

        let hasAttemptedInitialFullscreen = false;
        document.addEventListener('click', () => {
            if (!hasAttemptedInitialFullscreen) {
                hasAttemptedInitialFullscreen = true;
                if (cm.state.options && cm.state.options.fullscreen) {
                    syncFullscreenState(true);
                }
            }
        });
    }

    function init() {
        buildDynamicElements();
        bindEvents();
    }

    // Expose globals
    window.updateOptionsUI = updateOptionsUI;

    return {
        init,
        buildDynamicElements,
        getQueuePrefix,
        updateAsciiBar,
        updateEqUI,
        updateFxUI,
        updateOptionsUI,
        updateNowPlayingHeader,
        renderGlobalIndex,
        renderCustomPlaylistIndex,
        renderQueueIndex,
        refreshIndices,
        executeSearch,
        updateLyricsScroll,
        openInfoModal,
        promptUser,
        closeAllModalsAndMenus,
        syncFullscreenState,
        toggleFullscreen,
        toggleFocus,
        toggleScp,
        bindEvents
    };
})();
