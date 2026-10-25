window.ListsManager = (function() {
    const cm = window.ConfigManager;
    const pm = window.PlaylistManager;
    const ui = window.UIManager;

    let currentListsView = 'main'; // 'main', 'playlist', 'add'
    let currentViewingPlaylist = null;
    let trackToAdd = null;

    function getElements() {
        return {
            listsModal: document.getElementById('lists-modal'),
            listsModalTitle: document.getElementById('lists-modal-title'),
            listsModalContent: document.getElementById('lists-modal-content'),
            listsModalCreate: document.getElementById('lists-modal-create'),
            listsModalBack: document.getElementById('lists-modal-back'),
            listsModalClose: document.getElementById('lists-modal-close'),
            favBtn: document.getElementById('music-fav')
        };
    }

    function openListsModal(view, data = null) {
        document.querySelectorAll('.menu-box').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });

        const els = getElements();
        currentListsView = view;
        if (els.listsModal) els.listsModal.style.display = 'flex';

        if (view === 'main' || view === 'add') {
            if (els.listsModalTitle) els.listsModalTitle.innerText = ui.t(view === 'add' ? 'add to list' : 'playlists');
            if (els.listsModalBack) els.listsModalBack.style.display = 'none';
            trackToAdd = view === 'add' ? data : null;
            renderPlaylistsList();
        } else if (view === 'playlist') {
            currentViewingPlaylist = data;
            if (els.listsModalTitle) els.listsModalTitle.innerText = ui.t(data);
            if (els.listsModalBack) els.listsModalBack.style.display = 'inline';
            renderPlaylistTracks();
        }
    }

    async function renderPlaylistsList() {
        const els = getElements();
        if (!els.listsModalContent) return;

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
            if (key !== "favorites" && key !== "recents" && currentListsView !== 'add') {
                html += `<a href="#" class="del-list-btn" data-name="${key}" style="color: #ff5555; text-decoration: none; margin-right: 10px;">[x]</a>`;
            } else if (currentListsView !== 'add') {
                html += `<span style="display: inline-block; width: 30px;"></span>`;
            }
            html += `<a href="#" class="list-link" data-name="${key}" style="display: block; text-decoration: none; flex-grow: 1;">${ui.t(key)} <span style="color: var(--prompt-color); font-size: 0.9em;">${ui.t(displayCount)}</span></a></div>`;
        });

        if (playlists.length === 0) {
            html = `<span style="color: var(--prompt-color);">${ui.t("no playlists.")}</span>`;
        }

        els.listsModalContent.innerHTML = html;

        document.querySelectorAll('.del-list-btn').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.preventDefault();
                let name = btn.getAttribute('data-name');
                if (confirm(`delete playlist '${name}'?`)) {
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
                    if (els.listsModal) els.listsModal.style.display = 'none';
                } else {
                    openListsModal('playlist', name);
                }
            });
        });
    }

    async function renderPlaylistTracks() {
        const els = getElements();
        if (!els.listsModalContent) return;

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
            els.listsModalContent.innerHTML = `<span style="color: var(--prompt-color);">${ui.t("playlist is empty or tracks missing.")}</span>`;
            return;
        }

        listTracks.forEach((track, i) => {
            let displayTitle = track.title || track.originalName;
            let num = String(i + 1).padStart(2, '0');
            let line = `| ${num}. ${displayTitle}`;

            html += `<div style="display: flex;">`;
            html += `<a href="#" class="pl-info-btn" data-idx="${i}" style="text-decoration: none; margin-right: 5px;">[i]</a>`;
            if (currentViewingPlaylist !== "recents") {
                html += `<a href="#" class="del-track-btn" data-path="${encodeURIComponent(track.originalPath)}" style="color: #ff5555; text-decoration: none; margin-right: 5px;">[x]</a>`;
            }
            html += `<a href="#" class="pl-track-link" data-idx="${i}" style="display: block; text-decoration: none; flex-grow: 1;">${ui.t(line)}</a></div>`;
        });

        els.listsModalContent.innerHTML = html;

        document.querySelectorAll('.pl-info-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                let i = parseInt(btn.getAttribute('data-idx'), 10);
                let track = listTracks[i];
                if (!track) return;
                let globalIdx = pm.playlist.findIndex(t => t.originalPath === track.originalPath);
                if (globalIdx === -1) {
                    pm.playlist.push(track);
                    globalIdx = pm.playlist.length - 1;
                }
                if (window.UIController && window.UIController.openInfoModal) {
                    window.UIController.openInfoModal(globalIdx);
                }
            });
        });

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
                    if (playingTrack && els.favBtn) {
                        let isFav = window.goIsFavorite ? await window.goIsFavorite(playingTrack.originalPath) : false;
                        els.favBtn.innerText = isFav ? ui.t('[fav (x)]') : ui.t('[fav ( )]');
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

        if (window.UIController) {
            window.UIController.updateNowPlayingHeader();
            window.UIController.refreshIndices();
        }
        if (window.PlayerController) {
            window.PlayerController.loadTrack();
            window.PlayerController.playAudio();
        }

        if (ui && ui.showNotification) {
            ui.showNotification('Press "now playing" to cancel the playlist queue.');
        }

        const els = getElements();
        if (els.listsModal) els.listsModal.style.display = 'none';
        if (window.CommandPalette) window.CommandPalette.setOutput(`playing from ${currentViewingPlaylist}`);
    }

    function init() {
        const els = getElements();
        const listsBtn = document.getElementById('music-lists');

        if (listsBtn) {
            listsBtn.addEventListener('click', e => {
                e.preventDefault();
                openListsModal('main');
            });
        }

        if (els.listsModalClose) {
            els.listsModalClose.addEventListener('click', e => {
                e.preventDefault();
                if (els.listsModal) els.listsModal.style.display = 'none';
            });
        }

        if (els.listsModalBack) {
            els.listsModalBack.addEventListener('click', e => {
                e.preventDefault();
                openListsModal('main');
            });
        }

        if (els.listsModalCreate) {
            els.listsModalCreate.addEventListener('click', e => {
                e.preventDefault();
                if (window.UIController && window.UIController.promptUser) {
                    window.UIController.promptUser("enter playlist name (letters/numbers only):", async (name) => {
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
                            if (els.listsModal) els.listsModal.style.display = 'none';
                        } else {
                            if (window.goCreatePlaylist) {
                                await window.goCreatePlaylist(cleanName);
                            }
                            openListsModal('main');
                        }
                    });
                }
            });
        }
    }

    return {
        init,
        openListsModal,
        renderPlaylistsList,
        renderPlaylistTracks,
        playPlaylistTrack,
        get currentListsView() { return currentListsView; },
        get currentViewingPlaylist() { return currentViewingPlaylist; }
    };
})();
