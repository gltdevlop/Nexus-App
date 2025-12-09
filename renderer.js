window.addEventListener('DOMContentLoaded', () => {

    // --- ÉLÉMENTS DU DOM PRINCIPAUX ---
    const serviceList = document.getElementById('service-list');
    const addServiceBtn = document.getElementById('add-service-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsCloseBtn = document.getElementById('settings-close-btn');

    settingsCloseBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
        // Reload services/files if config changed? 
        // For now just close. The specialized save buttons handle specific reloads.
    });

    // Context Menu (Services)
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `
        <div class="context-menu-item" id="ctx-edit">Modifier</div>
        <div class="context-menu-item delete" id="ctx-delete">Supprimer</div>
    `;
    document.body.appendChild(contextMenu);

    // Context Menu (Files)
    const filesContextMenu = document.createElement('div');
    filesContextMenu.className = 'context-menu';
    filesContextMenu.style.zIndex = "10001"; // Ensure on top
    filesContextMenu.innerHTML = `
        <div class="context-menu-item" id="ctx-files-open">Ouvrir</div>
        <div class="context-menu-item" id="ctx-files-download">Télécharger</div>
        <div class="context-menu-item" id="ctx-files-new-folder">Nouveau dossier</div>
        <div class="context-menu-item" id="ctx-files-rename">Renommer</div>
        <div class="context-menu-item delete" id="ctx-files-delete">Supprimer</div>
    `;
    document.body.appendChild(filesContextMenu);

    let contextMenuTargetIndex = -1;
    let contextMenuTargetFile = null;

    // --- STATE VARIABLES ---
    let filesAppInitialized = false;
    let currentPath = "/";

    // ...

    // File Context Menu Actions
    filesContextMenu.querySelector('#ctx-files-open').addEventListener('click', async () => {
        if (contextMenuTargetFile && contextMenuTargetFile.type !== 'directory') {
            try {
                const provider = document.getElementById('files-app-container').dataset.provider;
                await window.api[provider].open(contextMenuTargetFile.filename);
            } catch (e) {
                alert("Erreur lors de l'ouverture: " + (e.message || e));
                console.error(e);
            }
        } else if (contextMenuTargetFile && contextMenuTargetFile.type === 'directory') {
            // Open directory = navigate
            const container = document.getElementById('files-app-container');
            const provider = container.dataset.provider;
            loadFiles(contextMenuTargetFile.filename, container, provider);
        }
    });

    filesContextMenu.querySelector('#ctx-files-download').addEventListener('click', async () => {
        if (contextMenuTargetFile) {
            try {
                const provider = document.getElementById('files-app-container').dataset.provider;
                if (contextMenuTargetFile.type === 'directory') {
                    if (window.api[provider].downloadDirectory) {
                        await window.api[provider].downloadDirectory(contextMenuTargetFile.filename);
                    } else {
                        alert("Non supporté");
                    }
                } else {
                    await window.api[provider].download(contextMenuTargetFile.filename);
                }
            } catch (e) {
                alert("Erreur lors du téléchargement: " + (e.message || e));
                console.error(e);
            }
        }
    });

    filesContextMenu.querySelector('#ctx-files-new-folder').addEventListener('click', () => {
        showNewFolderModal();
    });

    // New Folder Modal Logic
    const showNewFolderModal = () => {
        const modal = document.getElementById('files-new-folder-modal');
        const input = document.getElementById('files-new-folder-input');
        if (!modal || !input) return;

        input.value = "Nouveau dossier";
        modal.style.display = 'flex';
        input.focus();
        input.select();
    }

    // Global listener for new folder modal
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'files-new-folder-cancel-btn') {
            document.getElementById('files-new-folder-modal').style.display = 'none';
        }
        if (e.target.id === 'files-new-folder-save-btn') {
            const modal = document.getElementById('files-new-folder-modal');
            const input = document.getElementById('files-new-folder-input');
            const name = input.value.trim();

            if (name) {
                const container = document.getElementById('files-app-container');
                const provider = container.dataset.provider;
                const newPath = (currentPath === '/') ? '/' + name : currentPath + '/' + name;

                try {
                    modal.style.display = 'none'; // Close immediately or show loading?

                    if (window.api[provider].mkdir) {
                        const res = await window.api[provider].mkdir(newPath);
                        if (res && res.error) throw new Error(res.error);
                    } else {
                        alert("Création de dossier non supportée pour ce service.");
                    }
                    loadFiles(currentPath, container, provider);
                } catch (err) {
                    alert("Erreur: " + err.message);
                    console.error(err);
                    modal.style.display = 'flex'; // Re-open on error?
                }
            }
        }
    });

    // Rename Logic using Modal
    const showRenameModal = (targetFile) => {
        const modal = document.getElementById('files-rename-modal');
        const input = document.getElementById('files-rename-input');
        const hiddenInput = document.getElementById('files-rename-old-path');
        if (!modal || !input) return;

        input.value = targetFile.basename;
        hiddenInput.value = targetFile.filename;
        modal.style.display = 'flex';
        input.focus();
        input.select();
    };

    // Global event listener for rename modal buttons (since they are dynamic)
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'files-rename-cancel-btn') {
            document.getElementById('files-rename-modal').style.display = 'none';
        }
        if (e.target.id === 'files-rename-save-btn') {
            const modal = document.getElementById('files-rename-modal');
            const input = document.getElementById('files-rename-input');
            const hiddenInput = document.getElementById('files-rename-old-path');

            const newName = input.value.trim();
            const oldPath = hiddenInput.value;
            const oldName = oldPath.split('/').pop(); // approximate basename from path

            modal.style.display = 'none';

            if (newName && newName !== oldName) {
                try {
                    // Logic to reconstruct parent path from oldPath
                    // Assuming standard UNIX behavior: path/to/file
                    const lastSlashIndex = oldPath.lastIndexOf('/');
                    let parentPath = lastSlashIndex !== -1 ? oldPath.substring(0, lastSlashIndex) : "";
                    if (!parentPath.endsWith('/')) parentPath += '/';
                    // If oldPath was just "/file", parent is "/"
                    if (oldPath.startsWith('/') && lastSlashIndex === 0) parentPath = '/';

                    const newPath = parentPath + newName;

                    const container = document.getElementById('files-app-container');
                    const provider = container.dataset.provider;
                    const grid = document.getElementById('files-grid');
                    grid.innerHTML = '<div class="files-loading">Renommage...</div>';

                    const result = await window.api[provider].rename(oldPath, newPath);
                    if (result && result.error) throw new Error(result.error);

                    loadFiles(currentPath, container);
                } catch (e) {
                    alert("Erreur lors du renommage: " + (e.message || e));
                    console.error(e);
                    // Reload to restore view
                    loadFiles(currentPath, document.getElementById('files-app-container'));
                }
            }
        }
        // Click outside to close
        if (e.target.id === 'files-rename-modal') {
            e.target.style.display = 'none';
        }
    });

    filesContextMenu.querySelector('#ctx-files-rename').addEventListener('click', () => {
        if (contextMenuTargetFile) {
            // Need to verify if modal exists (initFilesApp must be run)
            if (document.getElementById('files-rename-modal')) {
                showRenameModal(contextMenuTargetFile);
            } else {
                alert("Erreur: L'interface de fichiers n'est pas complètement chargée.");
            }
        }
    });

    filesContextMenu.querySelector('#ctx-files-delete').addEventListener('click', async () => {
        if (contextMenuTargetFile) {
            if (confirm(`Voulez-vous vraiment supprimer "${contextMenuTargetFile.basename}" ?`)) {
                try {
                    const container = document.getElementById('files-app-container');
                    const provider = container.dataset.provider;

                    const result = await window.api[provider].delete(contextMenuTargetFile.filename);
                    if (result && result.error) throw new Error(result.error);

                    // Refresh
                    loadFiles(currentPath, container, provider);
                } catch (e) {
                    alert("Erreur lors de la suppression: " + (e.message || e));
                    console.error(e);
                }
            }
        }
    });

    // ...

    async function initFilesApp(container, providerName) {
        // Always re-check config incase it changed, but we can keep DOM structure if init
        if (!filesAppInitialized) {
            container.innerHTML = `
               <div id="files-login-view" class="files-auth-container" style="display:none; text-align:center;">
                   <h2>Non configuré</h2>
                   <p>Veuillez configurer ce service dans les réglages.</p>
                   <button id="open-settings-from-files">Ouvrir les Réglages</button>
               </div>
               <div id="files-main-view" class="files-app-container" style="display:none;">
                   <div class="files-toolbar">
                       <button id="files-refresh-btn" title="Actualiser">↻</button>
                       <button id="files-home-btn" title="Racine">🏠</button>
                       <button id="files-upload-btn" title="Téléverser un fichier">+</button>
                       <button id="files-upload-folder-btn" title="Téléverser un dossier">📂+</button>
                       <div id="files-breadcrumbs" class="breadcrumbs"></div>
                   </div>
                   <div id="files-grid" class="files-grid"></div>
               </div>
                              <!-- Rename Modal -->
                <div id="files-rename-modal" class="modal-overlay" style="display:none;">
                    <div class="modal-content">
                        <h2>Renommer</h2>
                        <input type="text" id="files-rename-input" placeholder="Nouveau nom" style="width: 100%; margin: 10px 0; padding: 8px;">
                        <input type="hidden" id="files-rename-old-path">
                        <div class="modal-actions">
                            <button id="files-rename-cancel-btn">Annuler</button>
                            <button id="files-rename-save-btn" class="primary-btn">Enregistrer</button>
                        </div>
                    </div>
                </div>

                <!-- New Folder Modal -->
                <div id="files-new-folder-modal" class="modal-overlay" style="display:none;">
                    <div class="modal-content">
                        <h2>Nouveau Dossier</h2>
                        <input type="text" id="files-new-folder-input" placeholder="Nom du dossier" style="width: 100%; margin: 10px 0; padding: 8px;">
                        <div class="modal-actions">
                            <button id="files-new-folder-cancel-btn">Annuler</button>
                            <button id="files-new-folder-save-btn" class="primary-btn">Créer</button>
                        </div>
                    </div>
                </div>
            `;

            // Bind Events
            container.querySelector('#open-settings-from-files').addEventListener('click', () => {
                settingsBtn.click(); // Trigger settings open logic
            });

            // Enter key support for Rename Input
            container.querySelector('#files-rename-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('files-rename-save-btn').click();
                }
            });

            // Enter key support for New Folder Input
            container.querySelector('#files-new-folder-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('files-new-folder-save-btn').click();
                }
            });

            container.querySelector('#files-refresh-btn').addEventListener('click', () => {
                const p = container.dataset.provider;
                loadFiles(currentPath, container, p);
            });
            container.querySelector('#files-home-btn').addEventListener('click', () => {
                const p = container.dataset.provider;
                console.log("[Files App] Home Button Clicked. Provider from dataset:", p);
                loadFiles("/", container, p);
            });
            container.querySelector('#files-upload-btn').addEventListener('click', async () => {
                const p = container.dataset.provider;
                await window.api[p].uploadFile(currentPath);
                loadFiles(currentPath, container, p);
            });
            container.querySelector('#files-upload-folder-btn').addEventListener('click', async () => {
                const p = container.dataset.provider;
                if (window.api[p].uploadDirectory) {
                    await window.api[p].uploadDirectory(currentPath);
                } else {
                    alert("Pas encore supporté pour ce service");
                }
                loadFiles(currentPath, container, p);
            });

            // Grid Context Menu (Target Empty Space)
            container.querySelector('#files-main-view').addEventListener('contextmenu', (e) => {
                // Check if we clicked ON a file (handled below in loadFiles items) or empty space
                if (e.target.closest('.file-item')) return; // Let the item listener handle it

                e.preventDefault();
                contextMenuTargetFile = null; // No file selected

                // Show only New Folder? Hide others
                filesContextMenu.querySelector('#ctx-files-open').style.display = 'none';
                filesContextMenu.querySelector('#ctx-files-download').style.display = 'none';
                filesContextMenu.querySelector('#ctx-files-rename').style.display = 'none';
                filesContextMenu.querySelector('#ctx-files-delete').style.display = 'none';
                filesContextMenu.querySelector('#ctx-files-new-folder').style.display = 'block';

                filesContextMenu.style.top = `${e.clientY}px`;
                filesContextMenu.style.left = `${e.clientX}px`;
                filesContextMenu.style.display = 'block';
            });

            // Drag & Drop
            const dropZone = container.querySelector('#files-main-view');

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('drag-over');
            });

            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.relatedTarget && dropZone.contains(e.relatedTarget)) return;
                dropZone.classList.remove('drag-over');
            });

            dropZone.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('drag-over');

                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                    const paths = files.map(f => f.path).filter(p => !!p);

                    if (paths.length === 0) {
                        alert("Impossible de localiser les fichiers. Le Drag & Drop peut être restreint par le système.");
                        return;
                    }

                    try {
                        const grid = container.querySelector('#files-grid');
                        grid.innerHTML = '<div class="files-loading">Téléversement en cours...</div>';

                        const result = await window.api.webdav.uploadPaths(currentPath, paths);
                        if (!result || !result.success) throw new Error(result ? result.error : "Erreur inconnue");

                        loadFiles(currentPath, container);
                    } catch (e) {
                        alert("Erreur lors du téléversement: " + (e.message || e));
                        loadFiles(currentPath, container);
                    }
                }
            });

            filesAppInitialized = true;
        }

        // Reset path to root if provider changed to avoid path errors
        const previousProvider = container.dataset.provider;
        if (previousProvider && previousProvider !== providerName) {
            currentPath = "/";
        }

        container.dataset.provider = providerName;
        checkFilesConfig(container, providerName);
    }
    const webview = document.getElementById('service-webview');
    const welcomeContainer = document.getElementById('welcome-container');
    const todoAppContainer = document.getElementById('todo-app-container');
    const filesAppContainer = document.getElementById('files-app-container');

    // Éléments de la modale d'ajout de service
    const modal = document.getElementById('add-service-modal');
    const nameInput = document.getElementById('service-name-input');
    const urlInput = document.getElementById('service-url-input');
    const okBtn = document.getElementById('config-ok-btn');
    const cancelBtn = document.getElementById('config-cancel-btn');
    const internalSelect = document.getElementById('service-internal-select');

    // Logic for internal select
    internalSelect.addEventListener('change', () => {
        if (internalSelect.value) {
            urlInput.value = internalSelect.value;
            // Auto-fill name if empty
            if (!nameInput.value.trim()) {
                if (internalSelect.value === 'internal://todo') nameInput.value = "ToDo List";
                else if (internalSelect.value === 'internal://files') nameInput.value = "Fichiers WebDAV";
                else if (internalSelect.value === 'internal://gdrive') nameInput.value = "Fichiers GDrive";
            }
        }
    });

    let editingServiceIndex = -1; // -1 means new service

    // --- GESTION DE LA MODALE D'AJOUT DE SERVICE ---

    function toggleModal(show, editIndex = -1) {
        if (show) {
            editingServiceIndex = editIndex;
            if (editIndex >= 0) {
                // Edit Mode
                window.api.getServices().then(services => {
                    const s = services[editIndex];
                    if (s) {
                        nameInput.value = s.name;
                        urlInput.value = s.url;
                        // Set dropdown if matches
                        if (['internal://todo', 'internal://files'].includes(s.url)) {
                            internalSelect.value = s.url;
                        } else {
                            internalSelect.value = "";
                        }
                    }
                });
                modal.querySelector('h2').textContent = "Modifier le service";
            } else {
                // New Mode
                nameInput.value = '';
                urlInput.value = '';
                internalSelect.value = "";
                modal.querySelector('h2').textContent = "Ajouter un service";
            }
            modal.style.display = 'flex';
            nameInput.focus();
        } else {
            modal.style.display = 'none';
        }
    }

    async function handleSaveService() {
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();

        if (!name || !url) {
            alert("Le nom et l'URL ne peuvent pas être vides.");
            return;
        }

        try {
            if (url !== 'internal://todo' && url !== 'internal://files') new URL(url);
        } catch (_) {
            alert("Veuillez entrer une URL valide (ex: https://example.com) ou une URL interne (internal://todo, internal://files)");
            return;
        }

        const services = await window.api.getServices();

        if (editingServiceIndex >= 0) {
            // Update existing
            services[editingServiceIndex] = { name, url };
        } else {
            // Add new
            services.push({ name, url });

            // Remove 'Plus de services' if it exists (first time adding a service)
            const plusDeServicesIndex = services.findIndex(s => s.url === 'internal://add-service');
            if (plusDeServicesIndex !== -1) {
                services.splice(plusDeServicesIndex, 1);
            }
        }

        await window.api.saveServices(services);

        renderServiceTabs(services);
        toggleModal(false);
    }


    // --- GESTION DU MENU CONTEXTUEL ---
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
        filesContextMenu.style.display = 'none';
    });



    // --- GESTION DES REGLAGES ---
    const settingsDavUrl = document.getElementById('settings-dav-url');
    const settingsDavUser = document.getElementById('settings-dav-user');
    const settingsDavPass = document.getElementById('settings-dav-pass');
    const settingsSaveBtn = document.getElementById('settings-save-btn');
    const settingShowHidden = document.getElementById('setting-show-hidden');

    // Sidebar Navigation logic
    const settingsSidebar = document.querySelector('.settings-sidebar');
    const settingsSections = document.querySelectorAll('.settings-section');

    settingsSidebar.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            // UI Update
            settingsSidebar.querySelectorAll('li').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');

            // Show Section
            const sectionName = e.target.dataset.section;
            // Currently we only have 'files', but this handles future sections
            settingsSections.forEach(s => s.style.display = 'none');
            const targetSection = document.getElementById(`settings-section-${sectionName}`);
            if (targetSection) targetSection.style.display = 'block';
        }
    });


    // Refresh Files App if visible or on next load
    if (filesAppInitialized && document.getElementById('files-app-container').style.display === 'flex') {
        const currentProvider = document.getElementById('files-app-container').dataset.provider || 'webdav';
        checkFilesConfig(document.getElementById('files-app-container'), currentProvider);
    }

    // --- GESTION REGLAGES GDRIVE ---
    const settingsGdriveClientId = document.getElementById('settings-gdrive-client-id');
    const settingsGdriveClientSecret = document.getElementById('settings-gdrive-client-secret');
    const settingsGdriveShowHidden = document.getElementById('setting-gdrive-show-hidden');
    const settingsGdriveAuthBtn = document.getElementById('settings-gdrive-auth-btn');
    const settingsGdriveLogoutBtn = document.getElementById('settings-gdrive-logout-btn');
    const settingsGdriveStatus = document.getElementById('settings-gdrive-status');

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
        // Save client id/secret first
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
            const gConf = await window.api.gdrive.getConfig(); // reload to get connected status
            if (!gConf.connected) {
                if (confirm("Google Drive n'est pas encore connecté.\n\nVous devez cliquer sur 'Connexion Google' (Étape 2) pour finaliser l'accès.\n\nVoulez-vous le faire maintenant ?")) {
                    // Switch/Keep view to GDrive
                    settingsSidebar.querySelectorAll('li').forEach(l => l.classList.remove('active'));
                    const gTab = settingsSidebar.querySelector('li[data-section="gdrive"]');
                    if (gTab) gTab.classList.add('active');

                    settingsSections.forEach(s => s.style.display = 'none');
                    document.getElementById('settings-section-gdrive').style.display = 'block';
                    return; // Stop here, keep modal open
                }
            }
        }

        settingsModal.style.display = 'none';

        // Refresh Files App if visible
        if (filesAppInitialized && document.getElementById('files-app-container').style.display === 'flex') {
            const currentProvider = document.getElementById('files-app-container').dataset.provider || 'webdav';
            checkFilesConfig(document.getElementById('files-app-container'), currentProvider);
        }
    });

    document.getElementById('ctx-edit').addEventListener('click', () => {
        if (contextMenuTargetIndex >= 0) {
            toggleModal(true, contextMenuTargetIndex);
        }
    });

    document.getElementById('ctx-delete').addEventListener('click', async () => {
        if (contextMenuTargetIndex >= 0) {
            if (confirm("Voulez-vous vraiment supprimer ce service ?")) {
                const services = await window.api.getServices();
                services.splice(contextMenuTargetIndex, 1);
                await window.api.saveServices(services);
                renderServiceTabs(services);

                // If we deleted the active one, show welcome
                welcomeContainer.style.display = 'block';
                webview.style.display = 'none';
                todoAppContainer.style.display = 'none';
                filesAppContainer.style.display = 'none';
            }
        }
    });


    // --- GESTION DES SERVICES (ONGLETS PRINCIPAUX) ---

    function renderServiceTabs(services) {
        serviceList.innerHTML = '';
        services.forEach((service, index) => {
            const listItem = document.createElement('li');
            listItem.textContent = service.name;
            listItem.dataset.url = service.url;
            listItem.dataset.index = index;

            // Make draggable
            listItem.draggable = true;

            // Drag start
            listItem.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index);
                listItem.classList.add('dragging');
            });

            // Drag end
            listItem.addEventListener('dragend', (e) => {
                listItem.classList.remove('dragging');
            });

            // Drag over
            listItem.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const draggingItem = serviceList.querySelector('.dragging');
                if (draggingItem && draggingItem !== listItem) {
                    const rect = listItem.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;

                    if (e.clientY < midpoint) {
                        serviceList.insertBefore(draggingItem, listItem);
                    } else {
                        serviceList.insertBefore(draggingItem, listItem.nextSibling);
                    }
                }
            });

            // Drop
            listItem.addEventListener('drop', async (e) => {
                e.preventDefault();

                // Rebuild services array from current DOM order
                const newServices = [];
                serviceList.querySelectorAll('li').forEach(li => {
                    const originalIndex = parseInt(li.dataset.index);
                    newServices.push(services[originalIndex]);
                });

                // Save new order
                await window.api.saveServices(newServices);

                // Re-render with new order
                renderServiceTabs(newServices);
            });

            // Right Click Logic
            listItem.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                contextMenuTargetIndex = index;
                contextMenu.style.top = `${e.clientY}px`;
                contextMenu.style.left = `${e.clientX}px`;
                contextMenu.style.display = 'block';
            });

            serviceList.appendChild(listItem);
        });
    }

    function showService(liElement) {
        // Gère l'état 'active' sur les onglets
        serviceList.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
        liElement.classList.add('active');

        const serviceUrl = liElement.dataset.url;

        // Cache tous les conteneurs
        welcomeContainer.style.display = 'none';
        webview.style.display = 'none';
        todoAppContainer.style.display = 'none';
        filesAppContainer.style.display = 'none';

        if (serviceUrl === 'internal://todo') {
            todoAppContainer.style.display = 'flex';
            initTodoApp(todoAppContainer);
        } else if (serviceUrl === 'internal://files') {
            filesAppContainer.style.display = 'flex';
            initFilesApp(filesAppContainer, 'webdav');
        } else if (serviceUrl === 'internal://gdrive') {
            filesAppContainer.style.display = 'flex';
            initFilesApp(filesAppContainer, 'gdrive');
        } else if (serviceUrl === 'internal://add-service') {
            // Special case: open add service modal
            addServiceBtn.click();
            // Deselect the tab since it's not a real service
            liElement.classList.remove('active');
            // Show welcome screen
            welcomeContainer.style.display = 'block';
        } else {
            webview.style.display = 'flex';
            webview.src = serviceUrl;
        }
    }

    // --- LOGIQUE DE APPLICATION FILES (WEBDAV) ---
    // (Voir initFilesApp plus haut)

    async function checkFilesConfig(container, providerName) {
        const api = window.api[providerName];
        if (!api) return;

        const config = await api.getConfig();
        const loginView = container.querySelector('#files-login-view');
        const mainView = container.querySelector('#files-main-view');

        // Check: WebDAV needs URL, GDrive needs connection
        const isConfigured = providerName === 'gdrive' ? config.connected : (config && config.url);

        if (isConfigured) {
            loginView.style.display = 'none';
            mainView.style.display = 'flex';
            loadFiles(currentPath, container, providerName);
        } else {
            loginView.style.display = 'flex';
            mainView.style.display = 'none';
        }
    }

    async function loadFiles(path, container, providerName) {
        if (!providerName) providerName = container.dataset.provider;
        currentPath = path;
        const grid = container.querySelector('#files-grid');
        const breadcrumbs = container.querySelector('#files-breadcrumbs');

        // Update Breadcrumbs
        breadcrumbs.innerHTML = '';
        const parts = path.split('/').filter(p => p);
        let buildPath = "";

        // Root
        const rootSpan = document.createElement('span');
        rootSpan.className = 'breadcrumb-item';
        rootSpan.textContent = 'Racine';
        rootSpan.addEventListener('click', () => loadFiles("/", container, providerName));
        breadcrumbs.appendChild(rootSpan);

        parts.forEach((part, index) => {
            buildPath += "/" + part;
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-sep';
            sep.textContent = ' > ';
            breadcrumbs.appendChild(sep);

            const span = document.createElement('span');
            span.className = 'breadcrumb-item';
            span.textContent = part;
            if (index === parts.length - 1) span.classList.add('active');
            else {
                const target = buildPath;
                span.addEventListener('click', () => loadFiles(target, container, providerName));
            }
            breadcrumbs.appendChild(span);
        });


        grid.innerHTML = '<div class="files-loading">Chargement...</div>';

        try {
            const api = window.api[providerName];
            const items = await api.ls(path);
            const config = await api.getConfig();
            const showHidden = config ? config.showHiddenFiles : false;

            grid.innerHTML = '';

            // Filter
            const filteredItems = items.filter(item => {
                if (showHidden) return true;
                return !item.basename.startsWith('.');
            });

            if (!filteredItems || filteredItems.length === 0) {
                grid.innerHTML = '<div class="files-loading">Dossier vide</div>';
                return;
            }

            // Sort directories first
            filteredItems.sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return a.basename.localeCompare(b.basename);
            });

            filteredItems.forEach(item => {
                const el = document.createElement('div');
                el.className = 'file-item';

                const icon = getFileIcon(item);

                el.innerHTML = `
                    <div class="file-icon">${icon}</div>
                    <div class="file-name">${item.basename}</div>
                    <div class="file-meta">${formatSize(item.size)}</div>
                `;

                // Click Action
                el.addEventListener('click', async () => {
                    if (item.type === 'directory') {
                        loadFiles(item.filename, container, providerName);
                    } else {
                        // Open File
                        const originalText = el.querySelector('.file-name').textContent;
                        el.querySelector('.file-name').textContent = "Ouverture...";
                        try {
                            const api = window.api[providerName];
                            await api.open(item.filename);
                        } catch (e) {
                            alert("Erreur lors de l'ouverture du fichier");
                        } finally {
                            el.querySelector('.file-name').textContent = originalText;
                        }
                    }
                });

                // Context Menu (Right Click) for Download
                el.addEventListener('contextmenu', async (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Prevent grid listener

                    contextMenuTargetFile = item;

                    // Reset menu items visibility for FILES
                    filesContextMenu.querySelector('#ctx-files-open').style.display = 'block';
                    filesContextMenu.querySelector('#ctx-files-download').style.display = 'block';
                    filesContextMenu.querySelector('#ctx-files-rename').style.display = 'block';
                    filesContextMenu.querySelector('#ctx-files-delete').style.display = 'block';
                    filesContextMenu.querySelector('#ctx-files-new-folder').style.display = 'none';

                    filesContextMenu.style.top = `${e.clientY}px`;
                    filesContextMenu.style.left = `${e.clientX}px`;
                    filesContextMenu.style.display = 'block';
                });

                grid.appendChild(el);
            });

        } catch (e) {
            console.error(e);
            // Show more detailed error for GDrive configuration issues
            let errorMsg = "Erreur de chargement.";
            if (e.message.includes("API has not been used")) {
                errorMsg = "L'API Google Drive n'est pas activée dans la console Google Cloud.<br><br>Activez-la et réessayez.";
            } else if (e.message.includes("Non configuré")) {
                errorMsg = "Service non configuré.";
            } else {
                errorMsg += " " + (e.message || "");
            }
            grid.innerHTML = `<div class="files-loading" style="color:red; flex-direction:column; padding:20px; text-align:center;">${errorMsg}</div>`;

            // Option to reset config?
            const resetBtn = document.createElement('button');
            resetBtn.textContent = "Réinitialiser la configuration";
            resetBtn.style.marginTop = "10px";
            resetBtn.onclick = async () => {
                await window.api.webdav.saveConfig({}); // clear
                checkFilesConfig(container);
            };
            grid.appendChild(resetBtn);
        }
    }

    function getFileIcon(item) {
        // Folder
        if (item.type === 'directory') {
            return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M19.5 21H4.5C3.67157 21 3 20.3284 3 19.5V7.5C3 6.67157 3.67157 6 4.5 6H9L11 8H19.5C20.3284 8 21 8.67157 21 9.5V19.5C21 20.3284 20.3284 21 19.5 21Z" fill="#007AFF" stroke="#007AFF" stroke-width="2" stroke-linejoin="round"/>
<path d="M3 7.5L5 9.5" stroke="#282828" stroke-width="0.5" stroke-opacity="0.1"/>
</svg>`;
        }

        const ext = item.basename.split('.').pop().toLowerCase();

        // Video
        if (['mkv', 'mp4', 'avi', 'mov', 'webm'].includes(ext)) {
            return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="2" y="4" width="20" height="16" rx="2" stroke="#FF5733" stroke-width="2"/>
<path d="M10 9L15 12L10 15V9Z" fill="#FF5733"/>
<path d="M2 8H22" stroke="#FF5733" stroke-width="2"/>
<path d="M2 16H22" stroke="#FF5733" stroke-width="2"/>
<path d="M6 4V8" stroke="#FF5733" stroke-width="2"/>
<path d="M18 4V8" stroke="#FF5733" stroke-width="2"/>
<path d="M6 16V20" stroke="#FF5733" stroke-width="2"/>
<path d="M18 16V20" stroke="#FF5733" stroke-width="2"/>
</svg>`;
        }

        // Audio
        if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) {
            return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M9 18V5L21 3V6" stroke="#4CD964" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="6" cy="18" r="3" stroke="#4CD964" stroke-width="2"/>
<circle cx="18" cy="16" r="3" stroke="#4CD964" stroke-width="2"/>
</svg>`;
        }

        // Image
        if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
            return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="3" y="3" width="18" height="18" rx="2" stroke="#5856D6" stroke-width="2"/>
<circle cx="8.5" cy="8.5" r="1.5" fill="#5856D6"/>
<path d="M21 15L16 10L5 21" stroke="#5856D6" stroke-width="2" stroke-linejoin="round"/>
</svg>`;
        }

        // PDF
        if (ext === 'pdf') {
            return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 2V8H20" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M5 12H19" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M5 16H19" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
        }

        // Default / Text / Code
        return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="#8E8E93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 2V8H20" stroke="#8E8E93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    }

    function formatSize(bytes) {
        if (bytes === 0) return '';
        const k = 1024;
        const sizes = ['octets', 'Ko', 'Mo', 'Go'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }


    // --- LOGIQUE DE L'APPLICATION TODO ---

    let todoAppInitialized = false;
    async function initTodoApp(container) {
        if (todoAppInitialized) return;
        todoAppInitialized = true;

        try {
            let state = { lists: [], tasks: [], activeFilter: { type: 'static', id: 'today' } }; // Default to Today
            container.innerHTML = `
                <div class="todo-sidebar">
                     <!-- Grid Smart Lists -->
                     <div class="smart-lists-grid">
                         <div class="smart-list-card" data-filter-type="static" data-filter-id="today">
                             <div class="card-header">
                                 <div class="card-icon icon-today">☀</div>
                                 <div class="card-count" id="count-today">0</div>
                             </div>
                             <div class="card-label">Aujourd'hui</div>
                         </div>
                         <div class="smart-list-card" data-filter-type="static" data-filter-id="calendar">
                             <div class="card-header">
                                 <div class="card-icon icon-scheduled">📅</div>
                                 <div class="card-count" id="count-scheduled">0</div>
                             </div>
                             <div class="card-label">Calendrier</div>
                         </div>
                          <div class="smart-list-card" data-filter-type="static" data-filter-id="all">
                             <div class="card-header">
                                 <div class="card-icon icon-all">♾</div>
                                 <div class="card-count" id="count-all">0</div>
                             </div>
                             <div class="card-label">Tout</div>
                         </div>
                          <div class="smart-list-card" data-filter-type="static" data-filter-id="completed">
                             <div class="card-header">
                                 <div class="card-icon icon-completed">✓</div>
                                 <div class="card-count" id="count-completed">0</div>
                             </div>
                             <div class="card-label">Terminé</div>
                         </div>
                     </div>
    
                    <h2>Mes Listes</h2>
                    <ul id="user-lists" class="todo-user-lists"></ul>
                    <button id="add-list-btn">+ Nouvelle liste</button>
                </div>
                <div class="todo-main-content">
                    <h1 id="current-view-title">Aujourd'hui</h1>
                    <div id="calendar-view" style="display: none;">
                        <div class="calendar-nav">
                            <button id="prev-month-btn">&lt;</button>
                            <span id="current-month-year"></span>
                            <button id="next-month-btn">&gt;</button>
                        </div>
                        <div id="calendar-grid" class="calendar-grid"></div>
                    </div>
                    <ul id="task-list" class="task-list"></ul>
                </div>`;

            // --- Todo List Context Menu ---
            const todoListContextMenu = document.createElement('div');
            todoListContextMenu.className = 'context-menu';
            todoListContextMenu.style.zIndex = "10002";
            todoListContextMenu.innerHTML = `
                <div class="context-menu-item delete" id="ctx-todo-list-delete">Supprimer</div>
            `;
            document.body.appendChild(todoListContextMenu);

            let currentContextMenuListId = null;

            // Hide menu on click elsewhere
            document.addEventListener('click', () => {
                todoListContextMenu.style.display = 'none';
            });

            // Delete Action
            todoListContextMenu.querySelector('#ctx-todo-list-delete').addEventListener('click', async () => {
                if (currentContextMenuListId) {
                    const list = state.lists.find(l => l.id === currentContextMenuListId);
                    if (list && confirm(`Voulez-vous vraiment supprimer la liste "${list.name}" et toutes ses tâches ?`)) {
                        // Remove tasks
                        state.tasks = state.tasks.filter(t => t.listId !== currentContextMenuListId);
                        // Remove list
                        state.lists = state.lists.filter(l => l.id !== currentContextMenuListId);

                        // Switch view if we were on that list
                        if (state.activeFilter.type === 'list' && state.activeFilter.id === currentContextMenuListId) {
                            // Default to today
                            const defaultFilter = container.querySelector('.smart-list-card[data-filter-id="today"]');
                            if (defaultFilter) setActiveFilter(defaultFilter);
                        }

                        await saveState();
                        renderUserLists();
                        renderTasks(); // Refresh tasks (in case we were viewing Global All and deleted some)
                        updateCounters();
                    }
                }
            });

            const calendarView = container.querySelector('#calendar-view');
            const calendarGrid = container.querySelector('#calendar-grid');
            const prevMonthBtn = container.querySelector('#prev-month-btn');
            const nextMonthBtn = container.querySelector('#next-month-btn');
            const currentMonthYear = container.querySelector('#current-month-year');
            const userLists = container.querySelector('#user-lists');
            const addListBtn = container.querySelector('#add-list-btn');
            const title = container.querySelector('#current-view-title');
            const taskList = container.querySelector('#task-list');

            // Counters Elements
            const countToday = container.querySelector('#count-today');
            const countScheduled = container.querySelector('#count-scheduled');
            const countAll = container.querySelector('#count-all');
            const countCompleted = container.querySelector('#count-completed');


            let currentDate = new Date();

            const renderCalendar = (date) => {
                currentDate = date;
                const month = date.getMonth();
                const year = date.getFullYear();

                currentMonthYear.textContent = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

                calendarGrid.innerHTML = ''; // Clear previous grid

                // Filter tasks for calendar (hide completed)
                const calendarTasks = state.tasks.filter(t => !t.completed);

                // Add headers
                const daysOfWeek = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
                daysOfWeek.forEach(day => {
                    const header = document.createElement('div');
                    header.classList.add('calendar-header');
                    header.textContent = day;
                    calendarGrid.appendChild(header);
                });

                const firstDayOfMonth = new Date(year, month, 1);
                const lastDayOfMonth = new Date(year, month + 1, 0);
                const daysInMonth = lastDayOfMonth.getDate();
                const startDay = firstDayOfMonth.getDay();

                // Add empty cells
                for (let i = 0; i < startDay; i++) {
                    const dayCell = document.createElement('div');
                    dayCell.classList.add('calendar-day', 'other-month');
                    calendarGrid.appendChild(dayCell);
                }

                // Add days
                for (let i = 1; i <= daysInMonth; i++) {
                    const dayCell = document.createElement('div');
                    dayCell.classList.add('calendar-day');

                    // Allow drop
                    dayCell.addEventListener('dragover', (e) => {
                        e.preventDefault(); // Necessary to allow dropping
                        dayCell.classList.add('drag-over');
                    });

                    dayCell.addEventListener('dragleave', () => {
                        dayCell.classList.remove('drag-over');
                    });

                    dayCell.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        dayCell.classList.remove('drag-over');
                        const taskId = e.dataTransfer.getData('text/plain');

                        // Calcul of new date
                        const targetYear = year;
                        const targetMonth = month;
                        const targetDay = i;

                        const nYearStr = targetYear;
                        const nMonthStr = String(targetMonth + 1).padStart(2, '0');
                        const nDayStr = String(targetDay).padStart(2, '0');
                        const newDateString = `${nYearStr}-${nMonthStr}-${nDayStr}`;

                        const taskIndex = state.tasks.findIndex(t => t.id === taskId);
                        if (taskIndex !== -1) {
                            // Ne mettre à jour que si la date change
                            if (state.tasks[taskIndex].dueDate !== newDateString) {
                                state.tasks[taskIndex].dueDate = newDateString;
                                await saveState();
                                renderCalendar(currentDate); // Re-render to show updated positions
                            }
                        }
                    });

                    const dayNumber = document.createElement('div');
                    dayNumber.classList.add('day-number');
                    dayNumber.textContent = i;
                    dayCell.appendChild(dayNumber);

                    const tasksContainer = document.createElement('div');
                    tasksContainer.classList.add('calendar-tasks');

                    const dayDate = new Date(year, month, i);

                    const yearStr = dayDate.getFullYear();
                    const monthStr = String(dayDate.getMonth() + 1).padStart(2, '0');
                    const dayStr = String(dayDate.getDate()).padStart(2, '0');
                    const dayDateString = `${yearStr}-${monthStr}-${dayStr}`;

                    // Add tasks
                    const tasksForDay = calendarTasks.filter(t => t.dueDate === dayDateString);
                    tasksForDay.forEach(task => {
                        const taskElement = document.createElement('div');
                        taskElement.classList.add('calendar-task');
                        taskElement.textContent = task.text;
                        taskElement.draggable = true;

                        // Click to Edit
                        taskElement.addEventListener('click', (e) => {
                            e.stopPropagation(); // Avoid triggering day click if any
                            openTaskModal(task);
                        });

                        // Drag Start
                        taskElement.addEventListener('dragstart', (e) => {
                            e.dataTransfer.setData('text/plain', task.id);
                            e.dataTransfer.effectAllowed = "move";
                            // Petite astuce pour le visuel
                            setTimeout(() => taskElement.style.opacity = '0.5', 0);
                        });

                        taskElement.addEventListener('dragend', () => {
                            taskElement.style.opacity = '1';
                        });

                        tasksContainer.appendChild(taskElement);
                    });

                    dayCell.appendChild(tasksContainer);
                    calendarGrid.appendChild(dayCell);
                }
            };

            prevMonthBtn.addEventListener('click', () => {
                currentDate.setMonth(currentDate.getMonth() - 1);
                renderCalendar(currentDate);
            });

            nextMonthBtn.addEventListener('click', () => {
                currentDate.setMonth(currentDate.getMonth() + 1);
                renderCalendar(currentDate);
            });



            const addListModal = document.getElementById('add-list-modal');

            const listNameInput = document.getElementById('list-name-input');
            const listOkBtn = document.getElementById('list-ok-btn');
            const listCancelBtn = document.getElementById('list-cancel-btn');

            // Inject Color Picker if not present
            let colorPickerContainer = addListModal ? addListModal.querySelector('.color-picker-container') : null;
            let selectedListColor = '#007aff';

            if (addListModal && !colorPickerContainer) {
                const cp = document.createElement('div');
                cp.className = 'color-picker-container';
                const colors = ['#007aff', '#ff3b30', '#34c759', '#ff9500', '#af52de', '#5856d6'];

                colors.forEach(color => {
                    const dot = document.createElement('div');
                    dot.className = 'color-option';
                    dot.style.backgroundColor = color;
                    if (color === selectedListColor) dot.classList.add('selected');

                    dot.addEventListener('click', () => {
                        cp.querySelectorAll('.color-option').forEach(d => d.classList.remove('selected'));
                        dot.classList.add('selected');
                        selectedListColor = color;
                    });
                    cp.appendChild(dot);
                });

                // Insert before buttons
                const actions = addListModal.querySelector('.modal-actions');
                addListModal.querySelector('.modal-content').insertBefore(cp, actions);
                colorPickerContainer = cp;
            }

            function toggleListModal(show) {
                if (show) {
                    listNameInput.value = '';
                    selectedListColor = '#007aff';
                    // Reset selection check
                    if (colorPickerContainer) {
                        colorPickerContainer.querySelectorAll('.color-option').forEach(d => {
                            d.classList.remove('selected');
                            if (d.style.backgroundColor === 'rgb(0, 122, 255)' || d.style.backgroundColor === '#007aff') d.classList.add('selected');
                        });
                    }
                    addListModal.style.display = 'flex';
                    listNameInput.focus();
                } else {
                    addListModal.style.display = 'none';
                }
            }

            const saveState = async () => await window.api.saveTodos(state);

            const renderUserLists = () => {
                userLists.innerHTML = '';
                state.lists.forEach(list => {
                    const li = document.createElement('li');

                    const dot = document.createElement('span');
                    dot.className = 'list-color-dot';
                    dot.style.backgroundColor = list.color || '#007aff';

                    // Dot with count
                    const count = state.tasks.filter(t => t.listId === list.id && !t.completed).length;
                    dot.textContent = count > 0 ? count : '';
                    dot.style.fontSize = '0.8em';

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = list.name;

                    li.appendChild(dot);
                    li.appendChild(nameSpan);

                    li.dataset.filterType = 'list';
                    li.dataset.filterId = list.id;

                    // Context Menu Trigger
                    li.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        currentContextMenuListId = list.id;
                        todoListContextMenu.style.top = `${e.clientY}px`;
                        todoListContextMenu.style.left = `${e.clientX}px`;
                        todoListContextMenu.style.display = 'block';
                    });

                    userLists.appendChild(li);
                });

                // Update Counters
                updateCounters();
            };

            const updateCounters = () => {
                const today = new Date().toISOString().split('T')[0];
                countToday.textContent = state.tasks.filter(t => t.dueDate === today && !t.completed).length;
                countScheduled.textContent = state.tasks.filter(t => t.dueDate && !t.completed).length;
                countAll.textContent = state.tasks.filter(t => !t.completed).length;
                countCompleted.textContent = state.tasks.filter(t => t.completed).length;
            };

            // --- MODALE TÂCHE (Ajout / Édition) ---
            let currentEditingTaskId = null; // null = mode ajout, sinon ID de la tâche


            // Sidebar Grid Listeners
            const smartListsGrid = container.querySelector('.smart-lists-grid');
            smartListsGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.smart-list-card');
                if (card) {
                    setActiveFilter(card);
                }
            });

            // Update setActiveFilter to handle Cards style active state
            const setActiveFilter = (element) => {
                // Remove active from grid and lists
                smartListsGrid.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
                userLists.querySelectorAll('.active').forEach(el => el.classList.remove('active'));

                element.classList.add('active');
                state.activeFilter = { type: element.dataset.filterType, id: element.dataset.filterId };
                renderTasks();
            };

            const existingModal = document.getElementById('task-modal-overlay');
            if (existingModal) existingModal.remove();

            const taskModalCanvas = document.createElement('div');
            taskModalCanvas.id = 'task-modal-overlay';
            taskModalCanvas.className = 'modal-overlay';
            taskModalCanvas.style.display = 'none';
            taskModalCanvas.innerHTML = `
                <div class="modal-content">
                    <h2 id="task-modal-title">Nouvelle Tâche</h2>
                    <label>Titre</label>
                    <input type="text" id="modal-task-title" placeholder="Titre de la tâche">
                    
                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1;">
                            <label>Liste</label>
                            <select id="modal-task-list" style="width: 100%;"></select>
                        </div>
                        <div style="flex: 1;">
                            <label>Récurrence</label>
                            <select id="modal-task-recurrence" style="width: 100%;">
                                <option value="none">Aucune</option>
                                <option value="daily">Quotidienne</option>
                                <option value="weekly">Hebdomadaire</option>
                                <option value="monthly">Mensuelle</option>
                                <option value="yearly">Annuelle</option>
                            </select>
                        </div>
                    </div>
    
                    <label>Description</label>
                    <textarea id="modal-task-desc" placeholder="Détails..."></textarea>
                    <label>Date d'échéance</label>
                    <input type="date" id="modal-task-date">
                    <div class="modal-actions">
                        <button id="modal-task-cancel">Annuler</button>
                        <button id="modal-task-save">Enregistrer</button>
                    </div>
                </div>
            `;
            container.appendChild(taskModalCanvas);

            const modalTitle = taskModalCanvas.querySelector('#task-modal-title');
            const modalTaskTitle = taskModalCanvas.querySelector('#modal-task-title');
            const modalTaskList = taskModalCanvas.querySelector('#modal-task-list');
            const modalTaskRecurrence = taskModalCanvas.querySelector('#modal-task-recurrence');
            const modalTaskDesc = taskModalCanvas.querySelector('#modal-task-desc');
            const modalTaskDate = taskModalCanvas.querySelector('#modal-task-date');
            const modalTaskCancel = taskModalCanvas.querySelector('#modal-task-cancel');
            const modalTaskSave = taskModalCanvas.querySelector('#modal-task-save');

            // Bouton Flottant "+"
            const fabBtn = document.createElement('button');
            fabBtn.id = 'fab-add-task';
            fabBtn.className = 'fab-btn';
            fabBtn.textContent = '+';
            fabBtn.style.display = 'none'; // Affiché seulement dans les listes
            container.querySelector('.todo-main-content').appendChild(fabBtn);

            function openTaskModal(task = null) {
                // Populate list select
                modalTaskList.innerHTML = '';
                if (state.lists.length === 0) {
                    const option = document.createElement('option');
                    option.value = "";
                    option.textContent = "Aucune liste (Inbox)";
                    modalTaskList.appendChild(option);
                } else {
                    state.lists.forEach(list => {
                        const option = document.createElement('option');
                        option.value = list.id;
                        option.textContent = list.name;
                        modalTaskList.appendChild(option);
                    });
                }

                if (task) {
                    currentEditingTaskId = task.id;
                    modalTitle.textContent = "Modifier la tâche";
                    modalTaskTitle.value = task.text;
                    modalTaskDesc.value = task.description || '';
                    modalTaskDate.value = task.dueDate || '';
                    modalTaskList.value = task.listId || "";
                    modalTaskRecurrence.value = task.recurrence || 'none';
                } else {
                    currentEditingTaskId = null;
                    modalTitle.textContent = "Nouvelle Tâche";
                    modalTaskTitle.value = '';
                    modalTaskDesc.value = '';
                    modalTaskDate.value = '';
                    modalTaskRecurrence.value = 'none';

                    if (state.activeFilter.type === 'list') {
                        modalTaskList.value = state.activeFilter.id;
                    } else {
                        if (modalTaskList.options.length > 0) modalTaskList.selectedIndex = 0;
                    }
                }
                taskModalCanvas.style.display = 'flex';
                modalTaskTitle.focus();
            }

            function closeTaskModal() {
                taskModalCanvas.style.display = 'none';
            }

            modalTaskCancel.addEventListener('click', closeTaskModal);

            modalTaskSave.addEventListener('click', async () => {
                const text = modalTaskTitle.value.trim();
                if (!text) return alert("Le titre est requis");

                const selectedListId = modalTaskList.value;
                const recurrence = modalTaskRecurrence.value;

                if (currentEditingTaskId) {
                    // Édition
                    const taskIndex = state.tasks.findIndex(t => t.id === currentEditingTaskId);
                    if (taskIndex !== -1) {
                        state.tasks[taskIndex].text = text;
                        state.tasks[taskIndex].description = modalTaskDesc.value.trim();
                        state.tasks[taskIndex].dueDate = modalTaskDate.value || null;
                        state.tasks[taskIndex].listId = selectedListId || null;
                        state.tasks[taskIndex].recurrence = recurrence;
                    }
                } else {
                    // Création
                    state.tasks.push({
                        id: `task-${Date.now()}`,
                        listId: selectedListId || null,
                        text: text,
                        completed: false,
                        description: modalTaskDesc.value.trim(),
                        dueDate: modalTaskDate.value || null,
                        recurrence: recurrence
                    });
                }

                await saveState();
                renderUserLists(); // Update counters if new task
                renderTasks();
                if (state.activeFilter.type === 'static' && state.activeFilter.id === 'calendar') {
                    renderCalendar(currentDate);
                }
                closeTaskModal();
            });

            fabBtn.addEventListener('click', () => openTaskModal());


            const renderTasks = () => {
                const { type, id } = state.activeFilter;
                let filteredTasks = [];
                let currentTitle = "";

                calendarView.style.display = 'none';
                taskList.style.display = 'block';
                fabBtn.style.display = 'block';

                if (type === 'list') {
                    const list = state.lists.find(l => l.id === id);
                    if (list) {
                        currentTitle = list.name;
                        filteredTasks = state.tasks.filter(t => t.listId === id); // FIX: Show completed too
                    }
                } else if (type === 'static') {
                    switch (id) {
                        case 'all':
                            currentTitle = "Toutes les tâches";
                            filteredTasks = state.tasks; // FIX: Show all
                            break;
                        case 'completed':
                            currentTitle = "Tâches terminées";
                            filteredTasks = state.tasks.filter(t => t.completed);
                            break;
                        case 'today':
                            currentTitle = "Aujourd'hui";
                            const today = new Date().toISOString().split('T')[0];
                            filteredTasks = state.tasks.filter(t => t.dueDate === today); // FIX: Show completed too
                            break;
                        case 'calendar':
                            currentTitle = "Calendrier";
                            calendarView.style.display = 'block';
                            taskList.style.display = 'none';
                            renderCalendar(currentDate);
                            break;
                        case 'scheduled': // If we want to support the scheduled card
                            // Not implemented in switch yet but card exists
                            // Let's add it if needed or just today/all covers it. 
                            // Wait, I added 4 cards: Today, Calendar, All, Completed. 
                            // "Smart Lists" usually implies these.
                            break;
                    }
                }

                title.textContent = currentTitle;

                // Sort: Active first, then Completed
                filteredTasks.sort((a, b) => {
                    if (!!a.completed === !!b.completed) return 0;
                    return a.completed ? 1 : -1;
                });

                taskList.innerHTML = '';

                if (filteredTasks.length === 0) {
                    taskList.innerHTML = '<div class="empty-state">Aucune tâche présente</div>';
                }

                let separatorAdded = false;

                filteredTasks.forEach(task => {
                    // Inject Separator if we hit the first completed task
                    if (task.completed && !separatorAdded && filteredTasks.some(t => !t.completed)) {
                        const separator = document.createElement('div');
                        separator.className = 'completed-separator';
                        separator.textContent = 'Terminées';
                        taskList.appendChild(separator);
                        separatorAdded = true;
                    }

                    const li = document.createElement('li');
                    li.dataset.taskId = task.id;

                    // Determine List Color
                    let listColor = '#666'; // Default grey
                    if (task.listId) {
                        const l = state.lists.find(x => x.id === task.listId);
                        if (l && l.color) listColor = l.color;
                    }

                    // Recurrence Icon
                    let recurrenceIcon = '';
                    if (task.recurrence && task.recurrence !== 'none') {
                        recurrenceIcon = `<span class="recurrence-icon" title="${task.recurrence}">↻</span>`;
                    }

                    // Date formatting
                    const dateOptions = { month: 'long', day: 'numeric' };
                    if (task.dueDate && new Date(task.dueDate).getFullYear() !== new Date().getFullYear()) dateOptions.year = 'numeric';

                    // Check if overdue (compare dates only, not time)
                    let isOverdue = false;
                    if (task.dueDate && !task.completed) {
                        const dueDate = new Date(task.dueDate);
                        const today = new Date();
                        // Set both to midnight for date-only comparison
                        dueDate.setHours(0, 0, 0, 0);
                        today.setHours(0, 0, 0, 0);
                        isOverdue = dueDate < today;
                    }

                    const dueDateHtml = task.dueDate ?
                        `<span class="task-due-date ${isOverdue ? 'overdue' : ''}">
                            ${new Date(task.dueDate).toLocaleDateString('fr-FR', dateOptions)}
                         </span>` : '';

                    // List Name display (if not in list view)
                    let listNameHtml = '';
                    if (state.activeFilter.type !== 'list' && task.listId) {
                        const l = state.lists.find(x => x.id === task.listId);
                        if (l) listNameHtml = `<span class="task-list-name">${l.name}</span>`;
                    }

                    li.innerHTML = `
                        <input type="checkbox" ${task.completed ? 'checked' : ''} style="border-color: ${listColor};">
                        <style>
                            li[data-task-id="${task.id}"] input[type="checkbox"]:checked {
                                background-color: ${listColor};
                                border-color: transparent !important;
                            }
                        </style>
                        <div class="task-info-container" style="flex:1; cursor:pointer;">
                            <span class="task-text ${task.completed ? 'completed' : ''}">${task.text}</span>
                            <div class="task-metadata">
                                ${listNameHtml}
                                ${dueDateHtml}
                                ${recurrenceIcon}
                            </div>
                            ${task.description ? `<div class="task-desc-preview" style="font-size:0.8em; color:#888;">${task.description.substring(0, 40)}${task.description.length > 40 ? '...' : ''}</div>` : ''}
                        </div>
                        <button class="edit-btn">✎</button>
                        <button class="delete-btn">&times;</button>
                    `;
                    taskList.appendChild(li);
                });
                updateCounters();
            };

            if (addListBtn) {
                addListBtn.addEventListener('click', () => {
                    toggleListModal(true);
                });
            }

            if (listOkBtn) {
                listOkBtn.addEventListener('click', async () => {
                    const name = listNameInput.value.trim();
                    if (name) {
                        // Save with Color
                        state.lists.push({
                            id: `list-${Date.now()}`,
                            name: name,
                            color: selectedListColor || '#007aff'
                        });
                        await saveState();
                        renderUserLists();
                        toggleListModal(false);
                    }
                });
            }

            if (listCancelBtn) {
                listCancelBtn.addEventListener('click', () => {
                    toggleListModal(false);
                });
            }

            if (addListModal) {
                addListModal.addEventListener('click', (e) => {
                    if (e.target === addListModal) {
                        toggleListModal(false);
                    }
                });
            }

            if (listNameInput) {
                listNameInput.addEventListener('keyup', (e) => {
                    if (e.key === 'Enter') {
                        listOkBtn.click();
                    }
                });
            }

            taskList.addEventListener('click', async (e) => {
                const targetLi = e.target.closest('li');
                if (!targetLi) return;
                const taskId = targetLi.dataset.taskId;
                const taskIndex = state.tasks.findIndex(t => t.id === taskId);
                if (taskIndex === -1) return;

                if (e.target.matches('input[type="checkbox"]')) {
                    const task = state.tasks[taskIndex];
                    task.completed = !task.completed;

                    // Handle Recurrence if Completed
                    if (task.completed && task.recurrence && task.recurrence !== 'none' && task.dueDate) {
                        try {
                            const currentDueDate = new Date(task.dueDate);
                            let nextDate = new Date(currentDueDate);

                            switch (task.recurrence) {
                                case 'daily':
                                    nextDate.setDate(currentDueDate.getDate() + 1);
                                    break;
                                case 'weekly':
                                    nextDate.setDate(currentDueDate.getDate() + 7);
                                    break;
                                case 'monthly':
                                    nextDate.setMonth(currentDueDate.getMonth() + 1);
                                    break;
                                case 'yearly':
                                    nextDate.setFullYear(currentDueDate.getFullYear() + 1);
                                    break;
                            }

                            // Create new task
                            state.tasks.push({
                                id: `task-${Date.now()}`,
                                text: task.text,
                                description: task.description,
                                dueDate: nextDate.toISOString().split('T')[0],
                                completed: false,
                                listId: task.listId,
                                recurrence: task.recurrence
                            });
                        } catch (err) {
                            console.error("Error creating recurring task:", err);
                        }
                    }

                    await saveState();
                    renderTasks();
                } else if (e.target.matches('.delete-btn')) {
                    state.tasks.splice(taskIndex, 1);
                    await saveState();
                    renderTasks();
                } else if (e.target.matches('.edit-btn') || e.target.closest('.task-info-container')) {
                    // Click sur edit ou sur le texte -> ouverture modale
                    openTaskModal(state.tasks[taskIndex]);
                }
            });


            userLists.addEventListener('click', (e) => {
                if (e.target.tagName === 'LI') {
                    setActiveFilter(e.target);
                }
            });

            const data = await window.api.getTodos();
            state = { ...state, ...data };
            renderUserLists();

            // Initialize with "Today"
            const defaultFilter = container.querySelector('.smart-list-card[data-filter-id="today"]');
            if (defaultFilter) setActiveFilter(defaultFilter);
        } catch (error) {
            console.error(error);
            alert("Erreur d'initialisation Todo : " + error.message);
        }
    }

    // --- INITIALISATION DE L'APPLICATION ---

    async function initializeApp() {
        // Met en place les écouteurs de la modale
        addServiceBtn.addEventListener('click', () => toggleModal(true));
        cancelBtn.addEventListener('click', () => toggleModal(false));
        okBtn.addEventListener('click', handleSaveService);
        modal.addEventListener('click', (e) => e.target === modal && toggleModal(false));
        nameInput.addEventListener('keyup', (e) => e.key === 'Enter' && okBtn.click());
        urlInput.addEventListener('keyup', (e) => e.key === 'Enter' && okBtn.click());

        // Charge les services et met en place les onglets
        const services = await window.api.getServices();
        renderServiceTabs(services);

        // Show welcome screen on startup instead of auto-loading first service
        welcomeContainer.style.display = 'block';

        serviceList.addEventListener('click', (e) => {
            if (e.target.tagName === 'LI') {
                showService(e.target);
            }
        });
    }

    initializeApp();
});
