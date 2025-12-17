window.addEventListener('DOMContentLoaded', () => {

    // --- ÉLÉMENTS DU DOM PRINCIPAUX ---
    const serviceList = document.getElementById('service-list');
    const addServiceBtn = document.getElementById('add-service-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsCloseBtn = document.getElementById('settings-close-btn');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');

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
        <div class="context-menu-item" id="ctx-files-download-selected" style="display:none;">Télécharger la sélection</div>
        <div class="context-menu-item" id="ctx-files-copy">Copier</div>
        <div class="context-menu-item" id="ctx-files-cut">Couper</div>
        <div class="context-menu-item" id="ctx-files-paste" style="display:none;">Coller</div>
        <div class="context-menu-item" id="ctx-files-new-folder">Nouveau dossier</div>
        <div class="context-menu-item" id="ctx-files-rename">Renommer</div>
        <div class="context-menu-item delete" id="ctx-files-delete">Supprimer</div>
        <div class="context-menu-item delete" id="ctx-files-delete-selected" style="display:none;">Supprimer la sélection</div>
    `;
    document.body.appendChild(filesContextMenu);

    let contextMenuTargetIndex = -1;
    let contextMenuTargetFile = null;

    // --- STATE VARIABLES ---
    let filesAppInitialized = false;
    let currentPath = "/";

    // Multi-selection and clipboard state
    let selectedFiles = []; // Array of selected file objects
    let lastSelectedIndex = -1; // For shift+click range selection
    let clipboardFiles = []; // Files in clipboard
    let clipboardOperation = null; // 'copy' or 'cut'
    let clipboardProvider = null; // Source provider for clipboard files

    // Navigation history for back/forward buttons
    let navigationHistory = [];
    let navigationIndex = -1;

    // View mode state
    let currentViewMode = 'list'; // 'grid' or 'list'

    // Search and sort state
    let searchQuery = '';
    let sortBy = 'name'; // 'name', 'type', 'size', 'date'

    // Performance optimizations
    const fileListingCache = new NexusModules.performance.TTLCache(30000); // 30 second cache
    const cleanupTracker = new NexusModules.performance.CleanupTracker();

    let allVisibleFiles = []; // Track all files in current view for selection

    // Drag selection rectangle state
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let selectionBox = null;

    // --- KEYBOARD SHORTCUTS ---
    document.addEventListener('keydown', (e) => {
        // Don't intercept keyboard shortcuts when typing in input or textarea fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Don't intercept keyboard shortcuts when a modal is open
        const isModalOpen = document.querySelector('.modal-overlay[style*="display: flex"], .modal-overlay[style*="display:flex"]');
        if (isModalOpen) {
            return;
        }

        // Only handle keyboard shortcuts when files app is visible
        const filesAppVisible = filesAppContainer.style.display === 'flex';
        if (!filesAppVisible) return;

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

        // Cmd/Ctrl + A: Select all
        if (cmdOrCtrl && e.key === 'a') {
            e.preventDefault();
            selectAll();
        }

        // Cmd/Ctrl + C: Copy
        if (cmdOrCtrl && e.key === 'c') {
            e.preventDefault();
            if (selectedFiles.length > 0) {
                clipboardFiles = selectedFiles;
                clipboardOperation = 'copy';
                clipboardProvider = filesAppContainer.dataset.provider;

                // Remove cut styling from all files
                document.querySelectorAll('.file-item.cut, .file-list-item.cut').forEach(el => el.classList.remove('cut'));

                console.log(`Copied ${clipboardFiles.length} file(s) to clipboard`);
            }
        }

        // Cmd/Ctrl + X: Cut
        if (cmdOrCtrl && e.key === 'x') {
            e.preventDefault();
            if (selectedFiles.length > 0) {
                clipboardFiles = selectedFiles;
                clipboardOperation = 'cut';
                clipboardProvider = filesAppContainer.dataset.provider;

                // Add cut styling to selected files
                document.querySelectorAll('.file-item.cut, .file-list-item.cut').forEach(el => el.classList.remove('cut'));
                selectedFiles.forEach(file => {
                    const fileElements = document.querySelectorAll('.file-item, .file-list-item');
                    fileElements.forEach(el => {
                        const nameEl = el.querySelector('.file-name') || el.querySelector('.file-list-name');
                        if (nameEl && nameEl.textContent === file.basename) {
                            el.classList.add('cut');
                        }
                    });
                });

                console.log(`Cut ${clipboardFiles.length} file(s) to clipboard`);
            }
        }

        // Cmd/Ctrl + V: Paste
        if (cmdOrCtrl && e.key === 'v' && clipboardFiles.length > 0) {
            e.preventDefault();
            filesContextMenu.querySelector('#ctx-files-paste').click();
        }

        // Escape: Clear selection
        if (e.key === 'Escape') {
            clearSelection();
        }
    });

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
    const showRenameModal = (file) => {
        const modal = document.getElementById('files-rename-modal');
        const input = document.getElementById('files-rename-input');
        const oldPathInput = document.getElementById('files-rename-old-path');

        input.value = file.basename;
        oldPathInput.value = file.filename;

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
            const oldPath = document.getElementById('files-rename-old-path').value;

            const newName = input.value.trim();
            const oldBasename = oldPath.split('/').pop(); // approximate basename from path

            modal.style.display = 'none';

            if (newName && newName !== oldBasename) {
                try {
                    // Logic to reconstruct parent path from oldPath
                    // Assuming standard UNIX behavior: path/to/file
                    const lastSlashIndex = oldPath.lastIndexOf('/');
                    let parentPath = lastSlashIndex !== -1 ? oldPath.substring(0, lastSlashIndex) : "";
                    if (parentPath === "" && oldPath.startsWith('/')) parentPath = '/'; // Handle root files

                    const newPath = (parentPath === '/') ? `/${newName}` : `${parentPath}/${newName}`;

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

    // Copy files to clipboard
    filesContextMenu.querySelector('#ctx-files-copy').addEventListener('click', () => {
        const filesToCopy = selectedFiles.length > 0 ? selectedFiles : (contextMenuTargetFile ? [contextMenuTargetFile] : []);
        if (filesToCopy.length > 0) {
            const container = document.getElementById('files-app-container');
            clipboardFiles = filesToCopy;
            clipboardOperation = 'copy';
            clipboardProvider = container.dataset.provider;

            // Remove cut styling from all files
            document.querySelectorAll('.file-item.cut, .file-list-item.cut').forEach(el => el.classList.remove('cut'));

            console.log(`Copied ${clipboardFiles.length} file(s) to clipboard`);
        }
    });

    // Cut files to clipboard
    filesContextMenu.querySelector('#ctx-files-cut').addEventListener('click', () => {
        const filesToCut = selectedFiles.length > 0 ? selectedFiles : (contextMenuTargetFile ? [contextMenuTargetFile] : []);
        if (filesToCut.length > 0) {
            const container = document.getElementById('files-app-container');
            clipboardFiles = filesToCut;
            clipboardOperation = 'cut';
            clipboardProvider = container.dataset.provider;

            // Add cut styling to selected files
            document.querySelectorAll('.file-item.cut, .file-list-item.cut').forEach(el => el.classList.remove('cut'));
            selectedFiles.forEach(file => {
                const fileElements = document.querySelectorAll('.file-item, .file-list-item');
                fileElements.forEach(el => {
                    const nameEl = el.querySelector('.file-name') || el.querySelector('.file-list-name');
                    if (nameEl && nameEl.textContent === file.basename) {
                        el.classList.add('cut');
                    }
                });
            });

            console.log(`Cut ${clipboardFiles.length} file(s) to clipboard`);
        }
    });

    // Paste files from clipboard
    filesContextMenu.querySelector('#ctx-files-paste').addEventListener('click', async () => {
        if (clipboardFiles.length === 0) return;

        const container = document.getElementById('files-app-container');
        const destProvider = container.dataset.provider;
        const grid = document.getElementById('files-grid');

        try {
            grid.innerHTML = '<div class="files-loading">Opération en cours...</div>';

            for (const file of clipboardFiles) {
                const fileName = file.basename;
                let destPath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;

                if (clipboardProvider === destProvider) {
                    // Same provider: use native copy/move
                    if (clipboardOperation === 'copy') {
                        // Copy within same provider
                        await window.api[destProvider].copyFile(file.filename, destPath);
                    } else {
                        // Move (rename) within same provider
                        await window.api[destProvider].rename(file.filename, destPath);
                    }
                } else {
                    // Cross-provider: download and upload
                    const buffer = await window.api[clipboardProvider].downloadFileBuffer(file.filename);
                    await window.api[destProvider].uploadFileBuffer(currentPath, fileName, buffer);

                    // If cut, delete from source
                    if (clipboardOperation === 'cut') {
                        await window.api[clipboardProvider].delete(file.filename);
                    }
                }
            }

            // Clear clipboard if cut operation
            if (clipboardOperation === 'cut') {
                clipboardFiles = [];
                clipboardOperation = null;
                clipboardProvider = null;
            }

            // Clear selection and refresh
            clearSelection();
            loadFiles(currentPath, container, destProvider);
        } catch (e) {
            alert("Erreur lors du collage: " + (e.message || e));
            console.error(e);
            loadFiles(currentPath, container, destProvider);
        }
    });

    // Download selected files
    filesContextMenu.querySelector('#ctx-files-download-selected').addEventListener('click', async () => {
        if (selectedFiles.length === 0) return;

        try {
            const container = document.getElementById('files-app-container');
            const provider = container.dataset.provider;

            for (const file of selectedFiles) {
                if (file.type === 'directory') {
                    if (window.api[provider].downloadDirectory) {
                        await window.api[provider].downloadDirectory(file.filename);
                    }
                } else {
                    await window.api[provider].download(file.filename);
                }
            }
        } catch (e) {
            alert("Erreur lors du téléchargement: " + (e.message || e));
            console.error(e);
        }
    });

    // Delete selected files
    filesContextMenu.querySelector('#ctx-files-delete-selected').addEventListener('click', async () => {
        if (selectedFiles.length === 0) return;

        if (confirm(`Voulez-vous vraiment supprimer ${selectedFiles.length} fichier(s) ?`)) {
            try {
                const container = document.getElementById('files-app-container');
                const provider = container.dataset.provider;

                for (const file of selectedFiles) {
                    const result = await window.api[provider].delete(file.filename);
                    if (result && result.error) throw new Error(result.error);
                }

                // Clear selection and refresh
                clearSelection();
                loadFiles(currentPath, container, provider);
            } catch (e) {
                alert("Erreur lors de la suppression: " + (e.message || e));
            }
        }
    });

    // --- SELECTION HELPER FUNCTIONS ---
    function clearSelection() {
        selectedFiles = [];
        lastSelectedIndex = -1;
        document.querySelectorAll('.file-item.selected, .file-list-item.selected').forEach(el => {
            el.classList.remove('selected');
            el.classList.remove('cut');
        });
    }

    function selectFile(file, fileElement) {
        if (!selectedFiles.find(f => f.filename === file.filename)) {
            selectedFiles.push(file);
            fileElement.classList.add('selected');
        }
    }

    function deselectFile(file, fileElement) {
        selectedFiles = selectedFiles.filter(f => f.filename !== file.filename);
        fileElement.classList.remove('selected');
        fileElement.classList.remove('cut');
    }

    function toggleFileSelection(file, fileElement) {
        if (selectedFiles.find(f => f.filename === file.filename)) {
            deselectFile(file, fileElement);
        } else {
            selectFile(file, fileElement);
        }
    }

    function selectRange(startIndex, endIndex) {
        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);

        const fileElements = document.querySelectorAll('.file-item, .file-list-item');
        for (let i = start; i <= end && i < allVisibleFiles.length; i++) {
            selectFile(allVisibleFiles[i], fileElements[i]);
        }
    }

    function selectAll() {
        const fileElements = document.querySelectorAll('.file-item, .file-list-item');
        allVisibleFiles.forEach((file, index) => {
            selectFile(file, fileElements[index]);
        });
    }

    function updateDragSelection(left, top, width, height) {
        // Determine which view mode we're in
        const grid = document.getElementById('files-grid');
        const listContent = document.getElementById('files-list-content');
        const isGridView = currentViewMode === 'grid';

        const fileElements = document.querySelectorAll(isGridView ? '.file-item' : '.file-list-item');
        const container = isGridView ? grid : listContent;
        const selectionRect = { left, top, right: left + width, bottom: top + height };

        fileElements.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // Calculate element position relative to container
            const elLeft = rect.left - containerRect.left + container.scrollLeft;
            const elTop = rect.top - containerRect.top + container.scrollTop;
            const elRight = elLeft + rect.width;
            const elBottom = elTop + rect.height;

            // Check if rectangles intersect
            const intersects = !(
                elRight < selectionRect.left ||
                elLeft > selectionRect.right ||
                elBottom < selectionRect.top ||
                elTop > selectionRect.bottom
            );

            if (intersects && index < allVisibleFiles.length) {
                selectFile(allVisibleFiles[index], el);
            }
        });
    }

    // Update navigation button states
    function updateNavigationButtons(container) {
        const backBtn = container.querySelector('#files-back-btn');
        const forwardBtn = container.querySelector('#files-forward-btn');
        const upBtn = container.querySelector('#files-up-btn');

        if (backBtn) {
            backBtn.disabled = navigationIndex <= 0;
        }
        if (forwardBtn) {
            forwardBtn.disabled = navigationIndex >= navigationHistory.length - 1;
        }
        if (upBtn) {
            upBtn.disabled = currentPath === '/';
        }
    }

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
                       <div class="nav-buttons">
                           <button id="files-back-btn" title="Précédent (Alt+←)">←</button>
                           <button id="files-forward-btn" title="Suivant (Alt+→)">→</button>
                           <button id="files-up-btn" title="Dossier parent (Alt+↑)">↑</button>
                       </div>
                       <div id="files-breadcrumbs" class="breadcrumbs"></div>
                       <div class="search-container">
                           <input type="text" id="files-search" placeholder="Rechercher..." title="Rechercher des fichiers (Ctrl+F)">
                           <button id="files-search-clear" title="Effacer" style="display:none;">✕</button>
                       </div>
                       <select id="files-sort" title="Trier par">
                           <option value="name">Nom</option>
                           <option value="type">Type</option>
                           <option value="size">Taille</option>
                           <option value="date">Date</option>
                       </select>
                       <div class="action-buttons">
                           <button id="files-refresh-btn" title="Actualiser (F5)">↻</button>
                           <button id="files-home-btn" title="Racine">🏠</button>
                           <button id="files-upload-btn" title="Téléverser un fichier">📄 +</button>
                           <button id="files-upload-folder-btn" title="Téléverser un dossier">📁 +</button>
                           <div class="view-toggle">
                               <button id="files-view-grid" title="Vue grille">▦</button>
                               <button id="files-view-list" class="active" title="Vue liste">☰</button>
                           </div>
                       </div>
                   </div>
                   <div id="files-grid" class="files-grid" style="display:none;"></div>
                   <div id="files-list" class="files-list">
                       <div class="files-list-header">
                           <div></div>
                           <div>Nom</div>
                           <div style="text-align: right;">Taille</div>
                           <div>Date de modification</div>
                       </div>
                       <div id="files-list-content" class="files-list-content"></div>
                   </div>
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

            // Navigation buttons
            container.querySelector('#files-back-btn').addEventListener('click', () => {
                if (navigationIndex > 0) {
                    navigationIndex--;
                    const p = container.dataset.provider;
                    const targetPath = navigationHistory[navigationIndex];
                    loadFiles(targetPath, container, p, false); // false = don't add to history
                }
            });

            container.querySelector('#files-forward-btn').addEventListener('click', () => {
                if (navigationIndex < navigationHistory.length - 1) {
                    navigationIndex++;
                    const p = container.dataset.provider;
                    const targetPath = navigationHistory[navigationIndex];
                    loadFiles(targetPath, container, p, false); // false = don't add to history
                }
            });

            container.querySelector('#files-up-btn').addEventListener('click', () => {
                const p = container.dataset.provider;
                if (currentPath !== '/') {
                    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
                    loadFiles(parentPath, container, p);
                }
            });

            // View toggle buttons
            container.querySelector('#files-view-grid').addEventListener('click', (e) => {
                currentViewMode = 'grid';
                container.querySelector('#files-view-grid').classList.add('active');
                container.querySelector('#files-view-list').classList.remove('active');

                // Show grid, hide list
                container.querySelector('#files-grid').style.display = 'grid';
                container.querySelector('#files-list').style.display = 'none';

                // Reload files in grid view
                const p = container.dataset.provider;
                loadFiles(currentPath, container, p, false);
            });

            container.querySelector('#files-view-list').addEventListener('click', (e) => {
                currentViewMode = 'list';
                container.querySelector('#files-view-list').classList.add('active');
                container.querySelector('#files-view-grid').classList.remove('active');

                // Show list, hide grid
                container.querySelector('#files-grid').style.display = 'none';
                container.querySelector('#files-list').style.display = 'flex';

                // Reload files in list view
                const p = container.dataset.provider;
                loadFiles(currentPath, container, p, false);
            });


            // Search functionality with debouncing
            const searchInput = container.querySelector('#files-search');
            const searchClear = container.querySelector('#files-search-clear');

            // Debounced search handler - wait 300ms after user stops typing
            const debouncedSearch = debounce((value, provider) => {
                searchQuery = value.toLowerCase();
                searchClear.style.display = searchQuery ? 'block' : 'none';
                loadFiles(currentPath, container, provider, false);
            }, 300);

            searchInput.addEventListener('input', (e) => {
                const p = container.dataset.provider;
                debouncedSearch(e.target.value, p);
            });

            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                searchQuery = '';
                searchClear.style.display = 'none';

                const p = container.dataset.provider;
                loadFiles(currentPath, container, p, false);
            });

            // Sort functionality
            const sortSelect = container.querySelector('#files-sort');
            sortSelect.addEventListener('change', (e) => {
                sortBy = e.target.value;

                // Re-render with new sort order
                const p = container.dataset.provider;
                loadFiles(currentPath, container, p, false);
            });

            // Keyboard shortcuts
            container.querySelector('#files-main-view').addEventListener('keydown', (e) => {
                // Don't trigger shortcuts when typing in input fields
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                const modifier = isMac ? e.metaKey : e.altKey;

                // Backspace or Alt+← (Cmd+← on Mac): Back
                if (e.key === 'Backspace' || (modifier && e.key === 'ArrowLeft')) {
                    e.preventDefault();
                    if (navigationIndex > 0) {
                        container.querySelector('#files-back-btn').click();
                    }
                }
                // Alt+→ (Cmd+→ on Mac): Forward
                else if (modifier && e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (navigationIndex < navigationHistory.length - 1) {
                        container.querySelector('#files-forward-btn').click();
                    }
                }
                // Alt+↑ (Cmd+↑ on Mac): Up
                else if (modifier && e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (currentPath !== '/') {
                        container.querySelector('#files-up-btn').click();
                    }
                }
                // F5: Refresh
                else if (e.key === 'F5') {
                    e.preventDefault();
                    container.querySelector('#files-refresh-btn').click();
                }
                // Ctrl+F (Cmd+F on Mac): Focus search
                else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                    e.preventDefault();
                    searchInput.focus();
                    searchInput.select();
                }
            });

            // Make sure the files view can receive keyboard events
            container.querySelector('#files-main-view').setAttribute('tabindex', '0');


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

            // --- DRAG SELECTION RECTANGLE ---
            const filesGrid = container.querySelector('#files-grid');
            const filesListContent = container.querySelector('#files-list-content');
            const filesMainView = container.querySelector('#files-main-view');

            // Setup drag selection for grid view
            filesGrid.addEventListener('mousedown', (e) => {
                // Only start drag selection on empty space (not on file items)
                if (e.target.closest('.file-item')) return;

                // Don't start drag selection if right-clicking
                if (e.button !== 0) return;

                // Clear selection when clicking on empty space
                clearSelection();

                isDragging = true;
                const rect = filesGrid.getBoundingClientRect();
                dragStartX = e.clientX - rect.left + filesGrid.scrollLeft;
                dragStartY = e.clientY - rect.top + filesGrid.scrollTop;

                // Create selection box element
                if (!selectionBox) {
                    selectionBox = document.createElement('div');
                    selectionBox.className = 'selection-rectangle';
                    filesGrid.appendChild(selectionBox);
                }

                selectionBox.style.left = dragStartX + 'px';
                selectionBox.style.top = dragStartY + 'px';
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                selectionBox.style.display = 'block';

                e.preventDefault();
            });

            // Throttled mousemove for drag selection - limit to 60fps
            const throttledDragMove = rafThrottle((e) => {
                if (!isDragging) return;

                const container = currentViewMode === 'grid' ? filesGrid : filesListContent;
                const rect = container.getBoundingClientRect();
                const currentX = e.clientX - rect.left + container.scrollLeft;
                const currentY = e.clientY - rect.top + container.scrollTop;

                const left = Math.min(dragStartX, currentX);
                const top = Math.min(dragStartY, currentY);
                const width = Math.abs(currentX - dragStartX);
                const height = Math.abs(currentY - dragStartY);

                selectionBox.style.left = left + 'px';
                selectionBox.style.top = top + 'px';
                selectionBox.style.width = width + 'px';
                selectionBox.style.height = height + 'px';

                // Update selection based on rectangle intersection
                updateDragSelection(left, top, width, height);
            });

            filesGrid.addEventListener('mousemove', throttledDragMove);
            filesListContent.addEventListener('mousemove', throttledDragMove);

            const endDragSelection = () => {
                if (!isDragging) return;
                isDragging = false;
                if (selectionBox) {
                    selectionBox.style.display = 'none';
                }
            };

            filesGrid.addEventListener('mouseup', endDragSelection);
            filesGrid.addEventListener('mouseleave', endDragSelection);
            filesListContent.addEventListener('mouseup', endDragSelection);
            filesListContent.addEventListener('mouseleave', endDragSelection);

            // Setup drag selection for list view
            filesListContent.addEventListener('mousedown', (e) => {
                // Only start drag selection on empty space (not on file items)
                if (e.target.closest('.file-list-item')) return;

                // Don't start drag selection if right-clicking
                if (e.button !== 0) return;

                // Clear selection when clicking on empty space
                clearSelection();

                isDragging = true;
                const rect = filesListContent.getBoundingClientRect();
                dragStartX = e.clientX - rect.left + filesListContent.scrollLeft;
                dragStartY = e.clientY - rect.top + filesListContent.scrollTop;

                // Create selection box element if it doesn't exist
                if (!selectionBox) {
                    selectionBox = document.createElement('div');
                    selectionBox.className = 'selection-rectangle';
                }

                // Append to list content if not already there
                if (!filesListContent.contains(selectionBox)) {
                    filesListContent.appendChild(selectionBox);
                }

                selectionBox.style.left = dragStartX + 'px';
                selectionBox.style.top = dragStartY + 'px';
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                selectionBox.style.display = 'block';

                e.preventDefault();
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
    const dashboardContainer = document.getElementById('dashboard-container');
    const filesAppContainer = document.getElementById('files-app-container');
    const calendarAppContainer = document.getElementById('calendar-app-container');

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
                if (internalSelect.value === 'internal://dashboard') nameInput.value = "Dashboard";
                else if (internalSelect.value === 'internal://todo') nameInput.value = "ToDo List";
                else if (internalSelect.value === 'internal://calendar') nameInput.value = "Calendrier";
                else if (internalSelect.value === 'internal://files') nameInput.value = "Fichiers WebDAV";
                else if (internalSelect.value === 'internal://gdrive') nameInput.value = "Fichiers GDrive";
                else if (internalSelect.value === 'internal://ai') nameInput.value = "IA";
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

    // --- GESTION REGLAGES GOOGLE CALENDAR ---
    const settingsGcalClientId = document.getElementById('settings-gcal-client-id');
    const settingsGcalClientSecret = document.getElementById('settings-gcal-client-secret');
    const settingsGcalAuthBtn = document.getElementById('settings-gcal-auth-btn');
    const settingsGcalLogoutBtn = document.getElementById('settings-gcal-logout-btn');
    const settingsGcalStatus = document.getElementById('settings-gcal-status');
    const settingsGcalCalendarsTitle = document.getElementById('settings-gcal-calendars-title');
    const settingsGcalCalendarsDesc = document.getElementById('settings-gcal-calendars-desc');
    const settingsGcalCalendarsList = document.getElementById('settings-gcal-calendars-list');

    let availableCalendars = [];
    let selectedCalendarIds = [];

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

        // Load Google Calendar Config
        const gcalConfig = await window.api.gcal.getConfig();
        if (gcalConfig) {
            settingsGcalClientId.value = gcalConfig.clientId || '';
            settingsGcalClientSecret.value = gcalConfig.clientSecret || '';
            selectedCalendarIds = gcalConfig.selectedCalendars || [];

            if (gcalConfig.connected) {
                settingsGcalStatus.textContent = "Connecté à Google Calendar";
                settingsGcalAuthBtn.style.display = 'none';
                settingsGcalLogoutBtn.style.display = 'block';

                // Load and display calendars
                await loadGoogleCalendars();
            } else {
                settingsGcalStatus.textContent = "Non connecté";
                settingsGcalAuthBtn.style.display = 'block';
                settingsGcalLogoutBtn.style.display = 'none';
                settingsGcalCalendarsTitle.style.display = 'none';
                settingsGcalCalendarsDesc.style.display = 'none';
                settingsGcalCalendarsList.style.display = 'none';
            }
        }

        // Load AI Config
        const aiConfig = await window.api.ai.getConfig();
        const aiProviderRadios = document.getElementsByName('ai-provider');
        if (aiConfig && aiConfig.provider) {
            aiProviderRadios.forEach(radio => {
                radio.checked = (radio.value === aiConfig.provider);
            });
            document.getElementById('settings-ai-status').textContent = `Actuellement: ${aiConfig.provider}`;
        } else {
            aiProviderRadios.forEach(radio => radio.checked = false);
            document.getElementById('settings-ai-status').textContent = "Aucun assistant IA configuré";
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

    async function loadGoogleCalendars() {
        try {
            const result = await window.api.gcal.listCalendars();
            if (result.success) {
                availableCalendars = result.calendars;
                renderCalendarsList();
                settingsGcalCalendarsTitle.style.display = 'block';
                settingsGcalCalendarsDesc.style.display = 'block';
                settingsGcalCalendarsList.style.display = 'block';
            }
        } catch (e) {
            console.error("Error loading calendars:", e);
        }
    }

    function renderCalendarsList() {
        settingsGcalCalendarsList.innerHTML = '';

        availableCalendars.forEach(cal => {
            const div = document.createElement('div');
            div.style.cssText = 'padding: 8px; margin: 5px 0; border-radius: 8px; background: var(--background-dark); display: flex; align-items: center; gap: 10px;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `gcal-${cal.id}`;
            checkbox.checked = selectedCalendarIds.includes(cal.id);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (!selectedCalendarIds.includes(cal.id)) {
                        selectedCalendarIds.push(cal.id);
                    }
                } else {
                    selectedCalendarIds = selectedCalendarIds.filter(id => id !== cal.id);
                }
            });

            const label = document.createElement('label');
            label.htmlFor = `gcal-${cal.id}`;
            label.style.cssText = 'flex: 1; cursor: pointer; display: flex; align-items: center; gap: 8px;';

            const colorDot = document.createElement('span');
            colorDot.style.cssText = `width: 12px; height: 12px; border-radius: 50%; background-color: ${cal.backgroundColor || '#4285f4'};`;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = cal.name;
            if (cal.primary) nameSpan.textContent += ' (Principal)';

            label.appendChild(colorDot);
            label.appendChild(nameSpan);

            div.appendChild(checkbox);
            div.appendChild(label);

            settingsGcalCalendarsList.appendChild(div);
        });
    }

    settingsGcalAuthBtn.addEventListener('click', async () => {
        // Save client id/secret first
        const clientId = settingsGcalClientId.value.trim();
        const clientSecret = settingsGcalClientSecret.value.trim();

        await window.api.gcal.saveConfig({ clientId, clientSecret });

        settingsGcalStatus.textContent = "Authentification en cours... Veuillez vérifier votre navigateur.";

        const result = await window.api.gcal.auth();
        if (result.success) {
            settingsGcalStatus.textContent = "Connecté avec succès !";
            settingsGcalAuthBtn.style.display = 'none';
            settingsGcalLogoutBtn.style.display = 'block';

            // Load calendars after successful auth
            await loadGoogleCalendars();
        } else {
            settingsGcalStatus.textContent = "Erreur: " + result.error;
        }
    });

    settingsGcalLogoutBtn.addEventListener('click', async () => {
        await window.api.gcal.disconnect();
        settingsGcalStatus.textContent = "Déconnecté";
        settingsGcalAuthBtn.style.display = 'block';
        settingsGcalLogoutBtn.style.display = 'none';
        settingsGcalCalendarsTitle.style.display = 'none';
        settingsGcalCalendarsDesc.style.display = 'none';
        settingsGcalCalendarsList.style.display = 'none';
        selectedCalendarIds = [];
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

        // Save Google Calendar Config
        const gcalClientId = settingsGcalClientId.value.trim();
        const gcalClientSecret = settingsGcalClientSecret.value.trim();
        await window.api.gcal.saveConfig({
            clientId: gcalClientId,
            clientSecret: gcalClientSecret,
            selectedCalendars: selectedCalendarIds
        });

        // Check if GCal needs auth
        if (gcalClientId && gcalClientSecret) {
            const gcConf = await window.api.gcal.getConfig();
            if (!gcConf.connected) {
                if (confirm("Google Calendar n'est pas encore connecté.\n\nVous devez cliquer sur 'Connexion Google' (Étape 2) pour finaliser l'accès.\n\nVoulez-vous le faire maintenant ?")) {
                    settingsSidebar.querySelectorAll('li').forEach(l => l.classList.remove('active'));
                    const gcalTab = settingsSidebar.querySelector('li[data-section="gcal"]');
                    if (gcalTab) gcalTab.classList.add('active');

                    settingsSections.forEach(s => s.style.display = 'none');
                    document.getElementById('settings-section-gcal').style.display = 'block';
                    return;
                }
            }
        }

        // Save AI Config
        const selectedAiProvider = document.querySelector('input[name="ai-provider"]:checked');
        if (selectedAiProvider) {
            await window.api.ai.saveConfig({
                provider: selectedAiProvider.value
            });
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


    // --- SIDEBAR TOGGLE LOGIC ---

    // Load sidebar state from localStorage
    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarCollapsed) {
        sidebar.classList.add('collapsed');
    }

    // Toggle sidebar on button click
    sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    });

    // Helper function to get icon for service
    function getServiceIcon(serviceUrl, serviceName) {
        // Internal services
        if (serviceUrl === 'internal://dashboard') return '📊';
        if (serviceUrl === 'internal://todo') return '✓';
        if (serviceUrl === 'internal://calendar') return '📅';
        if (serviceUrl === 'internal://files') return '📁';
        if (serviceUrl === 'internal://gdrive') return '☁️';
        if (serviceUrl === 'internal://ai') return '🤖';

        // External services - try to detect by URL or name
        const lowerUrl = serviceUrl.toLowerCase();
        const lowerName = serviceName.toLowerCase();

        if (lowerUrl.includes('nextcloud') || lowerName.includes('nextcloud')) return '☁️';
        if (lowerUrl.includes('drive') || lowerName.includes('drive')) return '💾';
        if (lowerUrl.includes('mail') || lowerName.includes('mail')) return '✉️';
        if (lowerUrl.includes('chat') || lowerName.includes('chat')) return '💬';
        if (lowerUrl.includes('github') || lowerName.includes('github')) return '🐙';
        if (lowerUrl.includes('gitlab') || lowerName.includes('gitlab')) return '🦊';
        if (lowerUrl.includes('notion') || lowerName.includes('notion')) return '📝';
        if (lowerUrl.includes('trello') || lowerName.includes('trello')) return '📋';
        if (lowerUrl.includes('slack') || lowerName.includes('slack')) return '💬';
        if (lowerUrl.includes('discord') || lowerName.includes('discord')) return '🎮';

        // Default icon for external services
        return '🌐';
    }

    // --- GESTION DES SERVICES (ONGLETS PRINCIPAUX) ---

    function renderServiceTabs(services) {
        serviceList.innerHTML = '';
        services.forEach((service, index) => {
            const listItem = document.createElement('li');

            // Get icon for this service
            const icon = getServiceIcon(service.url, service.name);

            // Create icon and text elements
            const iconSpan = document.createElement('span');
            iconSpan.className = 'service-icon';
            iconSpan.textContent = icon;

            const textSpan = document.createElement('span');
            textSpan.className = 'service-text';
            textSpan.textContent = service.name;

            listItem.appendChild(iconSpan);
            listItem.appendChild(textSpan);

            // Add tooltip for collapsed mode
            listItem.dataset.tooltip = service.name;
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

            // Click to show service
            listItem.addEventListener('click', () => {
                showService(listItem);
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

        // Clear webview src when hiding to free memory
        if (webview.style.display !== 'none' && !serviceUrl.startsWith('internal://') && serviceUrl !== 'internal://add-service') {
            // Only clear if we're switching away from an external service
            const currentSrc = webview.src;
            if (currentSrc && currentSrc !== serviceUrl) {
                webview.src = 'about:blank';
            }
        }
        webview.style.display = 'none';

        todoAppContainer.style.display = 'none';
        dashboardContainer.style.display = 'none';
        filesAppContainer.style.display = 'none';
        calendarAppContainer.style.display = 'none';

        if (serviceUrl === 'internal://dashboard') {
            dashboardContainer.style.display = 'flex';
            initDashboard(dashboardContainer);
        } else if (serviceUrl === 'internal://todo') {
            todoAppContainer.style.display = 'flex';
            initTodoApp(todoAppContainer);
        } else if (serviceUrl === 'internal://calendar') {
            calendarAppContainer.style.display = 'flex';
            initCalendarApp(calendarAppContainer);
        } else if (serviceUrl === 'internal://files') {
            filesAppContainer.style.display = 'flex';
            initFilesApp(filesAppContainer, 'webdav');
        } else if (serviceUrl === 'internal://gdrive') {
            filesAppContainer.style.display = 'flex';
            initFilesApp(filesAppContainer, 'gdrive');
        } else if (serviceUrl === 'internal://ai') {
            // Load AI provider
            window.api.ai.getConfig().then(aiConfig => {
                if (aiConfig && aiConfig.configured && aiConfig.url) {
                    webview.src = aiConfig.url;
                    webview.style.display = 'flex';
                } else {
                    // Show configuration prompt
                    welcomeContainer.innerHTML = `
                        <h1>🤖 Assistant IA</h1>
                        <p>Aucun assistant IA n'est configuré.</p>
                        <p>Veuillez configurer votre assistant IA préféré dans les réglages.</p>
                        <button onclick="document.getElementById('settings-btn').click()" style="margin-top: 20px; padding: 10px 20px; background: var(--primary-color); color: white; border: none; border-radius: 8px; cursor: pointer;">Ouvrir les Réglages</button>
                    `;
                    welcomeContainer.style.display = 'block';
                }
            });
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

    async function loadFiles(path, container, providerName, addToHistory = true) {
        if (!providerName) providerName = container.dataset.provider;
        currentPath = path;

        // Manage navigation history
        if (addToHistory) {
            // Remove any forward history when navigating to a new path
            if (navigationIndex < navigationHistory.length - 1) {
                navigationHistory = navigationHistory.slice(0, navigationIndex + 1);
            }
            // Add new path to history
            navigationHistory.push(path);
            navigationIndex = navigationHistory.length - 1;
        }

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

            // Check cache first (only for non-search, non-sort scenarios)
            const cacheKey = `${providerName}:${path}`;
            let items;

            if (!searchQuery && sortBy === 'name' && fileListingCache.has(cacheKey)) {
                // Use cached data
                items = fileListingCache.get(cacheKey);
                console.log('[Performance] Using cached file listing for:', path);
            } else {
                // Fetch from API
                items = await api.ls(path);

                // Cache the result (only if no search/sort active)
                if (!searchQuery && sortBy === 'name') {
                    fileListingCache.set(cacheKey, items);
                }
            }
            const config = await api.getConfig();
            const showHidden = config ? config.showHiddenFiles : false;

            grid.innerHTML = '';

            // Filter
            let filteredItems = items.filter(item => {
                if (!showHidden && item.basename.startsWith('.')) return false;

                // Apply search filter
                if (searchQuery && !item.basename.toLowerCase().includes(searchQuery)) {
                    return false;
                }

                return true;
            });

            if (!filteredItems || filteredItems.length === 0) {
                grid.innerHTML = '<div class="files-loading">Aucun fichier trouvé</div>';
                const listContent = container.querySelector('#files-list-content');
                if (listContent) listContent.innerHTML = '';
                return;
            }

            // Sort based on selected option
            filteredItems.sort((a, b) => {
                switch (sortBy) {
                    case 'type':
                        // Directories first, then by type (extension)
                        if (a.type === 'directory' && b.type !== 'directory') return -1;
                        if (a.type !== 'directory' && b.type === 'directory') return 1;
                        const extA = a.basename.split('.').pop().toLowerCase();
                        const extB = b.basename.split('.').pop().toLowerCase();
                        return extA.localeCompare(extB);

                    case 'size':
                        // Directories first, then by size
                        if (a.type === 'directory' && b.type !== 'directory') return -1;
                        if (a.type !== 'directory' && b.type === 'directory') return 1;
                        return (b.size || 0) - (a.size || 0);

                    case 'date':
                        // Sort by modification date (newest first)
                        const dateA = a.lastmod ? new Date(a.lastmod).getTime() : 0;
                        const dateB = b.lastmod ? new Date(b.lastmod).getTime() : 0;
                        return dateB - dateA;

                    case 'name':
                    default:
                        // Directories first, then alphabetically
                        if (a.type === 'directory' && b.type !== 'directory') return -1;
                        if (a.type !== 'directory' && b.type === 'directory') return 1;
                        return a.basename.localeCompare(b.basename);
                }
            });


            // Helper function to add event listeners to file elements
            function addFileEventListeners(el, item, index, container, providerName) {
                // Click Action with multi-selection support
                el.addEventListener('click', async (e) => {
                    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
                    const shift = e.shiftKey;

                    if (cmdOrCtrl && shift && lastSelectedIndex !== -1) {
                        // Cmd/Ctrl+Shift+Click: Extend selection
                        e.preventDefault();
                        selectRange(lastSelectedIndex, index);
                        lastSelectedIndex = index;
                    } else if (cmdOrCtrl) {
                        // Cmd/Ctrl+Click: Toggle selection
                        e.preventDefault();
                        toggleFileSelection(item, el);
                        lastSelectedIndex = index;
                    } else if (shift && lastSelectedIndex !== -1) {
                        // Shift+Click: Range selection
                        e.preventDefault();
                        clearSelection();
                        selectRange(lastSelectedIndex, index);
                        lastSelectedIndex = index;
                    } else {
                        // Normal click: Clear selection and open
                        clearSelection();
                        lastSelectedIndex = index;

                        if (item.type === 'directory') {
                            loadFiles(item.filename, container, providerName);
                        } else {
                            // Open File
                            const nameEl = el.querySelector('.file-name') || el.querySelector('.file-list-name');
                            const originalText = nameEl.textContent;
                            nameEl.textContent = "Ouverture...";
                            try {
                                const api = window.api[providerName];
                                await api.open(item.filename);
                            } catch (e) {
                                alert("Erreur lors de l'ouverture du fichier");
                            } finally {
                                nameEl.textContent = originalText;
                            }
                        }
                    }
                });

                // Context Menu (Right Click)
                el.addEventListener('contextmenu', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    contextMenuTargetFile = item;

                    // If right-clicking on a non-selected file, select only that file
                    if (!selectedFiles.find(f => f.filename === item.filename)) {
                        clearSelection();
                        selectFile(item, el);
                    }

                    // Update menu visibility based on selection
                    const hasSelection = selectedFiles.length > 0;
                    const hasClipboard = clipboardFiles.length > 0;

                    filesContextMenu.querySelector('#ctx-files-open').style.display = hasSelection && selectedFiles.length === 1 ? 'block' : 'none';
                    filesContextMenu.querySelector('#ctx-files-download').style.display = hasSelection && selectedFiles.length === 1 ? 'block' : 'none';
                    filesContextMenu.querySelector('#ctx-files-download-selected').style.display = hasSelection && selectedFiles.length > 1 ? 'block' : 'none';
                    filesContextMenu.querySelector('#ctx-files-copy').style.display = 'block';
                    filesContextMenu.querySelector('#ctx-files-cut').style.display = 'block';
                    filesContextMenu.querySelector('#ctx-files-paste').style.display = hasClipboard ? 'block' : 'none';
                    filesContextMenu.querySelector('#ctx-files-rename').style.display = hasSelection && selectedFiles.length === 1 ? 'block' : 'none';
                    filesContextMenu.querySelector('#ctx-files-delete').style.display = hasSelection && selectedFiles.length === 1 ? 'block' : 'none';
                    filesContextMenu.querySelector('#ctx-files-delete-selected').style.display = hasSelection && selectedFiles.length > 1 ? 'block' : 'none';
                    filesContextMenu.querySelector('#ctx-files-new-folder').style.display = 'none';

                    filesContextMenu.style.top = `${e.clientY}px`;
                    filesContextMenu.style.left = `${e.clientX}px`;
                    filesContextMenu.style.display = 'block';
                });
            }

            // Clear selection when loading new directory
            clearSelection();
            allVisibleFiles = filteredItems;

            const listContent = container.querySelector('#files-list-content');

            // Render based on current view mode
            if (currentViewMode === 'list') {
                // List View Rendering
                grid.innerHTML = '';
                listContent.innerHTML = '';

                filteredItems.forEach((item, index) => {
                    const el = document.createElement('div');
                    el.className = 'file-list-item';

                    const icon = getFileIcon(item);
                    const formattedDate = item.lastmod ? new Date(item.lastmod).toLocaleString('fr-FR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : '-';

                    el.innerHTML = `
                        <div class="file-list-icon">${icon}</div>
                        <div class="file-list-name">${item.basename}</div>
                        <div class="file-list-size">${formatSize(item.size)}</div>
                        <div class="file-list-date">${formattedDate}</div>
                    `;

                    // Add event listeners (same as grid view)
                    addFileEventListeners(el, item, index, container, providerName);

                    listContent.appendChild(el);
                });
            } else {
                // Grid View Rendering (existing code)
                grid.innerHTML = '';
                listContent.innerHTML = '';

                filteredItems.forEach((item, index) => {
                    const el = document.createElement('div');
                    el.className = 'file-item';

                    const icon = getFileIcon(item);

                    el.innerHTML = `
                        <div class="file-icon">${icon}</div>
                        <div class="file-name">${item.basename}</div>
                        <div class="file-meta">${formatSize(item.size)}</div>
                    `;

                    // Add event listeners
                    addFileEventListeners(el, item, index, container, providerName);

                    grid.appendChild(el);
                });
            }

        } catch (e) {
            console.error(e);
            // Show more detailed error for GDrive configuration issues
            let errorMsg = "Erreur de chargement.";
            if (e.message.includes("API has not been used")) {
                errorMsg = "L'API Google Drive n'est pas activée dans la console Google Cloud.<br><br>Activez-la et réessayez.";
            } else if (e.message.includes("Non configuré")) {
                errorMsg = "Service non configuré.";
            } else {
                errorMsg = e.message || "Erreur inconnue.";
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

        // Update navigation button states
        updateNavigationButtons(container);
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

    // --- DASHBOARD LOGIC ---
    let dashboardInitialized = false;

    async function initDashboard(container) {
        if (!dashboardInitialized) {
            // Get username
            const userName = await window.api.getUserName();

            // Format current date and time in French
            const now = new Date();
            const formattedDateTime = formatDateTime(now);

            container.innerHTML = `
                <div class="dashboard-wrapper">
                    <h1 class="dashboard-title">Bonjour ${userName} !</h1>
                    <p class="dashboard-datetime" id="dashboard-datetime">${formattedDateTime}</p>
                    <div class="dashboard-sections">
                        <div class="dashboard-section" id="dashboard-today">
                            <div class="dashboard-section-header">
                                <h2>📋 Tâches du jour</h2>
                                <span class="dashboard-count" id="dashboard-today-count">0</span>
                            </div>
                            <ul class="dashboard-task-list" id="dashboard-today-list"></ul>
                        </div>
                        <div class="dashboard-section" id="dashboard-overdue">
                            <div class="dashboard-section-header">
                                <h2>⚠️ En retard</h2>
                                <span class="dashboard-count" id="dashboard-overdue-count">0</span>
                            </div>
                            <ul class="dashboard-task-list" id="dashboard-overdue-list"></ul>
                        </div>
                        <div class="dashboard-section" id="dashboard-events">
                            <div class="dashboard-section-header">
                                <h2>📅 Événements du jour</h2>
                                <span class="dashboard-count" id="dashboard-events-count">0</span>
                            </div>
                            <ul class="dashboard-event-list" id="dashboard-events-list"></ul>
                        </div>
                    </div>
                </div>
            `;

            // Update time every minute
            setInterval(() => {
                const dateTimeElement = document.getElementById('dashboard-datetime');
                if (dateTimeElement) {
                    dateTimeElement.textContent = formatDateTime(new Date());
                }
            }, 60000);

            dashboardInitialized = true;
        }

        // Render dashboard content
        await renderDashboard();
    }

    function formatDateTime(date) {
        const day = date.getDate().toString().padStart(2, '0');
        const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
            'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');

        return `Nous sommes le ${day} ${month} ${year}, il est ${hours}:${minutes}.`;
    }

    async function renderDashboard() {
        try {
            const todoData = await window.api.getTodos();
            const tasks = todoData.tasks || [];
            const lists = todoData.lists || [];

            const today = new Date().toISOString().split('T')[0];
            const todayDate = new Date(today);
            todayDate.setHours(0, 0, 0, 0);

            // Filter tasks
            const todayTasks = tasks.filter(t => !t.completed && t.dueDate === today);
            const overdueTasks = tasks.filter(t => {
                if (!t.dueDate || t.completed) return false;
                const dueDate = new Date(t.dueDate);
                dueDate.setHours(0, 0, 0, 0);
                return dueDate < todayDate;
            });

            // Update counts
            document.getElementById('dashboard-today-count').textContent = todayTasks.length;
            document.getElementById('dashboard-overdue-count').textContent = overdueTasks.length;

            // Render today's tasks
            const todayList = document.getElementById('dashboard-today-list');
            todayList.innerHTML = '';
            if (todayTasks.length === 0) {
                todayList.innerHTML = '<div class="empty-state">Aucune tâche pour aujourd\'hui</div>';
            } else {
                todayTasks.forEach(task => {
                    todayList.appendChild(createDashboardTaskElement(task, lists));
                });
            }

            // Render overdue tasks
            const overdueList = document.getElementById('dashboard-overdue-list');
            overdueList.innerHTML = '';
            if (overdueTasks.length === 0) {
                overdueList.innerHTML = '<div class="empty-state">Aucune tâche en retard</div>';
            } else {
                overdueTasks.forEach(task => {
                    overdueList.appendChild(createDashboardTaskElement(task, lists));
                });
            }

            // --- FETCH AND RENDER CALENDAR EVENTS ---
            const allEvents = [];

            // Fetch local calendar events
            try {
                const localCalendarData = await window.api.calendar.getEvents();
                const localEvents = localCalendarData.events || [];

                // Filter today's local events (including multi-day events)
                const todayLocalEvents = localEvents.filter(event => {
                    if (!event.start) return false;

                    const eventStartDate = event.start.split('T')[0];
                    const eventEndDate = event.end ? event.end.split('T')[0] : eventStartDate;

                    // Check if event is all-day
                    const isAllDay = !event.start.includes('T') || event.start.endsWith('T00:00:00');

                    if (isAllDay) {
                        // For all-day events, check if today is within the range
                        // Note: end date is exclusive (day after last day)
                        const start = new Date(eventStartDate + 'T00:00:00');
                        const end = new Date(eventEndDate + 'T00:00:00');
                        const todayDate = new Date(today + 'T00:00:00');

                        return todayDate >= start && todayDate < end;
                    } else {
                        // For timed events, just check the start date
                        return eventStartDate === today;
                    }
                }).map(event => ({
                    ...event,
                    source: 'local'
                }));

                allEvents.push(...todayLocalEvents);
            } catch (error) {
                console.error('Error fetching local calendar events:', error);
            }

            // Fetch Google Calendar events
            try {
                const gcalConfig = await window.api.gcal.getConfig();
                if (gcalConfig && gcalConfig.connected && gcalConfig.selectedCalendars && gcalConfig.selectedCalendars.length > 0) {
                    // Fetch events from a week ago to tomorrow to catch multi-day events
                    const startOfWeek = new Date(today);
                    startOfWeek.setDate(startOfWeek.getDate() - 7);
                    startOfWeek.setHours(0, 0, 0, 0);

                    const endOfTomorrow = new Date(today);
                    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
                    endOfTomorrow.setHours(23, 59, 59, 999);

                    const gcalResult = await window.api.gcal.fetchEvents({
                        timeMin: startOfWeek.toISOString(),
                        timeMax: endOfTomorrow.toISOString(),
                        calendarIds: gcalConfig.selectedCalendars
                    });

                    if (gcalResult.success && gcalResult.events) {
                        // Filter to only include events that span today
                        const todayGoogleEvents = gcalResult.events.filter(event => {
                            if (!event.start) return false;

                            const eventStartDate = event.start.split('T')[0];
                            const eventEndDate = event.end ? event.end.split('T')[0] : eventStartDate;

                            // Check if event is all-day
                            const isAllDay = !event.start.includes('T');

                            if (isAllDay) {
                                // For all-day events, check if today is within the range
                                // Note: end date is exclusive (day after last day)
                                const start = new Date(eventStartDate + 'T00:00:00');
                                const end = new Date(eventEndDate + 'T00:00:00');
                                const todayDate = new Date(today + 'T00:00:00');

                                return todayDate >= start && todayDate < end;
                            } else {
                                // For timed events, check if it's today
                                return eventStartDate === today;
                            }
                        }).map(event => ({
                            ...event,
                            source: 'google'
                        }));

                        allEvents.push(...todayGoogleEvents);
                    }
                }
            } catch (error) {
                console.error('Error fetching Google Calendar events:', error);
            }

            // Sort events by start time
            allEvents.sort((a, b) => {
                const timeA = new Date(a.start).getTime();
                const timeB = new Date(b.start).getTime();
                return timeA - timeB;
            });

            // Update events count
            document.getElementById('dashboard-events-count').textContent = allEvents.length;

            // Render events
            const eventsList = document.getElementById('dashboard-events-list');
            eventsList.innerHTML = '';
            if (allEvents.length === 0) {
                eventsList.innerHTML = '<div class="empty-state">Aucun événement aujourd\'hui</div>';
            } else {
                allEvents.forEach(event => {
                    eventsList.appendChild(createDashboardEventElement(event));
                });
            }

        } catch (error) {
            console.error('Error rendering dashboard:', error);
        }
    }

    function createDashboardTaskElement(task, lists) {
        const li = document.createElement('li');
        li.dataset.taskId = task.id;

        // Determine List Color
        let listColor = '#666';
        if (task.listId) {
            const l = lists.find(x => x.id === task.listId);
            if (l && l.color) listColor = l.color;
        }

        // List Name display
        let listNameHtml = '';
        if (task.listId) {
            const l = lists.find(x => x.id === task.listId);
            if (l) listNameHtml = `<span class="task-list-name">${l.name}</span>`;
        }

        // Date formatting
        const dateOptions = { month: 'long', day: 'numeric' };
        if (task.dueDate && new Date(task.dueDate).getFullYear() !== new Date().getFullYear()) {
            dateOptions.year = 'numeric';
        }

        const dueDateHtml = task.dueDate ?
            `<span class="task-due-date">
                ${new Date(task.dueDate).toLocaleDateString('fr-FR', dateOptions)}
             </span>` : '';

        // Recurrence Icon
        let recurrenceIcon = '';
        if (task.recurrence && task.recurrence !== 'none') {
            recurrenceIcon = `<span class="recurrence-icon" title="${task.recurrence}">↻</span>`;
        }

        li.innerHTML = `
            <input type="checkbox" ${task.completed ? 'checked' : ''} style="border-color: ${listColor};">
            <style>
                li[data-task-id="${task.id}"] input[type="checkbox"]:checked {
                    background-color: ${listColor};
                    border-color: transparent !important;
                }
            </style>
            <div class="task-info-container" style="flex:1;">
                <span class="task-text ${task.completed ? 'completed' : ''}">${task.text}</span>
                <div class="task-metadata">
                    ${listNameHtml}
                    ${dueDateHtml}
                    ${recurrenceIcon}
                </div>
            </div>
        `;

        // Add checkbox event listener
        const checkbox = li.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', async () => {
            task.completed = checkbox.checked;
            const todoData = await window.api.getTodos();
            const taskIndex = todoData.tasks.findIndex(t => t.id === task.id);
            if (taskIndex !== -1) {
                todoData.tasks[taskIndex] = task;
                await window.api.saveTodos(todoData);
                await renderDashboard(); // Refresh dashboard
            }
        });

        return li;
    }

    function createDashboardEventElement(event) {
        const li = document.createElement('li');
        li.className = 'dashboard-event-item';

        // Format time
        const startTime = new Date(event.start);
        const endTime = new Date(event.end);

        const formatTime = (date) => {
            return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        };

        const timeRange = `${formatTime(startTime)} - ${formatTime(endTime)}`;

        // Determine source badge
        let sourceBadge = '';
        let badgeClass = '';
        if (event.source === 'google') {
            sourceBadge = 'Google Calendar';
            badgeClass = 'badge-google';
        } else if (event.source === 'local') {
            sourceBadge = 'Calendrier local';
            badgeClass = 'badge-local';
        }

        // Event title (use title for Google events, or fallback to summary for local)
        const eventTitle = event.title || event.summary || '(Sans titre)';

        li.innerHTML = `
            <div class="event-time-indicator">
                <span class="event-time-icon">🕐</span>
                <span class="event-time">${timeRange}</span>
            </div>
            <div class="event-info-container">
                <span class="event-title">${eventTitle}</span>
                <span class="event-source-badge ${badgeClass}">${sourceBadge}</span>
            </div>
        `;

        return li;
    }

    // --- TODO APP LOGIC ---
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
                    header.classList.add('calendar-weekday-header');
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
        // Get loader element
        const appLoader = document.getElementById('app-loader');

        try {
            // Met en place les écouteurs de la modale
            addServiceBtn.addEventListener('click', () => toggleModal(true));
            cancelBtn.addEventListener('click', () => toggleModal(false));
            okBtn.addEventListener('click', handleSaveService);
            modal.addEventListener('click', (e) => e.target === modal && toggleModal(false));
            nameInput.addEventListener('keyup', (e) => e.key === 'Enter' && okBtn.click());
            urlInput.addEventListener('keyup', (e) => e.key === 'Enter' && okBtn.click());

            // Charge les services et met en place les onglets
            const services = await window.api.getServices();

            // Ensure dashboard is the first service
            const dashboardIndex = services.findIndex(s => s.url === 'internal://dashboard');
            if (dashboardIndex === -1) {
                // Add dashboard as first service if it doesn't exist
                services.unshift({ name: 'Dashboard', url: 'internal://dashboard' });
                await window.api.saveServices(services);
            } else if (dashboardIndex !== 0) {
                // Move dashboard to first position if it exists but isn't first
                const [dashboard] = services.splice(dashboardIndex, 1);
                services.unshift(dashboard);
                await window.api.saveServices(services);
            }

            renderServiceTabs(services);

            // Auto-load dashboard on startup
            const firstService = serviceList.querySelector('li');
            if (firstService) {
                showService(firstService);
            }

            serviceList.addEventListener('click', (e) => {
                if (e.target.tagName === 'LI') {
                    showService(e.target);
                }
            });

            // Hide loader after everything is loaded
            setTimeout(() => {
                appLoader.classList.add('hidden');
            }, 300); // Small delay to ensure smooth rendering

        } catch (error) {
            console.error('Error initializing app:', error);
            // Hide loader even on error
            appLoader.classList.add('hidden');
        }
    }

    // --- CALENDAR APP ---
    async function initCalendarApp(container) {
        if (container.dataset.initialized) {
            return; // Already initialized
        }

        container.innerHTML = `
        <div class="calendar-app">
            <!-- Loading Screen -->
            <div class="calendar-loading-screen" id="calendar-loading-screen" style="display: flex;">
                <div class="spinner"></div>
                <div>Chargement du calendrier...</div>
            </div>

            <!-- Left Sidebar -->
            <div class="calendar-sidebar" style="display: none;" id="calendar-sidebar">
                <button class="calendar-create-btn" id="cal-new-event-btn">
                    + Créer
                </button>

                <!-- Mini Month Calendar -->
                <div class="mini-calendar">
                    <div class="mini-calendar-header">
                        <span class="mini-calendar-month" id="mini-cal-month"></span>
                        <div class="mini-calendar-nav">
                            <button id="mini-cal-prev">‹</button>
                            <button id="mini-cal-next">›</button>
                        </div>
                    </div>
                    <div class="mini-calendar-grid" id="mini-cal-grid">
                        <!-- Mini calendar will be rendered here -->
                    </div>
                </div>

                <!-- Calendar List -->
                <div class="calendar-list">
                    <div class="calendar-list-title">Mes agendas</div>
                    <div class="calendar-list-items" id="calendar-list-items">
                        <!-- Calendar items will be rendered here -->
                    </div>
                </div>
            </div>

            <!-- Main Calendar Area -->
            <div class="calendar-main" style="display: none;" id="calendar-main">
                <!-- Header / Navbar -->
                <div class="calendar-header">
                    <button class="calendar-today-btn" id="cal-today-btn">Aujourd'hui</button>
                    <div class="calendar-nav-btns">
                        <button class="calendar-nav-btn" id="cal-prev-month">‹</button>
                        <button class="calendar-nav-btn" id="cal-next-month">›</button>
                    </div>
                    <div class="calendar-current-month" id="cal-current-month"></div>
                    <button class="calendar-action-btn" id="cal-sync-btn">🔄 Sync</button>
                </div>

                <!-- Calendar Grid -->
                <div class="calendar-view-container">
                    <div class="calendar-month-grid" id="cal-month-grid">
                        <div class="calendar-loading">Chargement...</div>
                    </div>
                </div>
            </div>

            <!-- Day Detail Sidebar -->
            <div class="day-detail-sidebar" id="cal-day-detail">
                <button class="day-detail-close" id="cal-detail-close">×</button>
                <div class="day-detail-header">
                    <div class="day-detail-date" id="cal-detail-date"></div>
                    <div class="day-detail-weekday" id="cal-detail-weekday"></div>
                </div>
                <div class="day-events-list" id="cal-detail-events">
                    <!-- Events will be rendered here -->
                </div>
            </div>
        </div>

            <!-- Event Modal -->
            <div class="event-modal" id="cal-event-modal">
                <div class="event-modal-content">
                    <h2 class="event-modal-header" id="cal-modal-title">Nouvel événement</h2>
                    <div class="event-modal-form">
                        <div class="form-group full-width">
                            <label>Titre</label>
                            <input type="text" id="cal-event-title" placeholder="Titre de l'événement">
                        </div>
                        <div class="form-group">
                            <label>Date de début</label>
                            <input type="date" id="cal-event-date">
                        </div>
                        <div class="form-group" id="cal-event-start-time-group">
                            <label>Heure de début</label>
                            <input type="time" id="cal-event-start-time">
                        </div>
                        <div class="form-group">
                            <label>Date de fin</label>
                            <input type="date" id="cal-event-end-date">
                        </div>
                        <div class="form-group" id="cal-event-end-time-group">
                            <label>Heure de fin</label>
                            <input type="time" id="cal-event-end-time">
                        </div>
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="cal-event-all-day">
                                <span>Journée entière</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label>Destination</label>
                            <select id="cal-event-destination">
                                <option value="local">Calendrier local</option>
                                <option value="google">Google Calendar</option>
                            </select>
                        </div>
                        <div class="form-group" id="cal-event-calendar-selector" style="display:none;">
                            <label>Calendrier Google</label>
                            <select id="cal-event-calendar-id">
                                <!-- Options will be populated dynamically -->
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Récurrence</label>
                            <select id="cal-event-recurrence">
                                <option value="">Aucune</option>
                                <option value="DAILY">Quotidienne</option>
                                <option value="WEEKLY">Hebdomadaire</option>
                                <option value="MONTHLY">Mensuelle</option>
                                <option value="YEARLY">Annuelle</option>
                            </select>
                        </div>
                        <div class="form-group" id="cal-event-recurrence-end-type-group" style="display:none;">
                            <label>Fin de récurrence</label>
                            <select id="cal-event-recurrence-end-type">
                                <option value="never">Jamais</option>
                                <option value="date">À une date</option>
                                <option value="count">Après X occurrences</option>
                            </select>
                        </div>
                        <div class="form-group" id="cal-event-recurrence-end-date-group" style="display:none;">
                            <label>Date de fin</label>
                            <input type="date" id="cal-event-recurrence-end-date">
                        </div>
                        <div class="form-group" id="cal-event-recurrence-end-count-group" style="display:none;">
                            <label>Nombre d'occurrences</label>
                            <input type="number" id="cal-event-recurrence-end-count" value="10" min="1">
                        </div>
                        <div class="form-group full-width">
                            <label>Description</label>
                            <textarea id="cal-event-description" placeholder="Description (optionnel)"></textarea>
                        </div>
                        <div class="modal-actions">
                            <button id="cal-event-delete-btn" class="danger-btn" style="display:none;">Supprimer</button>
                            <button id="cal-event-cancel-btn">Annuler</button>
                            <button id="cal-event-save-btn" class="primary-btn">Enregistrer</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.dataset.initialized = 'true';

        // State
        let currentDate = new Date();
        let miniCalDate = new Date();
        let selectedDate = null;
        let localEvents = [];
        let googleEvents = [];
        let todoTasks = [];
        let editingEvent = null;
        let visibleCalendars = {
            local: true,
            todo: true,
            google: {}  // Will store {calendarId: true/false}
        };

        // Elements
        const loadingScreen = container.querySelector('#calendar-loading-screen');
        const calendarSidebar = container.querySelector('#calendar-sidebar');
        const calendarMain = container.querySelector('#calendar-main');
        const monthGrid = container.querySelector('#cal-month-grid');
        const currentMonthLabel = container.querySelector('#cal-current-month');
        const prevMonthBtn = container.querySelector('#cal-prev-month');
        const nextMonthBtn = container.querySelector('#cal-next-month');
        const todayBtn = container.querySelector('#cal-today-btn');
        const newEventBtn = container.querySelector('#cal-new-event-btn');
        const syncBtn = container.querySelector('#cal-sync-btn');

        // Mini calendar elements
        const miniCalMonth = container.querySelector('#mini-cal-month');
        const miniCalGrid = container.querySelector('#mini-cal-grid');
        const miniCalPrev = container.querySelector('#mini-cal-prev');
        const miniCalNext = container.querySelector('#mini-cal-next');

        // Calendar list elements
        const calendarListItems = container.querySelector('#calendar-list-items');

        // Day detail sidebar elements
        const dayDetail = container.querySelector('#cal-day-detail');
        const dayDetailClose = container.querySelector('#cal-detail-close');

        const eventModal = container.querySelector('#cal-event-modal');
        const modalTitle = container.querySelector('#cal-modal-title');
        const eventTitleInput = container.querySelector('#cal-event-title');
        const eventAllDayCheckbox = container.querySelector('#cal-event-all-day');
        const eventDateInput = container.querySelector('#cal-event-date');
        const eventEndDateInput = container.querySelector('#cal-event-end-date');
        const eventStartTimeInput = container.querySelector('#cal-event-start-time');
        const eventEndTimeInput = container.querySelector('#cal-event-end-time');
        const eventStartTimeGroup = container.querySelector('#cal-event-start-time-group');
        const eventEndTimeGroup = container.querySelector('#cal-event-end-time-group');
        const eventDestinationSelect = container.querySelector('#cal-event-destination');
        const eventCalendarSelector = container.querySelector('#cal-event-calendar-selector');
        const eventCalendarIdSelect = container.querySelector('#cal-event-calendar-id');
        const eventRecurrenceSelect = container.querySelector('#cal-event-recurrence');
        const eventRecurrenceEndTypeGroup = container.querySelector('#cal-event-recurrence-end-type-group');
        const eventRecurrenceEndType = container.querySelector('#cal-event-recurrence-end-type');
        const eventRecurrenceEndDate = container.querySelector('#cal-event-recurrence-end-date');
        const eventRecurrenceEndCount = container.querySelector('#cal-event-recurrence-end-count');
        const eventRecurrenceEndDateGroup = container.querySelector('#cal-event-recurrence-end-date-group');
        const eventRecurrenceEndCountGroup = container.querySelector('#cal-event-recurrence-end-count-group');
        const eventDescriptionInput = container.querySelector('#cal-event-description');
        const eventSaveBtn = container.querySelector('#cal-event-save-btn');
        const eventCancelBtn = container.querySelector('#cal-event-cancel-btn');
        const eventDeleteBtn = container.querySelector('#cal-event-delete-btn');

        // Load data
        async function loadData() {
            try {
                console.log("📂 Loading calendar data...");

                // Show loading
                container.dataset.syncing = 'true';
                renderCalendar();

                // Load local events
                const calData = await window.api.calendar.getEvents();
                localEvents = calData.events || [];
                console.log(`📝 Loaded ${localEvents.length} local events`);

                // Load todo tasks
                const todoData = await window.api.getTodos();
                todoTasks = (todoData.tasks || []).filter(t => t.dueDate && !t.completed);
                console.log(`✅ Loaded ${todoTasks.length} todo tasks`);

                // Load Google Calendar events if configured
                const gcalConfig = await window.api.gcal.getConfig();
                console.log("⚙️ Google Calendar config:", gcalConfig);

                if (gcalConfig.connected) {
                    console.log("🔗 Google Calendar is connected, syncing...");

                    // Initialize visibleCalendars.google from config
                    if (gcalConfig.selectedCalendars && gcalConfig.selectedCalendars.length > 0) {
                        gcalConfig.selectedCalendars.forEach(calId => {
                            visibleCalendars.google[calId] = true;
                        });
                    }

                    await syncGoogleCalendar();

                    // Load available calendars for the selector
                    await loadAvailableCalendars();
                } else {
                    console.log("⚠️ Google Calendar not connected");
                }

                // Hide loading
                container.dataset.syncing = 'false';
            } catch (e) {
                console.error("❌ Error loading calendar data:", e);
                container.dataset.syncing = 'false';
            }
        }

        let availableGoogleCalendars = [];

        async function loadAvailableCalendars() {
            try {
                const result = await window.api.gcal.listCalendars();
                if (result.success) {
                    availableGoogleCalendars = result.calendars;
                }
            } catch (e) {
                console.error("Error loading available calendars:", e);
            }
        }

        async function saveGoogleCalendarSelection() {
            try {
                // Get current config
                const gcalConfig = await window.api.gcal.getConfig();

                // Build list of selected calendar IDs from visibleCalendars.google
                const selectedCalendars = [];
                for (const [calId, isVisible] of Object.entries(visibleCalendars.google)) {
                    if (isVisible) {
                        selectedCalendars.push(calId);
                    }
                }

                // Save updated config
                await window.api.gcal.saveConfig({
                    clientId: gcalConfig.clientId,
                    clientSecret: gcalConfig.clientSecret,
                    selectedCalendars: selectedCalendars
                });

                console.log("💾 Saved calendar selection:", selectedCalendars);
            } catch (e) {
                console.error("Error saving calendar selection:", e);
            }
        }


        async function syncGoogleCalendar() {
            try {
                console.log("🔄 Starting Google Calendar sync...");

                // Get selected calendars from config
                const gcalConfig = await window.api.gcal.getConfig();
                const calendarIds = gcalConfig.selectedCalendars && gcalConfig.selectedCalendars.length > 0
                    ? gcalConfig.selectedCalendars
                    : ['primary'];

                console.log("📅 Syncing calendars:", calendarIds);

                // Get calendar names
                const calendarsListResult = await window.api.gcal.listCalendars();
                const calendarsMap = {};
                if (calendarsListResult.success) {
                    calendarsListResult.calendars.forEach(cal => {
                        calendarsMap[cal.id] = cal.name;
                    });
                }

                const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

                console.log("📅 Date range:", {
                    from: firstDay.toISOString(),
                    to: lastDay.toISOString()
                });

                const result = await window.api.gcal.fetchEvents({
                    timeMin: firstDay.toISOString(),
                    timeMax: lastDay.toISOString(),
                    calendarIds: calendarIds
                });

                console.log("📥 Google Calendar fetch result:", result);

                if (result.success) {
                    // Add calendar names to events
                    googleEvents = (result.events || []).map(event => ({
                        ...event,
                        calendarName: calendarsMap[event.calendarId] || event.calendarId
                    }));
                    console.log(`✅ Loaded ${googleEvents.length} Google Calendar events from ${calendarIds.length} calendar(s)`);
                } else {
                    console.error("❌ Google Calendar fetch failed:", result.error);
                }
            } catch (e) {
                console.error("❌ Error syncing Google Calendar:", e);
            }
        }

        function renderCalendar() {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            currentMonthLabel.textContent = currentDate.toLocaleDateString('fr-FR', {
                month: 'long',
                year: 'numeric'
            });

            monthGrid.innerHTML = '';

            // Show loading if syncing
            if (container.dataset.syncing === 'true') {
                monthGrid.innerHTML = '<div class="calendar-loading"><div class="spinner"></div><div>Synchronisation en cours...</div></div>';
                return;
            }

            // Add weekday headers
            const weekdays = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
            weekdays.forEach(day => {
                const header = document.createElement('div');
                header.className = 'calendar-weekday-header';
                header.textContent = day;
                monthGrid.appendChild(header);
            });

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const daysInMonth = lastDay.getDate();
            const startDay = firstDay.getDay();

            // Add empty cells for days before month starts
            for (let i = 0; i < startDay; i++) {
                const cell = document.createElement('div');
                cell.className = 'calendar-day-cell other-month';
                monthGrid.appendChild(cell);
            }

            // Add days of month
            for (let day = 1; day <= daysInMonth; day++) {
                const cell = document.createElement('div');
                cell.className = 'calendar-day-cell';

                const date = new Date(year, month, day);
                const dateString = formatDate(date);

                // Check if today
                const today = new Date();
                if (date.toDateString() === today.toDateString()) {
                    cell.classList.add('today');
                }

                // Day number
                const dayNumber = document.createElement('div');
                dayNumber.className = 'day-number';
                dayNumber.textContent = day;
                cell.appendChild(dayNumber);

                // Events container
                const eventsContainer = document.createElement('div');
                eventsContainer.className = 'day-events';

                // Get events for this day
                const dayEvents = getAllEventsForDate(dateString);
                const maxVisible = 3;

                dayEvents.slice(0, maxVisible).forEach(event => {
                    const pill = document.createElement('div');
                    pill.className = `event-pill ${event.source}`;

                    // Create time and title elements
                    if (event.time) {
                        const timeSpan = document.createElement('span');
                        timeSpan.className = 'event-pill-time';
                        timeSpan.textContent = event.time;
                        pill.appendChild(timeSpan);
                    }

                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'event-pill-title';
                    titleSpan.textContent = event.title;
                    pill.appendChild(titleSpan);

                    // Apply Google Calendar color if available
                    if (event.source === 'google' && event.colorId) {
                        const color = getGoogleCalendarColor(event.colorId);
                        if (color) {
                            pill.style.background = color;
                        }
                    }

                    pill.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openEventModal(event);
                    });
                    eventsContainer.appendChild(pill);
                });

                if (dayEvents.length > maxVisible) {
                    const more = document.createElement('div');
                    more.className = 'event-more';
                    more.textContent = `+${dayEvents.length - maxVisible} autre(s)`;
                    eventsContainer.appendChild(more);
                }

                cell.appendChild(eventsContainer);

                // Click to show day detail
                cell.addEventListener('click', () => {
                    showDayDetail(date);
                });

                monthGrid.appendChild(cell);
            }
        }

        // Render mini calendar
        function renderMiniCalendar() {
            const year = miniCalDate.getFullYear();
            const month = miniCalDate.getMonth();

            miniCalMonth.textContent = miniCalDate.toLocaleDateString('fr-FR', {
                month: 'long',
                year: 'numeric'
            });

            miniCalGrid.innerHTML = '';

            // Add weekday headers
            const weekdays = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
            weekdays.forEach(day => {
                const header = document.createElement('div');
                header.className = 'mini-calendar-weekday';
                header.textContent = day;
                miniCalGrid.appendChild(header);
            });

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const daysInMonth = lastDay.getDate();
            const startDay = firstDay.getDay();

            // Add empty cells for days before month starts
            for (let i = 0; i < startDay; i++) {
                const cell = document.createElement('div');
                cell.className = 'mini-calendar-day other-month';
                miniCalGrid.appendChild(cell);
            }

            // Add days of month
            const today = new Date();
            for (let day = 1; day <= daysInMonth; day++) {
                const cell = document.createElement('div');
                cell.className = 'mini-calendar-day';
                cell.textContent = day;

                const date = new Date(year, month, day);

                // Check if today
                if (date.toDateString() === today.toDateString()) {
                    cell.classList.add('today');
                }

                // Check if selected (current main calendar date)
                if (date.getMonth() === currentDate.getMonth() &&
                    date.getFullYear() === currentDate.getFullYear() &&
                    date.getDate() === currentDate.getDate()) {
                    cell.classList.add('selected');
                }

                cell.addEventListener('click', () => {
                    const clickedDate = new Date(year, month, day);
                    currentDate = clickedDate;
                    renderCalendar();
                    renderMiniCalendar();
                    showDayDetail(clickedDate);
                });

                miniCalGrid.appendChild(cell);
            }
        }

        // Render calendar list
        function renderCalendarList() {
            calendarListItems.innerHTML = '';

            // Local calendar
            const localItem = createCalendarListItem('local', 'Calendrier local', '#007AFF', visibleCalendars.local);
            calendarListItems.appendChild(localItem);

            // Todo tasks
            const todoItem = createCalendarListItem('todo', 'Tâches', '#FF9500', visibleCalendars.todo);
            calendarListItems.appendChild(todoItem);

            // Google calendars
            if (availableGoogleCalendars && availableGoogleCalendars.length > 0) {
                availableGoogleCalendars.forEach(cal => {
                    const isVisible = visibleCalendars.google[cal.id] !== false; // Default to true
                    const item = createCalendarListItem(`google-${cal.id}`, cal.name, cal.backgroundColor || '#34A853', isVisible, cal.id);
                    calendarListItems.appendChild(item);
                });
            }
        }

        function createCalendarListItem(id, name, color, checked, googleCalId = null) {
            const item = document.createElement('div');
            item.className = 'calendar-list-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = checked;
            checkbox.id = `cal-list-${id}`;

            checkbox.addEventListener('change', async (e) => {
                if (id === 'local') {
                    visibleCalendars.local = e.target.checked;
                } else if (id === 'todo') {
                    visibleCalendars.todo = e.target.checked;
                } else if (googleCalId) {
                    // Disable all checkboxes to prevent spam
                    const allCheckboxes = calendarListItems.querySelectorAll('input[type="checkbox"]');
                    allCheckboxes.forEach(cb => cb.disabled = true);

                    // Show loading state
                    container.dataset.syncing = 'true';
                    renderCalendar();

                    visibleCalendars.google[googleCalId] = e.target.checked;

                    // Save to config
                    await saveGoogleCalendarSelection();

                    // Resync Google Calendar to fetch events from newly selected calendars
                    await syncGoogleCalendar();

                    // Hide loading state
                    container.dataset.syncing = 'false';

                    // Re-enable all checkboxes
                    allCheckboxes.forEach(cb => cb.disabled = false);
                }
                renderCalendar();
            });

            const colorDot = document.createElement('div');
            colorDot.className = 'calendar-list-item-color';
            colorDot.style.backgroundColor = color;

            const nameSpan = document.createElement('div');
            nameSpan.className = 'calendar-list-item-name';
            nameSpan.textContent = name;

            item.appendChild(checkbox);
            item.appendChild(colorDot);
            item.appendChild(nameSpan);

            return item;
        }

        function getAllEventsForDate(dateString) {
            const events = [];
            const targetDate = new Date(dateString + 'T00:00:00');

            // Todo tasks (only if visible)
            if (visibleCalendars.todo) {
                todoTasks.forEach(task => {
                    if (task.dueDate === dateString) {
                        events.push({
                            id: task.id,
                            title: task.text,
                            source: 'todo',
                            time: '',
                            description: '',
                            data: task
                        });
                    }
                });
            }

            // Helper function to check if event spans the target date
            const eventSpansDate = (eventStart, eventEnd, targetDateStr) => {
                const start = new Date(eventStart.includes('T') ? eventStart : eventStart + 'T00:00:00');
                const end = new Date(eventEnd.includes('T') ? eventEnd : eventEnd + 'T00:00:00');
                const target = new Date(targetDateStr + 'T00:00:00');

                // For all-day events, end date is exclusive (day after last day)
                // So we check if target is >= start and < end
                return target >= start && target < end;
            };

            // Local events (only if visible)
            if (visibleCalendars.local) {
                localEvents.forEach(event => {
                    const eventStartDate = event.start.split('T')[0];
                    const eventEndDate = event.end ? event.end.split('T')[0] : eventStartDate;

                    // Check if this event spans the target date
                    if (eventSpansDate(eventStartDate, eventEndDate, dateString) || eventStartDate === dateString) {
                        events.push({
                            ...event,
                            source: 'local',
                            time: formatTime(event.start)
                        });
                    }
                });
            }

            // Google events (only if their calendar is visible)
            googleEvents.forEach(event => {
                // Check if this specific Google calendar is visible
                if (visibleCalendars.google[event.calendarId] !== false) {
                    const eventStartDate = event.start.split('T')[0];
                    const eventEndDate = event.end ? event.end.split('T')[0] : eventStartDate;

                    // Check if this event spans the target date
                    if (eventSpansDate(eventStartDate, eventEndDate, dateString) || eventStartDate === dateString) {
                        events.push({
                            ...event,
                            source: 'google',
                            time: formatTime(event.start)
                        });
                    }
                }
            });

            if (events.length > 0) {
                console.log(`📆 Events for ${dateString}:`, events);
            }

            // Sort by time
            return events.sort((a, b) => {
                if (!a.time) return 1;
                if (!b.time) return -1;
                return a.time.localeCompare(b.time);
            });
        }

        function showDayDetail(date) {
            selectedDate = date;
            const dateString = formatDate(date);
            const events = getAllEventsForDate(dateString);

            container.querySelector('#cal-detail-date').textContent =
                date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
            container.querySelector('#cal-detail-weekday').textContent =
                date.toLocaleDateString('fr-FR', { weekday: 'long' });

            const eventsList = container.querySelector('#cal-detail-events');
            eventsList.innerHTML = '';

            if (events.length === 0) {
                eventsList.innerHTML = '<div class="no-events">Aucun événement ce jour</div>';
            } else {
                events.forEach(event => {
                    const card = document.createElement('div');
                    card.className = `event-card ${event.source}`;

                    const calendarName = event.calendarName || '';

                    card.innerHTML = `
                        <div class="event-card-title">${event.title}</div>
                        ${event.time ? `<div class="event-card-time">${event.time}</div>` : ''}
                        ${event.description ? `<div class="event-card-description">${event.description}</div>` : ''}
                        <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                            <span class="event-card-source ${event.source}">
                                ${event.source === 'todo' ? 'Tâche' : event.source === 'local' ? 'Local' : 'Google'}
                            </span>
                            ${calendarName ? `<span class="event-card-calendar">${calendarName}</span>` : ''}
                        </div>
                    `;

                    if (event.source !== 'todo') {
                        card.addEventListener('click', () => openEventModal(event));
                    }

                    eventsList.appendChild(card);
                });
            }

            dayDetail.classList.add('visible');
        }

        async function openEventModal(event = null) {
            editingEvent = event;

            if (event) {
                modalTitle.textContent = 'Modifier l\'événement';
                eventTitleInput.value = event.title;

                // Check if event is all-day (no time component in start/end)
                const isAllDay = !event.start.includes('T') || event.start.endsWith('T00:00:00');
                eventAllDayCheckbox.checked = isAllDay;

                // Set dates
                eventDateInput.value = event.start.split('T')[0];
                if (event.end) {
                    let endDate = event.end.split('T')[0];
                    // For all-day events, Google Calendar uses exclusive end date (day after last day)
                    // So we need to subtract 1 day to show the actual last day
                    if (isAllDay) {
                        const endDateObj = new Date(endDate);
                        endDateObj.setDate(endDateObj.getDate() - 1);
                        endDate = formatDate(endDateObj);
                    }
                    eventEndDateInput.value = endDate;
                } else {
                    eventEndDateInput.value = event.start.split('T')[0];
                }

                // Set times
                if (!isAllDay) {
                    eventStartTimeInput.value = formatTime(event.start) || '09:00';
                    eventEndTimeInput.value = formatTime(event.end) || '10:00';
                    eventStartTimeGroup.style.display = 'block';
                    eventEndTimeGroup.style.display = 'block';
                } else {
                    eventStartTimeGroup.style.display = 'none';
                    eventEndTimeGroup.style.display = 'none';
                }

                eventDescriptionInput.value = event.description || '';
                eventDestinationSelect.value = event.source;
                eventDestinationSelect.disabled = true;
                eventDeleteBtn.style.display = 'block';

                // Populate recurrence fields if event has recurrence
                console.log('🔍 Event object:', event);
                console.log('🔍 Event recurrence:', event.recurrence);

                if (event.recurrence && event.recurrence.length > 0) {
                    const rrule = event.recurrence[0]; // RRULE:FREQ=WEEKLY;UNTIL=...
                    console.log('🔍 RRULE:', rrule);

                    // Extract frequency
                    const freqMatch = rrule.match(/FREQ=(\w+)/);
                    if (freqMatch) {
                        eventRecurrenceSelect.value = freqMatch[1];
                        eventRecurrenceEndTypeGroup.style.display = 'block';
                    }

                    // Extract UNTIL date
                    const untilMatch = rrule.match(/UNTIL=(\d{8}T\d{6}Z)/);
                    if (untilMatch) {
                        eventRecurrenceEndType.value = 'date';
                        // Parse UNTIL format: 20251231T235959Z
                        const untilStr = untilMatch[1];
                        const year = untilStr.substring(0, 4);
                        const month = untilStr.substring(4, 6);
                        const day = untilStr.substring(6, 8);
                        eventRecurrenceEndDate.value = `${year}-${month}-${day}`;
                        eventRecurrenceEndDateGroup.style.display = 'block';
                        eventRecurrenceEndCountGroup.style.display = 'none';
                    }
                    // Extract COUNT
                    else {
                        const countMatch = rrule.match(/COUNT=(\d+)/);
                        if (countMatch) {
                            eventRecurrenceEndType.value = 'count';
                            eventRecurrenceEndCount.value = countMatch[1];
                            eventRecurrenceEndDateGroup.style.display = 'none';
                            eventRecurrenceEndCountGroup.style.display = 'block';
                        } else {
                            eventRecurrenceEndType.value = 'never';
                            eventRecurrenceEndDateGroup.style.display = 'none';
                            eventRecurrenceEndCountGroup.style.display = 'none';
                        }
                    }
                } else {
                    // No recurrence
                    eventRecurrenceSelect.value = '';
                    eventRecurrenceEndTypeGroup.style.display = 'none';
                    eventRecurrenceEndType.value = 'never';
                }

                // Show calendar selector for Google events and select the correct calendar
                if (event.source === 'google') {
                    await populateCalendarSelector();
                    eventCalendarSelector.style.display = 'block';
                    // Select the calendar that this event belongs to
                    if (event.calendarId) {
                        eventCalendarIdSelect.value = event.calendarId;
                    }
                    // Disable calendar selector when editing to prevent changing calendar
                    eventCalendarIdSelect.disabled = true;
                } else {
                    eventCalendarSelector.style.display = 'none';
                }
            } else {
                modalTitle.textContent = 'Nouvel événement';
                eventTitleInput.value = '';

                // Set default dates
                const defaultDate = selectedDate ? formatDate(selectedDate) : formatDate(new Date());
                eventDateInput.value = defaultDate;
                eventEndDateInput.value = defaultDate;

                // Set default times
                eventStartTimeInput.value = '09:00';
                eventEndTimeInput.value = '10:00';

                // Default to non-all-day
                eventAllDayCheckbox.checked = false;
                eventStartTimeGroup.style.display = 'block';
                eventEndTimeGroup.style.display = 'block';

                eventDestinationSelect.value = 'local';
                eventDestinationSelect.disabled = false;
                eventDescriptionInput.value = '';
                eventRecurrenceSelect.value = '';
                eventRecurrenceEndTypeGroup.style.display = 'none';
                eventDeleteBtn.style.display = 'none';

                // Populate calendar selector and hide by default
                await populateCalendarSelector();
                // Select primary calendar by default for new events
                const primaryCalendar = availableGoogleCalendars.find(cal => cal.primary);
                if (primaryCalendar) {
                    eventCalendarIdSelect.value = primaryCalendar.id;
                }
                eventCalendarIdSelect.disabled = false; // Enable calendar selector for new events
                eventCalendarSelector.style.display = 'none';
            }

            // Trigger destination change event to update calendar selector visibility
            const changeEvent = new Event('change');
            eventDestinationSelect.dispatchEvent(changeEvent);

            eventModal.classList.add('visible');
        }

        async function populateCalendarSelector() {
            // Load calendars if not already loaded
            if (availableGoogleCalendars.length === 0) {
                await loadAvailableCalendars();
            }

            eventCalendarIdSelect.innerHTML = '';

            if (availableGoogleCalendars.length === 0) {
                // If no calendars loaded, add a default option
                const option = document.createElement('option');
                option.value = 'primary';
                option.textContent = 'Calendrier principal';
                eventCalendarIdSelect.appendChild(option);
            } else {
                availableGoogleCalendars.forEach(cal => {
                    const option = document.createElement('option');
                    option.value = cal.id;
                    option.textContent = cal.name;
                    if (cal.primary) {
                        option.textContent += ' (Principal)';
                    }
                    eventCalendarIdSelect.appendChild(option);
                });
            }
        }

        async function saveEvent() {
            const title = eventTitleInput.value.trim();
            if (!title) {
                alert('Le titre est requis');
                return;
            }

            const startDate = eventDateInput.value;
            const endDate = eventEndDateInput.value;
            const startTime = eventStartTimeInput.value;
            const endTime = eventEndTimeInput.value;
            const isAllDay = eventAllDayCheckbox.checked;
            const destination = eventDestinationSelect.value;
            const description = eventDescriptionInput.value.trim();
            const calendarId = eventCalendarIdSelect.value;
            const recurrence = eventRecurrenceSelect.value;

            // Validate dates
            if (!startDate || !endDate) {
                alert('Les dates de début et de fin sont requises');
                return;
            }

            if (new Date(endDate) < new Date(startDate)) {
                alert('La date de fin doit être après la date de début');
                return;
            }

            let eventData = {
                title,
                description,
                isAllDay
            };

            // Build start and end date/time based on all-day flag
            if (isAllDay) {
                // For all-day events, use date format only
                eventData.start = startDate;
                // For multi-day all-day events, end date should be the day AFTER the last day
                const endDateObj = new Date(endDate);
                endDateObj.setDate(endDateObj.getDate() + 1);
                eventData.end = formatDate(endDateObj);
            } else {
                // For timed events, include time
                if (!startTime || !endTime) {
                    alert('Les heures de début et de fin sont requises pour les événements non journée entière');
                    return;
                }

                eventData.start = `${startDate}T${startTime}:00`;
                eventData.end = `${endDate}T${endTime}:00`;

                // Validate that end time is after start time
                if (new Date(eventData.end) <= new Date(eventData.start)) {
                    alert('L\'heure de fin doit être après l\'heure de début');
                    return;
                }
            }

            // Build recurrence rule if specified
            if (recurrence) {
                let rrule = `FREQ=${recurrence}`;

                const endType = eventRecurrenceEndType.value;
                if (endType === 'date' && eventRecurrenceEndDate.value) {
                    // Format: UNTIL=20251231T235959Z
                    const untilDate = new Date(eventRecurrenceEndDate.value + 'T23:59:59');
                    rrule += `;UNTIL=${untilDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
                } else if (endType === 'count' && eventRecurrenceEndCount.value) {
                    rrule += `;COUNT=${eventRecurrenceEndCount.value}`;
                }

                eventData.recurrence = [rrule];
            }

            // Disable save button and show loading state
            const originalText = eventSaveBtn.textContent;
            eventSaveBtn.disabled = true;
            eventSaveBtn.textContent = 'Enregistrement...';
            eventSaveBtn.style.opacity = '0.6';
            eventSaveBtn.style.cursor = 'not-allowed';

            try {
                if (editingEvent && editingEvent.source === 'google') {
                    // Update Google event
                    await window.api.gcal.updateEvent({
                        eventId: editingEvent.id,
                        calendarId: editingEvent.calendarId,
                        eventData
                    });
                } else if (editingEvent && editingEvent.source === 'local') {
                    // Update local event
                    const index = localEvents.findIndex(e => e.id === editingEvent.id);
                    if (index !== -1) {
                        localEvents[index] = { ...eventData, id: editingEvent.id };
                        await window.api.calendar.saveEvents({ events: localEvents });
                    }
                } else {
                    // Create new event
                    if (destination === 'google') {
                        await window.api.gcal.createEvent({ ...eventData, calendarId });
                    } else {
                        const newEvent = {
                            ...eventData,
                            id: 'local-' + Date.now()
                        };
                        localEvents.push(newEvent);
                        await window.api.calendar.saveEvents({ events: localEvents });
                    }
                }

                eventModal.classList.remove('visible');
                await loadData();
                renderCalendar();
                if (selectedDate) showDayDetail(selectedDate);
            } catch (e) {
                alert('Erreur lors de la sauvegarde: ' + e.message);
                console.error(e);
            } finally {
                // Re-enable button and restore original state
                eventSaveBtn.disabled = false;
                eventSaveBtn.textContent = originalText;
                eventSaveBtn.style.opacity = '';
                eventSaveBtn.style.cursor = '';
            }
        }

        async function deleteEvent() {
            if (!editingEvent) return;

            if (!confirm('Voulez-vous vraiment supprimer cet événement ?')) return;

            try {
                if (editingEvent.source === 'google') {
                    await window.api.gcal.deleteEvent({
                        eventId: editingEvent.id,
                        calendarId: editingEvent.calendarId
                    });
                } else if (editingEvent.source === 'local') {
                    localEvents = localEvents.filter(e => e.id !== editingEvent.id);
                    await window.api.calendar.saveEvents({ events: localEvents });
                }

                eventModal.classList.remove('visible');
                await loadData();
                renderCalendar();
                if (selectedDate) showDayDetail(selectedDate);
            } catch (e) {
                alert('Erreur lors de la suppression: ' + e.message);
                console.error(e);
            }
        }

        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function formatTime(dateTimeString) {
            if (!dateTimeString) return '';
            if (!dateTimeString.includes('T')) return '';
            return dateTimeString.split('T')[1].substring(0, 5);
        }

        // Google Calendar color mapping
        function getGoogleCalendarColor(colorId) {
            const colors = {
                '1': '#a4bdfc', // Lavender
                '2': '#7ae7bf', // Sage
                '3': '#dbadff', // Grape
                '4': '#ff887c', // Flamingo
                '5': '#fbd75b', // Banana
                '6': '#ffb878', // Tangerine
                '7': '#46d6db', // Peacock
                '8': '#e1e1e1', // Graphite
                '9': '#5484ed', // Blueberry
                '10': '#51b749', // Basil
                '11': '#dc2127'  // Tomato
            };
            return colors[colorId] || null;
        }

        // Event listeners
        prevMonthBtn.addEventListener('click', async () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            miniCalDate = new Date(currentDate);
            await loadData();
            renderCalendar();
            renderMiniCalendar();
        });

        nextMonthBtn.addEventListener('click', async () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            miniCalDate = new Date(currentDate);
            await loadData();
            renderCalendar();
            renderMiniCalendar();
        });

        todayBtn.addEventListener('click', async () => {
            currentDate = new Date();
            miniCalDate = new Date();
            await loadData();
            renderCalendar();
            renderMiniCalendar();
        });

        // Mini calendar navigation
        miniCalPrev.addEventListener('click', () => {
            miniCalDate.setMonth(miniCalDate.getMonth() - 1);
            renderMiniCalendar();
        });

        miniCalNext.addEventListener('click', () => {
            miniCalDate.setMonth(miniCalDate.getMonth() + 1);
            renderMiniCalendar();
        });

        newEventBtn.addEventListener('click', () => openEventModal());

        syncBtn.addEventListener('click', async () => {
            syncBtn.textContent = '🔄 Sync...';
            syncBtn.disabled = true;
            try {
                await loadData();
                renderCalendar();
                renderMiniCalendar();
                renderCalendarList();
            } catch (e) {
                console.error("Error during sync:", e);
                alert("Erreur lors de la synchronisation: " + e.message);
            }
            syncBtn.textContent = '🔄 Sync';
            syncBtn.disabled = false;
        });

        // Close day detail sidebar
        dayDetailClose.addEventListener('click', () => {
            dayDetail.classList.remove('visible');
            selectedDate = null;
        });

        eventCancelBtn.addEventListener('click', () => {
            eventModal.classList.remove('visible');
        });

        // All-day checkbox listener
        eventAllDayCheckbox.addEventListener('change', () => {
            const isAllDay = eventAllDayCheckbox.checked;
            eventStartTimeGroup.style.display = isAllDay ? 'none' : 'block';
            eventEndTimeGroup.style.display = isAllDay ? 'none' : 'block';

            // Set default times if switching to non-all-day
            if (!isAllDay && !eventStartTimeInput.value) {
                eventStartTimeInput.value = '09:00';
            }
            if (!isAllDay && !eventEndTimeInput.value) {
                eventEndTimeInput.value = '10:00';
            }
        });

        eventDestinationSelect.addEventListener('change', async () => {
            if (eventDestinationSelect.value === 'google') {
                await populateCalendarSelector(); // Reload calendar list when switching to Google
                eventCalendarSelector.style.display = 'block';
            } else {
                eventCalendarSelector.style.display = 'none';
            }
        });

        eventRecurrenceSelect.addEventListener('change', () => {
            if (eventRecurrenceSelect.value) {
                eventRecurrenceEndTypeGroup.style.display = 'block';
            } else {
                eventRecurrenceEndTypeGroup.style.display = 'none';
            }
        });

        eventRecurrenceEndType.addEventListener('change', () => {
            eventRecurrenceEndDateGroup.style.display = 'none';
            eventRecurrenceEndCountGroup.style.display = 'none';

            if (eventRecurrenceEndType.value === 'date') {
                eventRecurrenceEndDateGroup.style.display = 'block';
            } else if (eventRecurrenceEndType.value === 'count') {
                eventRecurrenceEndCountGroup.style.display = 'block';
            }
        });

        eventSaveBtn.addEventListener('click', saveEvent);
        eventDeleteBtn.addEventListener('click', deleteEvent);

        // Click outside modal to close
        eventModal.addEventListener('click', (e) => {
            if (e.target === eventModal) {
                eventModal.classList.remove('visible');
            }
        });

        // Initialize
        await loadData();
        renderCalendar();
        renderMiniCalendar();
        renderCalendarList();

        // Hide loading screen and show calendar
        loadingScreen.style.display = 'none';
        calendarSidebar.style.display = 'flex';
        calendarMain.style.display = 'flex';
    }

    initializeApp();
});
