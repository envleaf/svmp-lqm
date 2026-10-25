(function() {
    const REPO_OWNER = "envleaf";
    const REPO_NAME = "svmp-lqm";
    const GITHUB_COMMITS_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/main`;
    const IGNORE_KEY = "svmp_ignore_update_commit";

    let updateModal = null;
    let latestCommitSha = null;
    let latestCommitMsg = null;

    function createUpdateModal() {
        if (document.getElementById('update-modal')) {
            updateModal = document.getElementById('update-modal');
            return;
        }

        updateModal = document.createElement('div');
        updateModal.id = 'update-modal';
        updateModal.className = 'overlay-modal';
        updateModal.style.cssText = 'display: none; padding: 25px; z-index: 10007; text-align: left; background: var(--bg-color); border: 1px solid var(--text-color); box-shadow: 4px 4px 0 var(--text-color); min-width: 320px; max-width: 500px; flex-direction: column;';
        updateModal.innerHTML = `
            <a href="#" class="modal-close-x">[ x ]</a>
            <strong id="update-modal-title" style="margin: 0; color: var(--text-color); font-size: 1.2em;">update available</strong>
            <p id="update-modal-body" style="margin: 15px 0; color: var(--text-color); line-height: 1.5; font-size: 0.9em; white-space: pre-wrap;"></p>
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
                <a href="#" id="update-btn-yes" style="color: var(--text-color); text-decoration: underline; text-decoration-style: dashed;">[ Yes ]</a>
                <a href="#" id="update-btn-no" style="color: var(--text-color); text-decoration: underline; text-decoration-style: dashed;">[ No ]</a>
                <a href="#" id="update-btn-never" style="color: var(--prompt-color); text-decoration: underline; text-decoration-style: dashed;">[ Never again for this version ]</a>
            </div>
        `;
        document.body.appendChild(updateModal);

        document.getElementById('update-btn-yes').addEventListener('click', (e) => {
            e.preventDefault();
            hideModal();
            performUpdate();
        });

        document.getElementById('update-btn-no').addEventListener('click', (e) => {
            e.preventDefault();
            hideModal();
        });

        document.getElementById('update-btn-never').addEventListener('click', (e) => {
            e.preventDefault();
            if (latestCommitSha) {
                localStorage.setItem(IGNORE_KEY, latestCommitSha);
            }
            hideModal();
            if (window.UIManager && window.UIManager.showNotification) {
                window.UIManager.showNotification("Update notifications ignored for this commit.");
            }
        });
    }

    function showModal(commitSha, commitMsg) {
        createUpdateModal();
        const shortSha = commitSha ? commitSha.substring(0, 7) : "latest";
        document.getElementById('update-modal-title').innerText = `update available (${shortSha})`;
        document.getElementById('update-modal-body').innerText = `A new version of SVMP (${shortSha}) has been released.\n\nLatest commit:\n${commitMsg || 'No commit details.'}\n\nWould you like to update?`;
        updateModal.style.display = 'flex';
    }

    function hideModal() {
        if (updateModal) {
            updateModal.style.display = 'none';
        }
    }

    async function getLocalGitInfo() {
        if (window.goCheckGitRepo) {
            try {
                return await window.goCheckGitRepo();
            } catch (err) {
                console.warn("Failed to check local git repo:", err);
            }
        }
        return { isGitRepo: false, currentCommit: "", currentBranch: "" };
    }

    async function checkForUpdates(isManual = false) {
        if (isManual && window.UIManager && window.UIManager.showNotification) {
            window.UIManager.showNotification("Checking for updates...");
        }

        try {
            const response = await fetch(GITHUB_COMMITS_URL, {
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            });

            if (!response.ok) {
                if (isManual && window.UIManager && window.UIManager.showNotification) {
                    window.UIManager.showNotification("Unable to reach update server.");
                }
                return;
            }

            const data = await response.json();
            const remoteSha = data.sha;
            const remoteShortSha = remoteSha ? remoteSha.substring(0, 7) : "";
            const commitMessage = (data.commit && data.commit.message) ? data.commit.message.split('\n')[0] : "";

            latestCommitSha = remoteSha;
            latestCommitMsg = commitMessage;

            const localGit = await getLocalGitInfo();
            const localCommit = localGit.currentCommit || "";

            // Check if user ignored this version, unless manual check
            const ignoredSha = localStorage.getItem(IGNORE_KEY);
            if (!isManual && ignoredSha === remoteSha) {
                return;
            }

            let isUpdateAvailable = false;
            if (localCommit) {
                if (!remoteSha.startsWith(localCommit)) {
                    isUpdateAvailable = true;
                }
            } else {
                isUpdateAvailable = true;
            }

            if (isUpdateAvailable) {
                const notifText = `New version (${remoteShortSha}) has been released. Would you like to update?`;
                if (window.UIManager && window.UIManager.showNotification) {
                    window.UIManager.showNotification(notifText, () => {
                        showModal(remoteSha, commitMessage);
                    });
                } else {
                    showModal(remoteSha, commitMessage);
                }
            } else {
                if (isManual && window.UIManager && window.UIManager.showNotification) {
                    window.UIManager.showNotification("You are on the latest version.");
                }
            }
        } catch (err) {
            console.error("Update check failed:", err);
            if (isManual && window.UIManager && window.UIManager.showNotification) {
                window.UIManager.showNotification("Error checking for updates.");
            }
        }
    }

    async function performUpdate() {
        if (window.UIManager && window.UIManager.showNotification) {
            window.UIManager.showNotification("Updating svmp-lqm... Please wait.");
        }

        if (window.goPerformUpdate) {
            try {
                const result = await window.goPerformUpdate();
                if (result && result.success) {
                    if (window.UIManager && window.UIManager.showNotification) {
                        window.UIManager.showNotification("Update complete! Please restart the application.");
                    }
                } else {
                    const errorMsg = result ? result.message : "Unknown build error";
                    if (window.UIManager && window.UIManager.showNotification) {
                        window.UIManager.showNotification(`Update failed: ${errorMsg}`);
                    }
                }
            } catch (err) {
                console.error("Execution error during update:", err);
                if (window.UIManager && window.UIManager.showNotification) {
                    window.UIManager.showNotification("Update failed during execution.");
                }
            }
        } else {
            if (window.UIManager && window.UIManager.showNotification) {
                window.UIManager.showNotification("Update backend unavailable.");
            }
        }
    }

    window.UpdateManager = {
        checkForUpdates: checkForUpdates,
        showModal: showModal,
        performUpdate: performUpdate
    };

    document.addEventListener("DOMContentLoaded", () => {
        createUpdateModal();
        setTimeout(() => {
            checkForUpdates(false);
        }, 2000);
    });
})();
