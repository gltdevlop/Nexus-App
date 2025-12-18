const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const HABITS_FILE = path.join(app.getPath('userData'), 'habits.json');

/**
 * Load habits from JSON file
 */
function loadHabits() {
    try {
        if (!fs.existsSync(HABITS_FILE)) {
            return { habits: [] };
        }
        const data = fs.readFileSync(HABITS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading habits:', error);
        return { habits: [] };
    }
}

/**
 * Save habits to JSON file
 */
function saveHabits(habitsData) {
    try {
        fs.writeFileSync(HABITS_FILE, JSON.stringify(habitsData, null, 2), 'utf-8');
        return true;
    } catch (error) {
        console.error('Error saving habits:', error);
        return false;
    }
}

/**
 * Generate unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

/**
 * Calculate current streak from completions array
 * Strict mode: resets to 0 if missed a day
 */
function calculateStreak(completions) {
    if (!completions || completions.length === 0) return 0;

    // Sort dates in descending order (most recent first)
    const sortedDates = completions.sort((a, b) => new Date(b) - new Date(a));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let streak = 0;
    let currentDate = new Date(today);

    for (let i = 0; i < sortedDates.length; i++) {
        const completionDate = new Date(sortedDates[i]);
        completionDate.setHours(0, 0, 0, 0);

        // Check if this completion matches the expected date
        if (completionDate.getTime() === currentDate.getTime()) {
            streak++;
            // Move to previous day
            currentDate.setDate(currentDate.getDate() - 1);
        } else {
            // Gap found, streak broken
            break;
        }
    }

    return streak;
}

/**
 * Get all habits
 */
function getHabits() {
    const data = loadHabits();
    // Recalculate streaks on load
    data.habits = data.habits.map(habit => ({
        ...habit,
        currentStreak: calculateStreak(habit.completions || [])
    }));
    return data.habits;
}

/**
 * Add a new habit
 */
function addHabit(habitData) {
    const data = loadHabits();
    const newHabit = {
        id: generateId(),
        name: habitData.name,
        category: habitData.category || 'Autre',
        icon: habitData.icon || '✅',
        createdAt: getTodayDate(),
        completions: [],
        currentStreak: 0,
        bestStreak: 0
    };
    data.habits.push(newHabit);
    saveHabits(data);
    return newHabit;
}

/**
 * Delete a habit
 */
function deleteHabit(habitId) {
    const data = loadHabits();
    data.habits = data.habits.filter(h => h.id !== habitId);
    saveHabits(data);
    return true;
}

/**
 * Toggle habit completion for a specific date
 */
function toggleHabitCompletion(habitId, date = null) {
    const targetDate = date || getTodayDate();
    const data = loadHabits();

    const habit = data.habits.find(h => h.id === habitId);
    if (!habit) return null;

    if (!habit.completions) habit.completions = [];

    const dateIndex = habit.completions.indexOf(targetDate);

    if (dateIndex > -1) {
        // Remove completion
        habit.completions.splice(dateIndex, 1);
    } else {
        // Add completion
        habit.completions.push(targetDate);
    }

    // Recalculate streak
    habit.currentStreak = calculateStreak(habit.completions);

    // Update best streak
    if (habit.currentStreak > (habit.bestStreak || 0)) {
        habit.bestStreak = habit.currentStreak;
    }

    saveHabits(data);
    return habit;
}

/**
 * Get habits for a specific date
 */
function getHabitsForDate(date) {
    const data = loadHabits();
    return data.habits.map(habit => ({
        ...habit,
        completed: habit.completions && habit.completions.includes(date)
    }));
}

/**
 * Get statistics
 */
function getStats() {
    const data = loadHabits();
    const today = getTodayDate();

    const totalHabits = data.habits.length;
    const completedToday = data.habits.filter(h =>
        h.completions && h.completions.includes(today)
    ).length;

    const activeStreaks = data.habits.filter(h => h.currentStreak > 0).length;

    // Calculate completion rate for last 30 days
    const last30Days = [];
    for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        last30Days.push(date.toISOString().split('T')[0]);
    }

    let totalPossible = totalHabits * 30;
    let totalCompleted = 0;

    data.habits.forEach(habit => {
        if (habit.completions) {
            totalCompleted += habit.completions.filter(d => last30Days.includes(d)).length;
        }
    });

    const completionRate = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    return {
        totalHabits,
        completedToday,
        activeStreaks,
        completionRate
    };
}

/**
 * Get heatmap data for the last 365 days
 */
function getHeatmapData() {
    const data = loadHabits();
    const heatmap = {};

    // Generate last 365 days
    for (let i = 0; i < 365; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        // Count completions for this date
        let count = 0;
        data.habits.forEach(habit => {
            if (habit.completions && habit.completions.includes(dateStr)) {
                count++;
            }
        });

        heatmap[dateStr] = {
            count,
            total: data.habits.length,
            percentage: data.habits.length > 0 ? Math.round((count / data.habits.length) * 100) : 0
        };
    }

    return heatmap;
}

module.exports = {
    getHabits,
    addHabit,
    deleteHabit,
    toggleHabitCompletion,
    getHabitsForDate,
    getStats,
    getHeatmapData
};
