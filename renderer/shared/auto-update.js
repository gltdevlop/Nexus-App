// Auto-Update Manager for Nexus App
(function () {
    'use strict';

    let updateInfo = null;
    let isPortable = false;

    // Initialize auto-update listeners
    function initAutoUpdate() {
        // Listen for update available
        window.api.autoUpdate.onUpdateAvailable((info) => {
            console.log('Update available:', info);
            updateInfo = info;
            showUpdateModal(info);
        });

        // Listen for download progress
        window.api.autoUpdate.onDownloadProgress((progress) => {
            console.log('Download progress:', progress.percent);
            updateDownloadProgress(progress);
        });

        // Listen for update downloaded
        window.api.autoUpdate.onUpdateDownloaded((info) => {
            console.log('Update downloaded:', info);
            showInstallButton();
        });

        // Listen for update errors
        window.api.autoUpdate.onUpdateError((error) => {
            console.error('Update error:', error);

            // If error contains "portable" or specific error codes, show manual download
            if (error.includes('portable') || error.includes('ENOENT') || error.includes('update.yml')) {
                isPortable = true;
                showManualDownloadOption();
            } else {
                hideUpdateModal();
                // Optionally show error notification
            }
        });

        // Setup button handlers
        setupUpdateButtons();
    }

    function showUpdateModal(info) {
        const modal = document.getElementById('update-modal');
        const versionText = document.getElementById('update-version-text');

        if (modal && versionText) {
            versionText.textContent = `Une nouvelle version ${info.version} est disponible !`;
            modal.style.display = 'flex';
        }
    }

    function hideUpdateModal() {
        const modal = document.getElementById('update-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    function updateDownloadProgress(progress) {
        const progressContainer = document.getElementById('update-progress-container');
        const progressBar = document.getElementById('update-progress-bar');
        const progressText = document.getElementById('update-progress-text');
        const downloadBtn = document.getElementById('update-download-btn');

        if (progressContainer && progressBar && progressText) {
            progressContainer.style.display = 'block';
            progressBar.style.width = `${Math.round(progress.percent)}%`;

            const mbTransferred = (progress.transferred / 1024 / 1024).toFixed(1);
            const mbTotal = (progress.total / 1024 / 1024).toFixed(1);
            progressText.textContent = `Téléchargement en cours... ${Math.round(progress.percent)}% (${mbTransferred}MB / ${mbTotal}MB)`;
        }

        // Hide download button while downloading
        if (downloadBtn) {
            downloadBtn.style.display = 'none';
        }
    }

    function showInstallButton() {
        const downloadBtn = document.getElementById('update-download-btn');
        const installBtn = document.getElementById('update-install-btn');
        const progressText = document.getElementById('update-progress-text');

        if (downloadBtn) downloadBtn.style.display = 'none';
        if (installBtn) installBtn.style.display = 'inline-block';
        if (progressText) progressText.textContent = 'Téléchargement terminé ! Prêt à installer.';
    }

    function showManualDownloadOption() {
        const downloadBtn = document.getElementById('update-download-btn');
        const manualBtn = document.getElementById('update-manual-btn');
        const versionText = document.getElementById('update-version-text');
        const progressContainer = document.getElementById('update-progress-container');

        if (downloadBtn) downloadBtn.style.display = 'none';
        if (manualBtn) manualBtn.style.display = 'inline-block';
        if (progressContainer) progressContainer.style.display = 'none';

        if (versionText && updateInfo) {
            versionText.textContent = `Une nouvelle version ${updateInfo.version} est disponible ! (Version portable - téléchargement manuel requis)`;
        }
    }

    function setupUpdateButtons() {
        // Later button
        const laterBtn = document.getElementById('update-later-btn');
        if (laterBtn) {
            laterBtn.addEventListener('click', () => {
                hideUpdateModal();
            });
        }

        // Download button
        const downloadBtn = document.getElementById('update-download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async () => {
                console.log('Starting update download...');
                const result = await window.api.autoUpdate.downloadUpdate();
                if (!result.success) {
                    console.error('Failed to start download:', result.error);
                    // Check if it's a portable version
                    if (result.error && (result.error.includes('portable') || result.error.includes('update.yml'))) {
                        isPortable = true;
                        showManualDownloadOption();
                    }
                }
            });
        }

        // Install button
        const installBtn = document.getElementById('update-install-btn');
        if (installBtn) {
            installBtn.addEventListener('click', () => {
                console.log('Installing update and restarting...');
                window.api.autoUpdate.installUpdate();
            });
        }

        // Manual download button
        const manualBtn = document.getElementById('update-manual-btn');
        if (manualBtn) {
            manualBtn.addEventListener('click', () => {
                console.log('Opening release page...');
                window.api.autoUpdate.openReleasePage();
                hideUpdateModal();
            });
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAutoUpdate);
    } else {
        initAutoUpdate();
    }

})();
