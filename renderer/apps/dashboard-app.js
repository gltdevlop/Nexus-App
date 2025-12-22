/**
 * Dashboard App Module
 * Displays today's tasks and calendar events
 */

(function () {
    'use strict';

    // Create namespace if it doesn't exist
    window.NexusModules = window.NexusModules || {};

    let dashboardInitialized = false;

    /**
     * Initialize the dashboard app
     * @param {HTMLElement} container - Dashboard container element
     */
    async function initDashboard(container) {
        if (!dashboardInitialized) {
            // Get username
            const userName = await window.api.getUserName();

            // Format current date and time in French
            const now = new Date();
            const formattedDateTime = window.formatDateTime(now);

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
                    dateTimeElement.textContent = window.formatDateTime(new Date());
                }
            }, 60000);

            dashboardInitialized = true;
        }

        // Render dashboard content
        await renderDashboard();
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

        // Check if event is all-day
        const isAllDay = !event.start.includes('T') || event.start.endsWith('T00:00:00');

        // Format time
        let timeRange;
        if (isAllDay) {
            timeRange = 'Journée entière';
        } else {
            const startTime = new Date(event.start);
            const endTime = new Date(event.end);

            const formatTime = (date) => {
                return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            };

            timeRange = `${formatTime(startTime)} - ${formatTime(endTime)}`;
        }

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

    // Export to namespace
    window.NexusModules.dashboardApp = {
        initDashboard
    };

    // Also export to window for backward compatibility
    window.initDashboard = initDashboard;

})();
