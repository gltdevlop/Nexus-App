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

        // Check for new version and show changelog if needed
        checkAndShowChangelog();
    }

    // Check if there's a new version and show changelog
    async function checkAndShowChangelog() {
        try {
            // Get current app version from package.json
            const currentVersion = await getCurrentVersion();

            // Get last seen version
            const lastSeenResult = await window.api.changelog.getLastSeenVersion();
            const lastSeenVersion = lastSeenResult.success ? lastSeenResult.version : null;

            console.log('Current version:', currentVersion);
            console.log('Last seen version:', lastSeenVersion);

            // If versions are different (or first run), show changelog
            if (lastSeenVersion !== currentVersion) {
                console.log('New version detected, showing changelog');
                await showWhatsNewModal(currentVersion);
            }
        } catch (error) {
            console.error('Error checking changelog:', error);
        }
    }

    // Get current app version
    async function getCurrentVersion() {
        try {
            const changelogResult = await window.api.changelog.getChangelog();
            if (changelogResult.success && changelogResult.changelog.versions.length > 0) {
                return changelogResult.changelog.versions[0].version;
            }
        } catch (error) {
            console.error('Error getting current version:', error);
        }
        return null;
    }

    // Show What's New modal
    async function showWhatsNewModal(version) {
        try {
            const result = await window.api.changelog.getChangelog();
            if (!result.success) {
                console.error('Failed to load changelog:', result.error);
                return;
            }

            const changelog = result.changelog;
            const versionData = changelog.versions.find(v => v.version === version);

            if (!versionData) {
                console.error('Version not found in changelog:', version);
                return;
            }

            // Populate modal
            document.getElementById('whats-new-version-number').textContent = versionData.version;
            document.getElementById('whats-new-version-date').textContent = formatDate(versionData.date);

            // Features
            const featuresSection = document.getElementById('whats-new-features');
            const featuresList = document.getElementById('whats-new-features-list');
            if (versionData.features && versionData.features.length > 0) {
                featuresList.innerHTML = versionData.features.map(f => `<li>${f}</li>`).join('');
                featuresSection.style.display = 'block';
            } else {
                featuresSection.style.display = 'none';
            }

            // Improvements
            const improvementsSection = document.getElementById('whats-new-improvements');
            const improvementsList = document.getElementById('whats-new-improvements-list');
            if (versionData.improvements && versionData.improvements.length > 0) {
                improvementsList.innerHTML = versionData.improvements.map(i => `<li>${i}</li>`).join('');
                improvementsSection.style.display = 'block';
            } else {
                improvementsSection.style.display = 'none';
            }

            // Fixes
            const fixesSection = document.getElementById('whats-new-fixes');
            const fixesList = document.getElementById('whats-new-fixes-list');
            if (versionData.fixes && versionData.fixes.length > 0) {
                fixesList.innerHTML = versionData.fixes.map(f => `<li>${f}</li>`).join('');
                fixesSection.style.display = 'block';
            } else {
                fixesSection.style.display = 'none';
            }

            // Show modal
            const modal = document.getElementById('whats-new-modal');
            if (modal) {
                modal.style.display = 'flex';
            }
        } catch (error) {
            console.error('Error showing What\'s New modal:', error);
        }
    }

    // Format date to French format
    function formatDate(dateString) {
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('fr-FR', options);
    }

    // Setup What's New modal close button
    function setupWhatsNewModal() {
        const closeBtn = document.getElementById('whats-new-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', async () => {
                const modal = document.getElementById('whats-new-modal');
                if (modal) {
                    modal.style.display = 'none';
                }

                // Mark current version as seen
                const currentVersion = await getCurrentVersion();
                if (currentVersion) {
                    await window.api.changelog.setLastSeenVersion(currentVersion);
                    console.log('Version marked as seen:', currentVersion);
                }
            });
        }
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
        document.addEventListener('DOMContentLoaded', () => {
            initAutoUpdate();
            setupWhatsNewModal();
        });
    } else {
        initAutoUpdate();
        setupWhatsNewModal();
    }

    // Expose test function to window for testing
    window.testWhatsNew = async function () {
        const currentVersion = await getCurrentVersion();
        if (currentVersion) {
            await showWhatsNewModal(currentVersion);
        } else {
            console.error('Could not get current version');
        }
    };

})();
