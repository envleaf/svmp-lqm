window.PlaylistManager = (function() {
    let playlist = []; // Array of { file: File, src: string, title: string, artist: string, originalPath: string }
    let activeIndices = [];
    let currentGlobalIdx = -1;
    let isCustomMode = false;
    let isShuffle = false;

    let manualQueue = []; // Array of globalIdx manually queued by user
    let upcomingQueue = []; // Array of globalIdx automatically queued next
    let history = []; // Array of globalIdx previously played
    const MAX_HISTORY = 50;

    function shuffleArray(array) {
        let arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function rebuildUpcomingQueue(shuffleState) {
        if (shuffleState !== undefined) {
            isShuffle = shuffleState;
        }

        if (activeIndices.length === 0) {
            upcomingQueue = [];
            return;
        }

        // Candidates are activeIndices excluding current playing track and manual queue tracks
        let candidates = activeIndices.filter(gIdx => gIdx !== currentGlobalIdx && !manualQueue.includes(gIdx));

        if (isShuffle) {
            upcomingQueue = shuffleArray(candidates);
        } else {
            let currentPos = activeIndices.indexOf(currentGlobalIdx);
            if (currentPos !== -1) {
                let sequential = [];
                for (let i = currentPos + 1; i < activeIndices.length; i++) {
                    let gIdx = activeIndices[i];
                    if (!manualQueue.includes(gIdx)) sequential.push(gIdx);
                }
                for (let i = 0; i < currentPos; i++) {
                    let gIdx = activeIndices[i];
                    if (!manualQueue.includes(gIdx)) sequential.push(gIdx);
                }
                upcomingQueue = sequential;
            } else {
                upcomingQueue = candidates;
            }
        }
    }

    function resetQueueAndPosition() {
        if (activeIndices.length > 0) {
            currentGlobalIdx = activeIndices[0];
        } else {
            currentGlobalIdx = -1;
        }
        manualQueue = [];
        history = [];
        rebuildUpcomingQueue();
    }

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
            if (wasEmpty) {
                resetQueueAndPosition();
            } else {
                rebuildUpcomingQueue();
            }
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

                if (!window._suppressPlaylistReset) {
                    isCustomMode = false;
                    activeIndices = Array.from({length: playlist.length}, (_, i) => i);
                    if (wasEmpty) {
                        resetQueueAndPosition();
                    } else {
                        rebuildUpcomingQueue();
                    }
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
        resetQueueAndPosition();
        return true;
    }

    function clearCustomPlaylist() {
        activeIndices = Array.from({length: playlist.length}, (_, i) => i);
        isCustomMode = false;
        resetQueueAndPosition();
    }

    function toggleQueue(globalIdx) {
        let qIdx = manualQueue.indexOf(globalIdx);
        if (qIdx > -1) {
            manualQueue.splice(qIdx, 1);
        } else {
            manualQueue.push(globalIdx);
            // Remove from upcomingQueue if present
            upcomingQueue = upcomingQueue.filter(gIdx => gIdx !== globalIdx);
        }
    }

    function popQueue() {
        if (manualQueue.length > 0) {
            return manualQueue.shift();
        }
        return null;
    }

    function pushHistory(globalIdx) {
        if (globalIdx === undefined || globalIdx === null || globalIdx === -1) return;
        if (history.length > 0 && history[history.length - 1] === globalIdx) return;
        history.push(globalIdx);
        if (history.length > MAX_HISTORY) {
            history.shift();
        }
    }

    function popHistory() {
        if (history.length > 0) {
            return history.pop();
        }
        return null;
    }

    function nextTrack() {
        if (activeIndices.length === 0) return null;

        if (currentGlobalIdx !== -1) {
            pushHistory(currentGlobalIdx);
        }

        if (manualQueue.length > 0) {
            currentGlobalIdx = manualQueue.shift();
        } else if (upcomingQueue.length > 0) {
            currentGlobalIdx = upcomingQueue.shift();
        } else {
            // Refill upcomingQueue if empty
            rebuildUpcomingQueue();
            if (upcomingQueue.length > 0) {
                currentGlobalIdx = upcomingQueue.shift();
            } else {
                currentGlobalIdx = activeIndices[0];
            }
        }

        return currentGlobalIdx;
    }

    function prevTrack() {
        if (activeIndices.length === 0) return null;

        let prevGlobalIdx = popHistory();
        if (prevGlobalIdx !== null && prevGlobalIdx !== undefined) {
            if (currentGlobalIdx !== -1) {
                // Prepend current track to upcoming queue so skipping forward plays it again
                upcomingQueue.unshift(currentGlobalIdx);
            }
            currentGlobalIdx = prevGlobalIdx;
        } else {
            // If no history, jump to previous item in activeIndices
            let currentPos = activeIndices.indexOf(currentGlobalIdx);
            let prevPos = (currentPos - 1 + activeIndices.length) % activeIndices.length;
            if (currentGlobalIdx !== -1) {
                upcomingQueue.unshift(currentGlobalIdx);
            }
            currentGlobalIdx = activeIndices[prevPos];
        }

        return currentGlobalIdx;
    }

    function playTrackByGlobalIndex(targetGlobalIdx) {
        if (currentGlobalIdx !== -1 && currentGlobalIdx !== targetGlobalIdx) {
            pushHistory(currentGlobalIdx);
        }

        currentGlobalIdx = targetGlobalIdx;

        // Remove from manualQueue if present
        manualQueue = manualQueue.filter(gIdx => gIdx !== targetGlobalIdx);

        // Rebuild upcoming queue for remaining tracks
        rebuildUpcomingQueue();
    }

    function removeTrack(globalIdx) {
        if (globalIdx < 0 || globalIdx >= playlist.length) return false;

        playlist.splice(globalIdx, 1);

        const adjustIndex = (idx) => {
            if (idx === globalIdx) return -1;
            if (idx > globalIdx) return idx - 1;
            return idx;
        };

        // Update activeIndices
        activeIndices = activeIndices
            .map(adjustIndex)
            .filter(idx => idx !== -1);

        // Update currentGlobalIdx
        if (currentGlobalIdx === globalIdx) {
            currentGlobalIdx = activeIndices.length > 0 ? activeIndices[0] : -1;
        } else if (currentGlobalIdx > globalIdx) {
            currentGlobalIdx--;
        }

        // Update manualQueue, upcomingQueue, history
        manualQueue = manualQueue.map(adjustIndex).filter(idx => idx !== -1);
        upcomingQueue = upcomingQueue.map(adjustIndex).filter(idx => idx !== -1);
        history = history.map(adjustIndex).filter(idx => idx !== -1);

        rebuildUpcomingQueue();

        return true;
    }

    function getQueueList() {
        if (currentGlobalIdx === -1) {
            return [...manualQueue, ...upcomingQueue];
        }
        return [currentGlobalIdx, ...manualQueue, ...upcomingQueue];
    }

    return {
        addNativeTrack,
        addFiles,
        removeTrack,
        toggleQueue,
        popQueue,
        pushHistory,
        popHistory,
        nextTrack,
        prevTrack,
        playTrackByGlobalIndex,
        rebuildUpcomingQueue,
        resetQueueAndPosition,
        getQueueList,
        buildCustomPlaylist,
        clearCustomPlaylist,

        get playlist() { return playlist; },
        get activeIndices() { return activeIndices; },

        get currentGlobalIdx() { return currentGlobalIdx; },
        set currentGlobalIdx(val) {
            currentGlobalIdx = val;
            rebuildUpcomingQueue();
        },

        get currentIndex() {
            let idx = activeIndices.indexOf(currentGlobalIdx);
            return idx !== -1 ? idx : 0;
        },
        set currentIndex(val) {
            if (val >= 0 && val < activeIndices.length) {
                currentGlobalIdx = activeIndices[val];
                rebuildUpcomingQueue();
            }
        },

        get isCustomMode() { return isCustomMode; },
        set isCustomMode(val) { isCustomMode = val; },
        set activeIndices(arr) {
            activeIndices = arr;
            rebuildUpcomingQueue();
        },

        get isShuffle() { return isShuffle; },
        set isShuffle(val) {
            isShuffle = val;
            rebuildUpcomingQueue(isShuffle);
        },

        get queue() { return manualQueue; },
        get manualQueue() { return manualQueue; },
        get upcomingQueue() { return upcomingQueue; },
        get history() { return history; },

        getActiveTrack() {
            if (currentGlobalIdx === -1 || currentGlobalIdx >= playlist.length) return null;
            return playlist[currentGlobalIdx];
        },

        exportPlaylist() {
            let exportData = playlist.map(t => ({ title: t.title, artist: t.artist, originalName: t.file ? t.file.name : '' }));
            return JSON.stringify(exportData, null, 2);
        }
    };
})();
