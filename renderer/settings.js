// Settings Module

export function initSettings(callbacks) {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsCloseBtn = document.getElementById('settings-close-btn');
    const settingsSaveBtn = document.getElementById('settings-save-btn');

    // WebDAV Settings
    const settingsDavUrl = document.getElementById('settings-dav-url');
    const settingsDavUser = document.getElementById('settings-dav-user');
    const settingsDavPass = document.getElementById('settings-dav-pass');
    const settingShowHidden = document.getElementById('setting-show-hidden');

    // GDrive Settings
    const settingsGdriveClientId = document.getElementById('settings-gdrive-client-id');
    const settingsGdriveClientSecret = document.getElementById('settings-gdrive-client-secret');
    const settingsGdriveShowHidden = document.getElementById('setting-gdrive-show-hidden');
    const settingsGdriveAuthBtn = document.getElementById('settings-gdrive-auth-btn');
    const settingsGdriveLogoutBtn = document.getElementById('settings-gdrive-logout-btn');
    const settingsGdriveStatus = document.getElementById('settings-gdrive-status');

    // Sidebar Navigation
    const settingsSidebar = document.querySelector('.settings-sidebar');
    const settingsSections = document.querySelectorAll('.settings-section');

    settingsSidebar.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            settingsSidebar.querySelectorAll('li').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');

            const sectionName = e.target.dataset.section;
            settingsSections.forEach(s => s.style.display = 'none');
            const targetSection = document.getElementById(`settings-section-${sectionName}`);
            if (targetSection) targetSection.style.display = 'block';
        }
    });

    settingsCloseBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    settingsBtn.addEventListener('click', async () => {
        // Load WebDAV Config
        const webdavConfig = await window.api.webdav.getConfig();
        if (webdavConfig) {
            settingsDavUrl.value = webdavConfig.url || '';
            settingsDavUser.value = webdavConfig.username || '';
            settingsDavPass.value = webdavConfig.password || '';
            settingShowHidden.checked = !!webdavConfig.showHiddenFiles;
        } else {
            settingShowHidden.checked = false;
        }

        // Load GDrive Config
        const gdriveConfig = await window.api.gdrive.getConfig();
        if (gdriveConfig) {
            settingsGdriveClientId.value = gdriveConfig.clientId || '';
            settingsGdriveClientSecret.value = gdriveConfig.clientSecret || '';
            settingsGdriveShowHidden.checked = !!gdriveConfig.showHiddenFiles;

            if (gdriveConfig.connected) {
                settingsGdriveStatus.textContent = "Connecté à Google Drive";
                settingsGdriveAuthBtn.style.display = 'none';
                settingsGdriveLogoutBtn.style.display = 'block';
            } else {
                settingsGdriveStatus.textContent = "Non connecté";
                settingsGdriveAuthBtn.style.display = 'block';
                settingsGdriveLogoutBtn.style.display = 'none';
            }
        }

        settingsModal.style.display = 'flex';
    });

    settingsGdriveAuthBtn.addEventListener('click', async () => {
        const clientId = settingsGdriveClientId.value.trim();
        const clientSecret = settingsGdriveClientSecret.value.trim();
        const showHiddenFiles = settingsGdriveShowHidden.checked;

        await window.api.gdrive.saveConfig({ clientId, clientSecret, showHiddenFiles });

        settingsGdriveStatus.textContent = "Authentification en cours... Veuillez vérifier votre navigateur.";

        const result = await window.api.gdrive.auth();
        if (result.success) {
            settingsGdriveStatus.textContent = "Connecté avec succès !";
            settingsGdriveAuthBtn.style.display = 'none';
            settingsGdriveLogoutBtn.style.display = 'block';
        } else {
            settingsGdriveStatus.textContent = "Erreur: " + result.error;
        }
    });

    settingsGdriveLogoutBtn.addEventListener('click', async () => {
        await window.api.gdrive.disconnect();
        settingsGdriveStatus.textContent = "Déconnecté";
        settingsGdriveAuthBtn.style.display = 'block';
        settingsGdriveLogoutBtn.style.display = 'none';
    });

    settingsSaveBtn.addEventListener('click', async () => {
        // Save WebDAV Config
        const url = settingsDavUrl.value.trim();
        const user = settingsDavUser.value.trim();
        const pass = settingsDavPass.value.trim();
        const showHiddenFiles = settingShowHidden.checked;

        await window.api.webdav.saveConfig({
            url,
            username: user,
            password: pass,
            showHiddenFiles
        });

        // Save GDrive Config
        const clientId = settingsGdriveClientId.value.trim();
        const clientSecret = settingsGdriveClientSecret.value.trim();
        const gdriveShowHiddenFiles = settingsGdriveShowHidden.checked;
        await window.api.gdrive.saveConfig({ clientId, clientSecret, showHiddenFiles: gdriveShowHiddenFiles });

        // Check if GDrive needs auth
        if (clientId && clientSecret) {
            const gConf = await window.api.gdrive.getConfig();
            if (!gConf.connected) {
                if (confirm("Google Drive n'est pas encore connecté.\n\nVous devez cliquer sur 'Connexion Google' (Étape 2) pour finaliser l'accès.\n\nVoulez-vous le faire maintenant ?")) {
                    settingsSidebar.querySelectorAll('li').forEach(l => l.classList.remove('active'));
                    const gTab = settingsSidebar.querySelector('li[data-section="gdrive"]');
                    if (gTab) gTab.classList.add('active');

                    settingsSections.forEach(s => s.style.display = 'none');
                    document.getElementById('settings-section-gdrive').style.display = 'block';
                    return;
                }
            }
        }

        settingsModal.style.display = 'none';

        // Notify callback to refresh files if needed
        if (callbacks.onSettingsSaved) {
            callbacks.onSettingsSaved();
        }
    });
}
