// Habit Tracker App - IIFE Pattern for Electron
(function () {
    'use strict';

    let habits = [];
    let heatmapData = {};

    const CATEGORIES = {
        'Santé': { icon: '🏃', color: '#4CAF50' },
        'Sport': { icon: '💪', color: '#FF9800' },
        'Productivité': { icon: '📚', color: '#2196F3' },
        'Bien-être': { icon: '🧘', color: '#9C27B0' },
        'Social': { icon: '👥', color: '#E91E63' },
        'Créativité': { icon: '🎨', color: '#FF5722' },
        'Autre': { icon: '✅', color: '#607D8B' }
    };

    // Initialize the Habits App
    async function initHabitsApp() {
        console.log('Initializing Habits App...');
        await loadHabits();
        await loadHeatmap();
        renderHabitsView();
        attachEventListeners();
    }

    // Load habits from backend
    async function loadHabits() {
        try {
            const result = await window.api.habits.load();
            if (result.success) {
                habits = result.habits || [];
                console.log('Loaded habits:', habits);
            } else {
                console.error('Failed to load habits:', result.error);
                habits = [];
            }
        } catch (error) {
            console.error('Error loading habits:', error);
            habits = [];
        }
    }

    // Load heatmap data
    async function loadHeatmap() {
        try {
            const result = await window.api.habits.getHeatmap();
            if (result.success) {
                heatmapData = result.heatmap || {};
            }
        } catch (error) {
            console.error('Error loading heatmap:', error);
        }
    }

    // Get today's date in YYYY-MM-DD format
    function getTodayDate() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    // Check if habit is completed today
    function isCompletedToday(habit) {
        const today = getTodayDate();
        return habit.completions && habit.completions.includes(today);
    }

    // Render main habits view
    function renderHabitsView() {
        const container = document.getElementById('habits-app-container');
        if (!container) return;

        const today = getTodayDate();
        const completedToday = habits.filter(h => isCompletedToday(h)).length;

        container.innerHTML = `
            <div class="habits-app">
                <div class="habits-header">
                    <div class="habits-title-section">
                        <h1>🔥 Mes Habitudes</h1>
                        <p class="habits-subtitle">Construis ta meilleure version, un jour à la fois</p>
                    </div>
                    <div class="habits-stats-quick">
                        <div class="stat-badge">
                            <span class="stat-value">${completedToday}/${habits.length}</span>
                            <span class="stat-label">Aujourd'hui</span>
                        </div>
                        <button class="btn-add-habit" id="btn-add-habit">
                            <span>+</span> Nouvelle habitude
                        </button>
                    </div>
                </div>

                <div class="habits-content">
                    <div class="habits-grid" id="habits-grid">
                        ${habits.length === 0 ? renderEmptyState() : habits.map(renderHabitCard).join('')}
                    </div>

                    <div class="habits-sidebar">
                        <div class="stats-panel">
                            <h3>📊 Statistiques</h3>
                            <div id="stats-content"></div>
                        </div>
                        
                        <div class="heatmap-panel">
                            <h3>📅 Calendrier annuel</h3>
                            <div id="heatmap-container"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Add Habit Modal -->
            <div id="add-habit-modal" class="habit-modal-overlay" style="display: none;">
                <div class="habit-modal-content">
                    <h2>✨ Nouvelle habitude</h2>
                    <form id="add-habit-form">
                        <div class="form-group">
                            <label>Nom de l'habitude</label>
                            <input type="text" id="habit-name" placeholder="Ex: Faire du sport" required>
                        </div>
                        <div class="form-group">
                            <label>Catégorie</label>
                            <select id="habit-category" required>
                                ${Object.keys(CATEGORIES).map(cat =>
            `<option value="${cat}">${CATEGORIES[cat].icon} ${cat}</option>`
        ).join('')}
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn-cancel" id="cancel-add-habit">Annuler</button>
                            <button type="submit" class="btn-primary">Créer</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        renderStats();
        renderHeatmap();
    }

    // Render empty state
    function renderEmptyState() {
        return `
            <div class="habits-empty-state">
                <div class="empty-icon">🎯</div>
                <h3>Aucune habitude pour le moment</h3>
                <p>Commence par créer ta première habitude !</p>
            </div>
        `;
    }

    // Render habit card
    function renderHabitCard(habit) {
        const category = CATEGORIES[habit.category] || CATEGORIES['Autre'];
        const completed = isCompletedToday(habit);
        const streak = habit.currentStreak || 0;

        return `
            <div class="habit-card ${completed ? 'completed' : ''}" data-habit-id="${habit.id}">
                <div class="habit-card-header">
                    <div class="habit-icon" style="background: ${category.color}20; color: ${category.color}">
                        ${category.icon}
                    </div>
                    <button class="habit-delete-btn" data-habit-id="${habit.id}" title="Supprimer">
                        <span>×</span>
                    </button>
                </div>
                <div class="habit-card-body">
                    <h3 class="habit-name">${escapeHtml(habit.name)}</h3>
                    <span class="habit-category" style="background: ${category.color}20; color: ${category.color}">
                        ${habit.category}
                    </span>
                </div>
                <div class="habit-card-footer">
                    <div class="habit-streak">
                        ${renderStreakFlames(streak)}
                        <span class="streak-count">${streak} jour${streak > 1 ? 's' : ''}</span>
                    </div>
                    <button class="habit-check-btn ${completed ? 'checked' : ''}" data-habit-id="${habit.id}">
                        <span class="checkmark">${completed ? '✓' : ''}</span>
                    </button>
                </div>
            </div>
        `;
    }

    // Render streak flames
    function renderStreakFlames(streak) {
        if (streak === 0) return '<span class="flame-icon inactive">🔥</span>';

        let flames = '';
        const flameCount = Math.min(Math.floor(streak / 7) + 1, 3); // Max 3 flames

        for (let i = 0; i < flameCount; i++) {
            flames += '<span class="flame-icon active">🔥</span>';
        }

        return flames;
    }

    // Render statistics
    async function renderStats() {
        try {
            const result = await window.api.habits.getStats();
            if (!result.success) return;

            const stats = result.stats;
            const statsContent = document.getElementById('stats-content');
            if (!statsContent) return;

            statsContent.innerHTML = `
                <div class="stat-item">
                    <div class="stat-icon">📋</div>
                    <div class="stat-info">
                        <div class="stat-number">${stats.totalHabits}</div>
                        <div class="stat-text">Habitudes</div>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon">✅</div>
                    <div class="stat-info">
                        <div class="stat-number">${stats.completedToday}</div>
                        <div class="stat-text">Complétées aujourd'hui</div>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon">🔥</div>
                    <div class="stat-info">
                        <div class="stat-number">${stats.activeStreaks}</div>
                        <div class="stat-text">Streaks actifs</div>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon">📈</div>
                    <div class="stat-info">
                        <div class="stat-number">${stats.completionRate}%</div>
                        <div class="stat-text">Taux (30 jours)</div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error rendering stats:', error);
        }
    }

    // Render heatmap calendar
    function renderHeatmap() {
        const container = document.getElementById('heatmap-container');
        if (!container) return;

        const today = new Date();
        const days = [];

        // Generate last 365 days
        for (let i = 364; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            days.push(date);
        }

        // Group by weeks
        const weeks = [];
        let currentWeek = [];

        days.forEach(date => {
            if (currentWeek.length === 7) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
            currentWeek.push(date);
        });
        if (currentWeek.length > 0) weeks.push(currentWeek);

        // Generate month labels
        const monthLabels = [];
        let lastMonth = -1;

        weeks.forEach((week, index) => {
            const firstDayOfWeek = week[0];
            const month = firstDayOfWeek.getMonth();
            if (month !== lastMonth) {
                monthLabels.push({
                    label: firstDayOfWeek.toLocaleDateString('fr-FR', { month: 'short' }),
                    weekIndex: index
                });
                lastMonth = month;
            }
        });

        container.innerHTML = `
            <div class="heatmap-wrapper" id="heatmap-wrapper">
                <div class="heatmap-scroll-container">
                    <div class="heatmap-months-scroll">
                        ${monthLabels.map(m => `
                            <span class="month-label" style="left: ${m.weekIndex * 15}px">${m.label}</span>
                        `).join('')}
                    </div>
                    <div class="heatmap-content">
                        <div class="heatmap-grid">
                            ${weeks.map(week => `
                                <div class="heatmap-week">
                                    ${week.map(date => renderHeatmapDay(date)).join('')}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="heatmap-legend">
                    <span>Moins</span>
                    <div class="legend-box level-0"></div>
                    <div class="legend-box level-1"></div>
                    <div class="legend-box level-2"></div>
                    <div class="legend-box level-3"></div>
                    <div class="legend-box level-4"></div>
                    <span>Plus</span>
                </div>
            </div>
        `;

        // Add click handler to expand heatmap
        const heatmapWrapper = document.getElementById('heatmap-wrapper');
        if (heatmapWrapper) {
            heatmapWrapper.addEventListener('click', showExpandedHeatmap);
        }
    }

    // Show expanded heatmap in modal
    function showExpandedHeatmap() {
        const modal = document.createElement('div');
        modal.className = 'heatmap-modal-overlay';
        modal.innerHTML = `
            <div class="heatmap-modal-content">
                <div class="heatmap-modal-header">
                    <h3>📅 Calendrier annuel - Vue étendue</h3>
                    <button class="heatmap-modal-close">×</button>
                </div>
                <div id="expanded-heatmap-container"></div>
            </div>
        `;

        document.body.appendChild(modal);

        // Render expanded heatmap
        renderExpandedHeatmap();

        // Close button
        const closeBtn = modal.querySelector('.heatmap-modal-close');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    // Render expanded heatmap
    function renderExpandedHeatmap() {
        const container = document.getElementById('expanded-heatmap-container');
        if (!container) return;

        const today = new Date();
        const days = [];

        for (let i = 364; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            days.push(date);
        }

        const weeks = [];
        let currentWeek = [];

        days.forEach(date => {
            if (currentWeek.length === 7) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
            currentWeek.push(date);
        });
        if (currentWeek.length > 0) weeks.push(currentWeek);

        const monthLabels = [];
        let lastMonth = -1;

        weeks.forEach((week, index) => {
            const firstDayOfWeek = week[0];
            const month = firstDayOfWeek.getMonth();
            if (month !== lastMonth) {
                monthLabels.push({
                    label: firstDayOfWeek.toLocaleDateString('fr-FR', { month: 'short' }),
                    weekIndex: index
                });
                lastMonth = month;
            }
        });

        container.innerHTML = `
            <div class="heatmap-months-expanded">
                ${monthLabels.map(m => `
                    <span class="month-label-expanded" style="left: ${m.weekIndex * 20}px">${m.label}</span>
                `).join('')}
            </div>
            <div class="heatmap-grid-expanded">
                ${weeks.map(week => `
                    <div class="heatmap-week-expanded">
                        ${week.map(date => renderHeatmapDayExpanded(date)).join('')}
                    </div>
                `).join('')}
            </div>
            <div class="heatmap-legend-expanded">
                <span>Moins</span>
                <div class="legend-box level-0"></div>
                <div class="legend-box level-1"></div>
                <div class="legend-box level-2"></div>
                <div class="legend-box level-3"></div>
                <div class="legend-box level-4"></div>
                <span>Plus</span>
            </div>
        `;
    }

    // Render individual heatmap day
    function renderHeatmapDay(date) {
        const dateStr = date.toISOString().split('T')[0];
        const data = heatmapData[dateStr] || { count: 0, total: 0, percentage: 0 };

        let level = 0;
        if (data.percentage > 0) level = 1;
        if (data.percentage >= 25) level = 2;
        if (data.percentage >= 50) level = 3;
        if (data.percentage >= 75) level = 4;

        const title = `${dateStr}: ${data.count}/${data.total} habitudes (${data.percentage}%)`;

        return `<div class="heatmap-day level-${level}" title="${title}" data-date="${dateStr}"></div>`;
    }

    // Render expanded heatmap day
    function renderHeatmapDayExpanded(date) {
        const dateStr = date.toISOString().split('T')[0];
        const data = heatmapData[dateStr] || { count: 0, total: 0, percentage: 0 };

        let level = 0;
        if (data.percentage > 0) level = 1;
        if (data.percentage >= 25) level = 2;
        if (data.percentage >= 50) level = 3;
        if (data.percentage >= 75) level = 4;

        const title = `${dateStr}: ${data.count}/${data.total} habitudes (${data.percentage}%)`;

        return `<div class="heatmap-day-expanded level-${level}" title="${title}" data-date="${dateStr}"></div>`;
    }

    // Attach event listeners
    function attachEventListeners() {
        // Add habit button
        const addBtn = document.getElementById('btn-add-habit');
        if (addBtn) {
            addBtn.addEventListener('click', showAddHabitModal);
        }

        // Cancel add habit
        const cancelBtn = document.getElementById('cancel-add-habit');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', hideAddHabitModal);
        }

        // Add habit form
        const form = document.getElementById('add-habit-form');
        if (form) {
            form.addEventListener('submit', handleAddHabit);
        }

        // Check buttons (event delegation)
        const grid = document.getElementById('habits-grid');
        if (grid) {
            grid.addEventListener('click', async (e) => {
                const checkBtn = e.target.closest('.habit-check-btn');
                if (checkBtn) {
                    const habitId = checkBtn.dataset.habitId;
                    await toggleHabit(habitId);
                }

                const deleteBtn = e.target.closest('.habit-delete-btn');
                if (deleteBtn) {
                    const habitId = deleteBtn.dataset.habitId;
                    await deleteHabit(habitId);
                }
            });
        }
    }

    // Show add habit modal
    function showAddHabitModal() {
        const modal = document.getElementById('add-habit-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('habit-name').focus();
        }
    }

    // Hide add habit modal
    function hideAddHabitModal() {
        const modal = document.getElementById('add-habit-modal');
        if (modal) {
            modal.style.display = 'none';
            document.getElementById('add-habit-form').reset();
        }
    }

    // Handle add habit
    async function handleAddHabit(e) {
        e.preventDefault();

        const name = document.getElementById('habit-name').value.trim();
        const category = document.getElementById('habit-category').value;

        if (!name) return;

        try {
            const result = await window.api.habits.add({ name, category });
            if (result.success) {
                await loadHabits();
                await loadHeatmap();
                renderHabitsView();
                attachEventListeners();
                hideAddHabitModal();
            } else {
                alert('Erreur lors de la création de l\'habitude');
            }
        } catch (error) {
            console.error('Error adding habit:', error);
            alert('Erreur lors de la création de l\'habitude');
        }
    }

    // Toggle habit completion
    async function toggleHabit(habitId) {
        try {
            const result = await window.api.habits.toggle(habitId);
            if (result.success) {
                await loadHabits();
                await loadHeatmap();
                renderHabitsView();
                attachEventListeners();
            }
        } catch (error) {
            console.error('Error toggling habit:', error);
        }
    }

    // Delete habit
    async function deleteHabit(habitId) {
        const habit = habits.find(h => h.id === habitId);
        if (!habit) return;

        if (!confirm(`Supprimer l'habitude "${habit.name}" ?\n\nCette action est irréversible.`)) {
            return;
        }

        try {
            const result = await window.api.habits.delete(habitId);
            if (result.success) {
                await loadHabits();
                await loadHeatmap();
                renderHabitsView();
                attachEventListeners();
            }
        } catch (error) {
            console.error('Error deleting habit:', error);
        }
    }

    // Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Export init function
    window.HabitsApp = {
        init: initHabitsApp
    };

})();
