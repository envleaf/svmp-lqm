window.PlaylistManager = (function() {
    let playlist = []; // Array of { file: File, src: string, title: string, artist: string }
    let activeIndices = [];
    let currentIndex = 0;
    let isCustomMode = false;

    let queue = [];
    let history = [];
    const MAX_HISTORY = 50;

    function addNativeTrack(trackData, callback) {
        let wasEmpty = playlist.length === 0;
        let addedIndex = playlist.length;

        let cleanName = trackData.title;
        if (!cleanName && trackData.originalName) {
             cleanName = trackData.originalName.replace(/\.[^/.]+$/, "");
        }
        if (cleanName && cleanName.length > 35) cleanName = cleanName.substring(0, 32) + "...";

        let parsedTitle = trackData.artist ? `${trackData.artist} - ${cleanName}` : cleanName;
        if (parsedTitle && parsedTitle.length > 35) parsedTitle = parsedTitle.substring(0, 32) + "...";

        let newTrack = {
            file: null,
            src: trackData.src,
            title: parsedTitle || "Unknown",
            artist: trackData.artist || '',
            originalPath: trackData.originalPath || ''
        };

        playlist.push(newTrack);

        if (!window._suppressPlaylistReset) {
            isCustomMode = false;
            activeIndices = Array.from({length: playlist.length}, (_, i) => i);
        }

        if (callback) callback(wasEmpty, [addedIndex]);
    }

    function addFiles(files, callback) {
        let wasEmpty = playlist.length === 0;
        let filesProcessed = 0;
        let totalFiles = files.length;

        Array.from(files).forEach((file, index) => {
            const fileURL = URL.createObjectURL(file);
            let cleanName = file.name.replace(/\.[^/.]+$/, "");
            if (cleanName.length > 35) cleanName = cleanName.substring(0, 32) + "...";

            let trackData = { file: file, src: fileURL, title: cleanName, artist: '' };
            let addedIndex = playlist.length;
            playlist.push(trackData);

            // Try ID3 tags
            if (window.jsmediatags) {
                window.jsmediatags.read(file, {
                    onSuccess: function(tag) {
                        if (tag.tags.title) {
                            let parsedTitle = tag.tags.artist ? `${tag.tags.artist} - ${tag.tags.title}` : tag.tags.title;
                            if (parsedTitle.length > 35) parsedTitle = parsedTitle.substring(0, 32) + "...";
                            playlist[addedIndex].title = parsedTitle;
                            playlist[addedIndex].artist = tag.tags.artist || '';
                        }
                        filesProcessed++;
                        checkDone();
                    },
                    onError: function(error) {
                        console.warn("ID3 read error for", file.name, error);
                        filesProcessed++;
                        checkDone();
                    }
                });
            } else {
                filesProcessed++;
                checkDone();
            }
        });

        function checkDone() {
            if (filesProcessed === totalFiles) {
                let newlyAddedIndices = [];
                for(let i = playlist.length - totalFiles; i < playlist.length; i++) {
                    newlyAddedIndices.push(i);
                }

                // If we are currently preserving custom mode (like in upload -p), we should NOT reset it here.
                // However, the standard behavior is to reset it.
                // We'll let the callback optionally handle the activeIndices if it wants to,
                // but by default we must reset it unless told otherwise.
                // Since `addFiles` doesn't know about `toPlaylist`, we'll pass it a flag or let the callback run *before* resetting?
                // Actually, instead of modifying `addFiles` signature extensively, we can provide a method to suppress the reset,
                // or just let `uploadFiles` cache the state before calling `addFiles` and restore it.
                // Let's modify `addFiles` to accept an options object optionally, or just handle it here:

                // We will do this: simply don't reset `activeIndices` if `window._suppressPlaylistReset` is true.
                if (!window._suppressPlaylistReset) {
                    isCustomMode = false;
                    activeIndices = Array.from({length: playlist.length}, (_, i) => i);
                }

                if (callback) callback(wasEmpty, newlyAddedIndices);
            }
        }
    }

    function buildCustomPlaylist(inputStr) {
        if (playlist.length === 0) return false;
        let res = new Set();
        let parts = inputStr.split(',');
        for (let p of parts) {
            p = p.trim();
            if (p.includes('-')) {
                let [s, e] = p.split('-');
                s = parseInt(s, 10); e = parseInt(e, 10);
                if (!isNaN(s) && !isNaN(e)) {
                    let min = Math.min(s, e), max = Math.max(s, e);
                    for (let i = min; i <= max; i++) {
                        if (i >= 1 && i <= playlist.length) res.add(i - 1);
                    }
                }
            } else {
                let n = parseInt(p, 10);
                if (!isNaN(n) && n >= 1 && n <= playlist.length) res.add(n - 1);
            }
        }

        let finalArr = Array.from(res).sort((a,b) => a - b);
        if (finalArr.length === 0) {
            alert("invalid input or out of bounds.");
            return false;
        }

        activeIndices = finalArr;
        isCustomMode = true;
        currentIndex = 0;
        return true;
    }

    function clearCustomPlaylist() {
        activeIndices = Array.from({length: playlist.length}, (_, i) => i);
        isCustomMode = false;
        currentIndex = 0;
    }

    function toggleQueue(localIdx) {
        let qIdx = queue.indexOf(localIdx);
        if (qIdx > -1) {
            queue.splice(qIdx, 1);
        } else {
            queue.push(localIdx);
        }
    }

    function popQueue() {
        if (queue.length > 0) {
            return queue.shift();
        }
        return null;
    }

    function pushHistory(localIdx) {
        if (history.length > 0 && history[history.length - 1] === localIdx) return;
        history.push(localIdx);
        if (history.length > MAX_HISTORY) {
            history.shift();
        }
    }

    function popHistory() {
        if (history.length > 1) {
            history.pop(); // Remove current track
            return history.pop(); // Return previous track
        } else if (history.length === 1) {
             return history.pop(); // Return the only track if that's what we want
        }
        return null;
    }

    function removeTrack(globalIdx) {
        if (globalIdx < 0 || globalIdx >= playlist.length) return false;

        playlist.splice(globalIdx, 1);

        // Update activeIndices
        let newActiveIndices = [];
        let currentIndexGlobal = activeIndices[currentIndex];
        let newCurrentIndexGlobal = -1;

        for (let i = 0; i < activeIndices.length; i++) {
            let gIdx = activeIndices[i];
            if (gIdx < globalIdx) {
                newActiveIndices.push(gIdx);
                if (gIdx === currentIndexGlobal) newCurrentIndexGlobal = gIdx;
            } else if (gIdx > globalIdx) {
                newActiveIndices.push(gIdx - 1);
                if (gIdx === currentIndexGlobal) newCurrentIndexGlobal = gIdx - 1;
            }
        }

        activeIndices = newActiveIndices;

        // Fix currentIndex
        if (activeIndices.length === 0) {
            currentIndex = 0;
        } else {
            if (newCurrentIndexGlobal !== -1) {
                let newCurrIdx = activeIndices.indexOf(newCurrentIndexGlobal);
                if (newCurrIdx !== -1) currentIndex = newCurrIdx;
                else currentIndex = Math.min(currentIndex, activeIndices.length - 1);
            } else {
                currentIndex = Math.min(currentIndex, activeIndices.length - 1);
            }
        }

        // Update queue
        let newQueue = [];
        for (let i = 0; i < queue.length; i++) {
            let qIdx = queue[i];
            if (qIdx < globalIdx) newQueue.push(qIdx);
            else if (qIdx > globalIdx) newQueue.push(qIdx - 1);
        }
        queue = newQueue;

        // Update history
        let newHistory = [];
        for (let i = 0; i < history.length; i++) {
            let hIdx = history[i];
            if (hIdx < globalIdx) newHistory.push(hIdx);
            else if (hIdx > globalIdx) newHistory.push(hIdx - 1);
        }
        history = newHistory;

        return true;
    }

    return {
        addNativeTrack,
        addFiles,
        removeTrack,
        toggleQueue,
        popQueue,
        pushHistory,
        popHistory,
        buildCustomPlaylist,
        clearCustomPlaylist,

        get playlist() { return playlist; },
        get activeIndices() { return activeIndices; },

        get currentIndex() { return currentIndex; },
        set currentIndex(val) { currentIndex = val; },

        get isCustomMode() { return isCustomMode; },
        set isCustomMode(val) { isCustomMode = val; },
        set activeIndices(arr) { activeIndices = arr; },

        get queue() { return queue; },
        get history() { return history; },

        getActiveTrack() {
            if (activeIndices.length === 0 || currentIndex >= activeIndices.length) return null;
            return playlist[activeIndices[currentIndex]];
        },

        exportPlaylist() {
            let exportData = playlist.map(t => ({ title: t.title, artist: t.artist, originalName: t.file ? t.file.name : '' }));
            return JSON.stringify(exportData, null, 2);
        }
    };
})();
