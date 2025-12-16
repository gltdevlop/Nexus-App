/**
 * Service Tabs Management
 * Handles rendering, navigation, and management of service tabs
 */

(function () {
    'use strict';

    // Create namespace if it doesn't exist
    window.NexusModules = window.NexusModules || {};

    let contextMenuTargetIndex = -1;
    let editingServiceIndex = -1;

    /**
     * Initialize service management
     * @param {Object} elements - DOM elements needed for service management
     */
    function initServiceManagement(elements) {
        const { serviceList, addServiceBtn, modal, nameInput, urlInput, okBtn, cancelBtn, internalSelect, contextMenu } = elements;

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

        // Modal handlers
        addServiceBtn.addEventListener('click', () => toggleModal(true, elements));
        cancelBtn.addEventListener('click', () => toggleModal(false, elements));
        okBtn.addEventListener('click', () => handleSaveService(elements));
        modal.addEventListener('click', (e) => e.target === modal && toggleModal(false, elements));
        nameInput.addEventListener('keyup', (e) => e.key === 'Enter' && okBtn.click());
        urlInput.addEventListener('keyup', (e) => e.key === 'Enter' && okBtn.click());

        // Context menu handlers
        document.getElementById('ctx-edit').addEventListener('click', () => {
            if (contextMenuTargetIndex >= 0) {
                toggleModal(true, elements, contextMenuTargetIndex);
            }
        });

        document.getElementById('ctx-delete').addEventListener('click', async () => {
            if (contextMenuTargetIndex >= 0) {
                if (confirm("Voulez-vous vraiment supprimer ce service ?")) {
                    const services = await window.api.getServices();
                    services.splice(contextMenuTargetIndex, 1);
                    await window.api.saveServices(services);
                    renderServiceTabs(services, elements);

                    // If we deleted the active one, show welcome
                    const { welcomeContainer, webview, todoAppContainer, filesAppContainer } = elements;
                    welcomeContainer.style.display = 'block';
                    webview.style.display = 'none';
                    todoAppContainer.style.display = 'none';
                    filesAppContainer.style.display = 'none';
                }
            }
        });
    }

    function toggleModal(show, elements, editIndex = -1) {
        const { modal, nameInput, urlInput, internalSelect } = elements;

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

    async function handleSaveService(elements) {
        const { nameInput, urlInput } = elements;
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

        renderServiceTabs(services, elements);
        toggleModal(false, elements);
    }

    /**
     * Render service tabs in the sidebar
     * @param {Array} services - Array of service objects
     * @param {Object} elements - DOM elements
     */
    function renderServiceTabs(services, elements) {
        const { serviceList, contextMenu } = elements;
        serviceList.innerHTML = '';

        services.forEach((service, index) => {
            const listItem = document.createElement('li');

            // Get icon for this service
            const icon = window.getServiceIcon(service.url, service.name);

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
                renderServiceTabs(newServices, elements);
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
                showService(listItem, elements);
            });

            serviceList.appendChild(listItem);
        });
    }

    /**
     * Show a service by switching to its view
     * @param {HTMLElement} liElement - Service list item element
     * @param {Object} elements - DOM elements
     */
    function showService(liElement, elements) {
        const { serviceList, welcomeContainer, webview, todoAppContainer, dashboardContainer, filesAppContainer, calendarAppContainer, addServiceBtn } = elements;

        // Gère l'état 'active' sur les onglets
        serviceList.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
        liElement.classList.add('active');

        const serviceUrl = liElement.dataset.url;

        // Cache tous les conteneurs
        welcomeContainer.style.display = 'none';
        webview.style.display = 'none';
        todoAppContainer.style.display = 'none';
        dashboardContainer.style.display = 'none';
        filesAppContainer.style.display = 'none';
        calendarAppContainer.style.display = 'none';

        if (serviceUrl === 'internal://dashboard') {
            dashboardContainer.style.display = 'flex';
            // initDashboard will be called from main
            if (window.initDashboard) window.initDashboard(dashboardContainer);
        } else if (serviceUrl === 'internal://todo') {
            todoAppContainer.style.display = 'flex';
            if (window.initTodoApp) window.initTodoApp(todoAppContainer);
        } else if (serviceUrl === 'internal://calendar') {
            calendarAppContainer.style.display = 'flex';
            if (window.initCalendarApp) window.initCalendarApp(calendarAppContainer);
        } else if (serviceUrl === 'internal://files') {
            filesAppContainer.style.display = 'flex';
            if (window.initFilesApp) window.initFilesApp(filesAppContainer, 'webdav');
        } else if (serviceUrl === 'internal://gdrive') {
            filesAppContainer.style.display = 'flex';
            if (window.initFilesApp) window.initFilesApp(filesAppContainer, 'gdrive');
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

    // Export to namespace
    window.NexusModules.services = {
        initServiceManagement,
        renderServiceTabs,
        showService
    };

    // Also export to window for backward compatibility
    window.initServiceManagement = initServiceManagement;
    window.renderServiceTabs = renderServiceTabs;
    window.showService = showService;

})();
