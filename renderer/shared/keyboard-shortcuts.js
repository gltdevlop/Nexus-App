/**
 * Global Keyboard Shortcuts Handler
 * Manages keyboard shortcuts for files app and global actions
 */

/**
 * Setup global keyboard shortcuts for files app
 * @param {Object} state - Files app state object containing selectedFiles, clipboard, etc.
 * @param {Object} callbacks - Callback functions for actions
 */
export function setupFilesKeyboardShortcuts(state, callbacks) {
    const filesAppContainer = document.getElementById('files-app-container');

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
        const filesAppVisible = filesAppContainer && filesAppContainer.style.display === 'flex';
        if (!filesAppVisible) return;

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

        // Cmd/Ctrl + A: Select all
        if (cmdOrCtrl && e.key === 'a') {
            e.preventDefault();
            if (callbacks.selectAll) callbacks.selectAll();
        }

        // Cmd/Ctrl + C: Copy
        if (cmdOrCtrl && e.key === 'c' && state.selectedFiles.length > 0) {
            e.preventDefault();
            const container = document.getElementById('files-app-container');
            state.clipboardFiles = [...state.selectedFiles];
            state.clipboardOperation = 'copy';
            state.clipboardProvider = container.dataset.provider;

            // Remove cut styling
            document.querySelectorAll('.file-item.cut').forEach(el => el.classList.remove('cut'));

            console.log(`Copied ${state.clipboardFiles.length} file(s) to clipboard`);
        }

        // Cmd/Ctrl + X: Cut
        if (cmdOrCtrl && e.key === 'x' && state.selectedFiles.length > 0) {
            e.preventDefault();
            const container = document.getElementById('files-app-container');
            state.clipboardFiles = [...state.selectedFiles];
            state.clipboardOperation = 'cut';
            state.clipboardProvider = container.dataset.provider;

            // Add cut styling
            document.querySelectorAll('.file-item.cut').forEach(el => el.classList.remove('cut'));
            document.querySelectorAll('.file-item.selected').forEach(el => el.classList.add('cut'));

            console.log(`Cut ${state.clipboardFiles.length} file(s) to clipboard`);
        }

        // Cmd/Ctrl + V: Paste
        if (cmdOrCtrl && e.key === 'v' && state.clipboardFiles.length > 0) {
            e.preventDefault();
            const filesContextMenu = document.querySelector('.context-menu');
            const pasteBtn = filesContextMenu?.querySelector('#ctx-files-paste');
            if (pasteBtn) pasteBtn.click();
        }

        // Escape: Clear selection
        if (e.key === 'Escape') {
            if (callbacks.clearSelection) callbacks.clearSelection();
        }
    });
}
