window.addEventListener('DOMContentLoaded', () => {

    // --- ÉLÉMENTS DU DOM PRINCIPAUX ---
    const serviceList = document.getElementById('service-list');
    const addServiceBtn = document.getElementById('add-service-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsCloseBtn = document.getElementById('settings-close-btn');

    // Context Menu
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `
        <div class="context-menu-item" id="ctx-edit">Modifier</div>
        <div class="context-menu-item delete" id="ctx-delete">Supprimer</div>
    `;
    document.body.appendChild(contextMenu);

    let contextMenuTargetIndex = -1;

    // Conteneurs de contenu
    const webview = document.getElementById('service-webview');
    const welcomeContainer = document.getElementById('welcome-container');
    const todoAppContainer = document.getElementById('todo-app-container');

    // Éléments de la modale d'ajout de service
    const modal = document.getElementById('add-service-modal');
    const nameInput = document.getElementById('service-name-input');
    const urlInput = document.getElementById('service-url-input');
    const okBtn = document.getElementById('config-ok-btn');
    const cancelBtn = document.getElementById('config-cancel-btn');

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
                    }
                });
                modal.querySelector('h2').textContent = "Modifier le service";
            } else {
                // New Mode
                nameInput.value = '';
                urlInput.value = '';
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
            if (url !== 'internal://todo') new URL(url);
        } catch (_) {
            alert("Veuillez entrer une URL valide (ex: https://example.com)");
            return;
        }

        const services = await window.api.getServices();

        if (editingServiceIndex >= 0) {
            // Update existing
            services[editingServiceIndex] = { name, url };
        } else {
            // Add new
            services.push({ name, url });
        }

        await window.api.saveServices(services);

        renderServiceTabs(services);
        toggleModal(false);
    }


    // --- GESTION DU MENU CONTEXTUEL ---
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    // --- GESTION DES REGLAGES ---
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
    });

    settingsCloseBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
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

        if (serviceUrl === 'internal://todo') {
            todoAppContainer.style.display = 'flex';
            initTodoApp(todoAppContainer);
        } else {
            webview.style.display = 'flex';
            webview.src = serviceUrl;
        }
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
                    const dueDateHtml = task.dueDate ?
                        `<span class="task-due-date ${new Date(task.dueDate) < new Date() && !task.completed ? 'overdue' : ''}">
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

        if (serviceList.firstChild) {
            showService(serviceList.firstChild);
        }

        serviceList.addEventListener('click', (e) => {
            if (e.target.tagName === 'LI') {
                showService(e.target);
            }
        });
    }

    initializeApp();
});
