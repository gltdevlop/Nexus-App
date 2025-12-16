/**
 * Main Renderer Entry Point
 * Loads all modular components and makes them available globally
 * 
 * NOTE: This is a transitional refactoring. Todo and Calendar apps are still inline
 * and should be extracted in future iterations (see REFACTORING_PROGRESS.md)
 * 
 * Usage: Include this script BEFORE renderer.js in index.html
 */

(function () {
    'use strict';

    // This file will load the modular components via script tags in index.html
    // The modules export to window.NexusModules namespace

    // Wait for all modules to load
    window.addEventListener('DOMContentLoaded', () => {
        console.log('[Nexus] Modular components loaded');

        // Modules are available via:
        // - window.NexusModules.utils
        // - window.NexusModules.services  
        // - window.NexusModules.filesSelection
        // - window.NexusModules.filesNavigation
        // - window.NexusModules.dashboardApp
    });
})();
