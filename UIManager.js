window.UIManager = (function() {
    let originalTextNodes = new Map();
    let cm = window.ConfigManager;

    function applyTextFilters(str) {
        let out = str;
        let state = cm.state;
        if (state.fx.obfuscate) {
            out = out.replace(/[^+\-\[\]\|\<\>\(\)\s\n:\/]/g, '.');
        } else if (state.isUwu) {
            out = out.replace(/(?:r|l)/g, "w").replace(/(?:R|L)/g, "W")
                      .replace(/n([aeiou])/g, "ny$1").replace(/N([aeiou])/g, "Ny$1")
                      .replace(/N([AEIOU])/g, "NY$1").replace(/ove/g, "uv");
        }
        return out;
    }

    function initTextFilters() {
        originalTextNodes.clear();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            let parentTag = node.parentElement ? node.parentElement.tagName : '';
            if (['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA'].includes(parentTag)) continue;
            if (node.parentElement && node.parentElement.closest('#track-title, #time-current, #time-total, #ascii-bar, #lyrics-content, #playlist-status-text, #index-box, #index-results, #custom-index-box, #search-results, #vol-bar, #eq-bass-bar, #eq-mid-bar, #eq-treble-bar, #scp-text, #clock-display, #keybind-modal, #welcome-modal, #dev-modal, #cmd-palette')) continue;

            if (node.nodeValue.trim() !== "") originalTextNodes.set(node, node.nodeValue);
        }
    }

    function renderDomTextFilters() {
        originalTextNodes.forEach((origText, node) => {
            node.nodeValue = applyTextFilters(origText);
        });
    }

    // Exported helper
    function t(str) {
        return applyTextFilters(str);
    }

    function showNotification(message) {
        let cm = window.ConfigManager;
        if (cm.state.options && cm.state.options.notifications === false) return;

        const container = document.getElementById('notification-container');
        if (!container) return;

        const notif = document.createElement('div');
        notif.className = 'notification-item';
        notif.innerText = t(message);

        notif.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            clearAllNotifications();
        });

        container.appendChild(notif);

        let cmRef = window.ConfigManager;
        let duration = (cmRef.state.options && cmRef.state.options.notifDuration) ? cmRef.state.options.notifDuration : 5000;
        
        setTimeout(() => {
            if (!notif.classList.contains('fade-out')) {
                notif.classList.add('fade-out');
                notif.addEventListener('animationend', (e) => {
                    if (e.animationName.includes('notify-slide-out')) {
                        notif.remove();
                    }
                });
            }
        }, duration);
    }

    function clearAllNotifications() {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const notifs = container.querySelectorAll('.notification-item:not(.fade-out)');
        notifs.forEach(notif => {
            notif.classList.add('fade-out');
            notif.addEventListener('animationend', (e) => {
                if (e.animationName.includes('notify-slide-out')) {
                    notif.remove();
                }
            });
        });
    }

    // Background drawing logic
    let bgTime = 0;
    let matrixCols = [];
    let heartCols = [];

    function drawBg(asciiBg, state) {
        let cols = Math.ceil(window.innerWidth / 7) + 2;
        let rows = Math.ceil(window.innerHeight / 14);
        let str = "";

        if (state.fx.kawaii || state.isUwu) {
            const heartChars = "♥♡✿❀✧";
            if (heartCols.length !== cols) heartCols = Array(cols).fill(0).map(() => Math.random() * rows);
            let grid = Array(rows).fill("").map(() => Array(cols).fill(" "));
            for (let x = 0; x < cols; x++) {
                heartCols[x] += Math.random() * 0.15 + 0.05;
                if (heartCols[x] > rows + 5) heartCols[x] = 0;
                let y = Math.floor(heartCols[x]);
                if (y >= 0 && y < rows) grid[y][x] = heartChars[Math.floor(Math.random() * heartChars.length)];
            }
            asciiBg.innerText = grid.map(row => row.join("")).join("\n");
            return;
        }

        if (state.fx.bg === 'none') return;

        const plasmaChars = state.charOverride || " .,-~:;=!*#$@";
        const staticChars = state.charOverride || " ░▒▓█";
        const matrixChars = state.charOverride || "01ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ";

        if (state.fx.bg === 'plasma') {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    let cx = x * 0.1, cy = y * 0.2;
                    let v = Math.sin(cx + bgTime) + Math.sin(cy + bgTime) + Math.sin(cx + cy + bgTime);
                    let idx = Math.floor(((v + 3) / 6) * plasmaChars.length);
                    str += plasmaChars[Math.max(0, Math.min(plasmaChars.length - 1, idx))];
                }
                str += "\n";
            }
            bgTime += 0.05;
        }
        else if (state.fx.bg === 'mountains') {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    let y1 = Math.sin(x * 0.1 + bgTime * 0.5) * 2 + rows * 0.4;
                    let y2 = Math.sin(x * 0.15 + bgTime * 0.3) * 3 + rows * 0.6;
                    let y3 = Math.sin(x * 0.05 + bgTime * 0.1) * 4 + rows * 0.8;
                    if (y > y3) str += state.charOverride ? state.charOverride[2] : "#";
                    else if (y > y2) str += state.charOverride ? state.charOverride[1] : "x";
                    else if (y > y1) str += state.charOverride ? state.charOverride[0] : ".";
                    else str += " ";
                }
                str += "\n";
            }
            bgTime += 0.05;
        }
        else if (state.fx.bg === 'ocean') {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    if (y > rows * 0.5) {
                        let wave = Math.sin(x * 0.2 + bgTime + y * 0.5);
                        str += wave > 0.5 ? "~" : (wave < -0.5 ? "-" : " ");
                    } else {
                        str += " ";
                    }
                }
                str += "\n";
            }
            bgTime += 0.1;
        }
        else if (state.fx.bg === 'hyperspace') {
            let cx = cols / 2, cy = rows / 2;
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    let dx = x - cx, dy = y - cy;
                    let dist = Math.sqrt(dx*dx + dy*dy);
                    let v = Math.sin(dist * 0.5 - bgTime * 5);
                    if (v > 0.9) str += "*";
                    else if (v > 0.8) str += ".";
                    else str += " ";
                }
                str += "\n";
            }
            bgTime += 0.05;
        }
        else if (state.fx.bg === 'fire') {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    let v = Math.sin(x * 0.5 + bgTime * 3) + Math.cos(y * 0.5 - bgTime * 5) + Math.random();
                    if (y > rows * 0.8 - v * 2) str += "W";
                    else if (y > rows * 0.7 - v * 3) str += "x";
                    else if (y > rows * 0.6 - v * 4) str += ".";
                    else str += " ";
                }
                str += "\n";
            }
            bgTime += 0.05;
        }
        else if (state.fx.bg === 'rain') {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    let diag = (x + y * 2) % 10;
                    let offset = Math.floor(bgTime * 10) % 10;
                    if (Math.abs(diag - offset) === 0) str += "/";
                    else if (Math.abs(diag - offset) === 1 && Math.random() < 0.1) str += ".";
                    else str += " ";
                }
                str += "\n";
            }
            bgTime += 0.05;
        }
        else if (state.fx.bg === 'wave') {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    let cy = y * 0.3, cx = x * 0.1;
                    let v = Math.sin(cx + bgTime) + Math.cos(cy);
                    str += v > 0.5 ? (state.charOverride ? state.charOverride[1] : "~") : (state.charOverride ? state.charOverride[0] : " ");
                }
                str += "\n";
            }
            bgTime += 0.1;
        }
        else if (state.fx.bg === 'snow') {
            if (matrixCols.length !== cols) matrixCols = Array(cols).fill(0).map(() => Math.random() * rows);
            let grid = Array(rows).fill("").map(() => Array(cols).fill(" "));
            for (let x = 0; x < cols; x++) {
                matrixCols[x] += Math.random() * 0.2 + 0.1;
                if (matrixCols[x] > rows) matrixCols[x] = 0;
                let y = Math.floor(matrixCols[x]);
                if (y >= 0 && y < rows) grid[y][x] = state.charOverride ? state.charOverride[2] : "*";
            }
            str = grid.map(row => row.join("")).join("\n");
        }
        else if (state.fx.bg === 'ripple') {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    let cx = (x - cols/2) * 0.15;
                    let cy = (y - rows/2) * 0.3;
                    let d = Math.sqrt(cx*cx + cy*cy);
                    let v = Math.sin(d - bgTime * 2);
                    let idx = Math.floor(((v + 1) / 2) * plasmaChars.length);
                    str += plasmaChars[Math.max(0, Math.min(plasmaChars.length - 1, idx))];
                }
                str += "\n";
            }
            bgTime += 0.05;
        }
        else if (state.fx.bg === 'sparkle') {
            for (let i=0; i<rows*cols; i++) {
                if (Math.random() < 0.005) str += state.charOverride ? state.charOverride[3] : "+";
                else if (Math.random() < 0.002) str += state.charOverride ? state.charOverride[4] : "*";
                else str += " ";
                if ((i+1)%cols === 0) str += "\n";
            }
        }
        else if (state.fx.bg === 'static') {
            for(let i = 0; i < rows * cols; i++) {
                str += staticChars[Math.floor(Math.random() * staticChars.length)];
                if((i + 1) % cols === 0) str += "\n";
            }
        }
        else if (state.fx.bg === 'matrix') {
            if (matrixCols.length !== cols) matrixCols = Array(cols).fill(0).map(() => Math.random() * rows);
            let grid = Array(rows).fill("").map(() => Array(cols).fill(" "));
            for (let x = 0; x < cols; x++) {
                matrixCols[x] += Math.random() * 0.5 + 0.5;
                if (matrixCols[x] > rows + 10) matrixCols[x] = 0;
                let headY = Math.floor(matrixCols[x]);
                for(let tail = 0; tail < 8; tail++) {
                    let y = headY - tail;
                    if (y >= 0 && y < rows) grid[y][x] = matrixChars[Math.floor(Math.random() * matrixChars.length)];
                }
            }
            str = grid.map(row => row.join("")).join("\n");
        }
        else if (state.fx.bg === 'grid') {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    let cy = y / rows;
                    if (cy < 0.5) {
                        str += " ";
                    } else {
                        let cx = (x - cols / 2) / cols;
                        let depth = (cy - 0.5) * 2;
                        if (depth < 0.01) depth = 0.01;
                        let projX = cx / depth;
                        let speed = bgTime * 2;

                        let hLine = Math.abs(Math.sin(depth * 20 - speed)) < 0.15;
                        let vLine = Math.abs(Math.sin(projX * 15)) < 0.15;

                        if (hLine && vLine) str += "+";
                        else if (hLine) str += "-";
                        else if (vLine) str += (state.charOverride ? state.charOverride[2] : "/");
                        else str += " ";
                    }
                }
                str += "\n";
            }
            bgTime += 0.05;
        }
        else if (state.fx.bg === 'stars') {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    let noise = Math.sin((x + bgTime * 10) * 12.9898 + y * 78.233) * 43758.5453;
                    noise = noise - Math.floor(noise);
                    if (noise > 0.99) str += "+";
                    else if (noise > 0.98) str += ".";
                    else str += " ";
                }
                str += "\n";
            }
            bgTime += 0.05;
        }
        else if (state.fx.bg === 'dna') {
            for (let y = 0; y < rows; y++) {
                let offset = Math.sin(y * 0.3 + bgTime);
                let pos1 = Math.floor(cols / 2 + offset * 8);
                let pos2 = Math.floor(cols / 2 - offset * 8);

                for (let x = 0; x < cols; x++) {
                    if (x === pos1 || x === pos2) str += "x";
                    else if ((x > pos1 && x < pos2) || (x > pos2 && x < pos1)) {
                        str += (y % 2 === 0) ? "-" : " ";
                    } else str += " ";
                }
                str += "\n";
            }
            bgTime += 0.1;
        }
        asciiBg.innerText = str;
    }

    function syncMenuBoxWidth() {
        const actionRow = document.getElementById('action-row');
        if (!actionRow) return;

        // In sway/mobile mode, or if hidden by focus mode, we shouldn't force widths
        const isHidden = window.getComputedStyle(actionRow).display === 'none';

        document.querySelectorAll('.menu-box:not(.overlay-modal)').forEach(box => {
            if (isHidden) {
                box.style.width = '';
                box.style.margin = '0.5em 0 0 0'; // Restore original margin
            } else {
                // Get the tightest bounding box of the flex items in the action row
                let minX = Infinity;
                let maxX = -Infinity;
                let hasVisibleChildren = false;

                Array.from(actionRow.children).forEach(child => {
                    if (window.getComputedStyle(child).display !== 'none') {
                        const rect = child.getBoundingClientRect();
                        if (rect.left < minX) minX = rect.left;
                        if (rect.right > maxX) maxX = rect.right;
                        hasVisibleChildren = true;
                    }
                });

                if (hasVisibleChildren) {
                    const exactWidth = maxX - minX;
                    box.style.width = exactWidth + 'px';
                    box.style.margin = '0.5em auto 0 auto';
                } else {
                    box.style.width = '';
                    box.style.margin = '0.5em 0 0 0';
                }
            }
        });
    }

    return {
        initTextFilters,
        renderDomTextFilters,
        t,
        showNotification,
        clearAllNotifications,
        drawBg,
        syncMenuBoxWidth
    };
})();
