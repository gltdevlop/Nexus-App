/**
 * Files Navigation Management
 * Handles navigation history, breadcrumbs, and navigation buttons
 */

(function () {
    'use strict';

    // Create namespace if it doesn't exist
    window.NexusModules = window.NexusModules || {};

    /**
     * Create and return a navigation manager
     * @returns {Object} Navigation state and methods
     */
    function createNavigationManager() {
        const state = {
            navigationHistory: [],
            navigationIndex: -1,
            currentPath: "/"
        };

        return {
            state,

            /**
             * Add a path to navigation history
             * @param {string} path - Path to add
             */
            addToHistory(path) {
                // Remove any forward history when navigating to a new path
                if (state.navigationIndex < state.navigationHistory.length - 1) {
                    state.navigationHistory = state.navigationHistory.slice(0, state.navigationIndex + 1);
                }
                // Add new path to history
                state.navigationHistory.push(path);
                state.navigationIndex = state.navigationHistory.length - 1;
                state.currentPath = path;
            },

            /**
             * Navigate back in history
             * @returns {string|null} Previous path or null if at beginning
             */
            goBack() {
                if (state.navigationIndex > 0) {
                    state.navigationIndex--;
                    state.currentPath = state.navigationHistory[state.navigationIndex];
                    return state.currentPath;
                }
                return null;
            },

            /**
             * Navigate forward in history
             * @returns {string|null} Next path or null if at end
             */
            goForward() {
                if (state.navigationIndex < state.navigationHistory.length - 1) {
                    state.navigationIndex++;
                    state.currentPath = state.navigationHistory[state.navigationIndex];
                    return state.currentPath;
                }
                return null;
            },

            /**
             * Get parent path of current path
             * @returns {string} Parent path
             */
            getParentPath() {
                if (state.currentPath === '/') return '/';
                return state.currentPath.substring(0, state.currentPath.lastIndexOf('/')) || '/';
            },

            /**
             * Update navigation button states
             * @param {HTMLElement} container - Files app container
             */
            updateNavigationButtons(container) {
                const backBtn = container.querySelector('#files-back-btn');
                const forwardBtn = container.querySelector('#files-forward-btn');
                const upBtn = container.querySelector('#files-up-btn');

                if (backBtn) {
                    backBtn.disabled = state.navigationIndex <= 0;
                }
                if (forwardBtn) {
                    forwardBtn.disabled = state.navigationIndex >= state.navigationHistory.length - 1;
                }
                if (upBtn) {
                    upBtn.disabled = state.currentPath === '/';
                }
            },

            /**
             * Render breadcrumbs for current path
             * @param {HTMLElement} breadcrumbsElement - Breadcrumbs container
             * @param {Function} onNavigate - Callback when breadcrumb is clicked
             */
            renderBreadcrumbs(breadcrumbsElement, onNavigate) {
                breadcrumbsElement.innerHTML = '';
                const parts = state.currentPath.split('/').filter(p => p);
                let buildPath = "";

                // Root
                const rootSpan = document.createElement('span');
                rootSpan.className = 'breadcrumb-item';
                rootSpan.textContent = 'Racine';
                rootSpan.addEventListener('click', () => onNavigate("/"));
                breadcrumbsElement.appendChild(rootSpan);

                parts.forEach((part, index) => {
                    buildPath += "/" + part;
                    const sep = document.createElement('span');
                    sep.className = 'breadcrumb-sep';
                    sep.textContent = ' > ';
                    breadcrumbsElement.appendChild(sep);

                    const span = document.createElement('span');
                    span.className = 'breadcrumb-item';
                    span.textContent = part;
                    if (index === parts.length - 1) span.classList.add('active');
                    else {
                        const target = buildPath;
                        span.addEventListener('click', () => onNavigate(target));
                    }
                    breadcrumbsElement.appendChild(span);
                });
            }
        };
    }

    // Export to namespace
    window.NexusModules.filesNavigation = {
        createNavigationManager
    };

    // Also export to window for backward compatibility
    window.createNavigationManager = createNavigationManager;

})();
