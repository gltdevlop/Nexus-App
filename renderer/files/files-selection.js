/**
 * Files Selection Management
 * Handles multi-selection, drag selection, and clipboard operations for files
 */

(function () {
    'use strict';

    // Create namespace if it doesn't exist
    window.NexusModules = window.NexusModules || {};

    /**
     * Create and return a files selection state manager
     * @returns {Object} Selection state and methods
     */
    function createSelectionManager() {
        const state = {
            selectedFiles: [],
            lastSelectedIndex: -1,
            allVisibleFiles: [],
            clipboardFiles: [],
            clipboardOperation: null, // 'copy' or 'cut'
            clipboardProvider: null,
            isDragging: false,
            dragStartX: 0,
            dragStartY: 0,
            selectionBox: null
        };

        return {
            state,

            clearSelection() {
                state.selectedFiles = [];
                state.lastSelectedIndex = -1;
                document.querySelectorAll('.file-item.selected, .file-list-item.selected').forEach(el => {
                    el.classList.remove('selected');
                    el.classList.remove('cut');
                });
            },

            selectFile(file, fileElement) {
                if (!state.selectedFiles.find(f => f.filename === file.filename)) {
                    state.selectedFiles.push(file);
                    fileElement.classList.add('selected');
                }
            },

            deselectFile(file, fileElement) {
                state.selectedFiles = state.selectedFiles.filter(f => f.filename !== file.filename);
                fileElement.classList.remove('selected');
                fileElement.classList.remove('cut');
            },

            toggleFileSelection(file, fileElement) {
                if (state.selectedFiles.find(f => f.filename === file.filename)) {
                    this.deselectFile(file, fileElement);
                } else {
                    this.selectFile(file, fileElement);
                }
            },

            selectRange(startIndex, endIndex) {
                const start = Math.min(startIndex, endIndex);
                const end = Math.max(startIndex, endIndex);

                const fileElements = document.querySelectorAll('.file-item, .file-list-item');
                for (let i = start; i <= end && i < state.allVisibleFiles.length; i++) {
                    this.selectFile(state.allVisibleFiles[i], fileElements[i]);
                }
            },

            selectAll() {
                const fileElements = document.querySelectorAll('.file-item, .file-list-item');
                state.allVisibleFiles.forEach((file, index) => {
                    this.selectFile(file, fileElements[index]);
                });
            },

            updateDragSelection(left, top, width, height) {
                const fileElements = document.querySelectorAll('.file-item');
                const selectionRect = { left, top, right: left + width, bottom: top + height };

                fileElements.forEach((el, index) => {
                    const rect = el.getBoundingClientRect();
                    const grid = document.getElementById('files-grid');
                    const gridRect = grid.getBoundingClientRect();

                    // Calculate element position relative to grid
                    const elLeft = rect.left - gridRect.left + grid.scrollLeft;
                    const elTop = rect.top - gridRect.top + grid.scrollTop;
                    const elRight = elLeft + rect.width;
                    const elBottom = elTop + rect.height;

                    // Check if rectangles intersect
                    const intersects = !(
                        elRight < selectionRect.left ||
                        elLeft > selectionRect.right ||
                        elBottom < selectionRect.top ||
                        elTop > selectionRect.bottom
                    );

                    if (intersects && index < state.allVisibleFiles.length) {
                        this.selectFile(state.allVisibleFiles[index], el);
                    }
                });
            },

            /**
             * Setup drag selection rectangle on a grid element
             * @param {HTMLElement} filesGrid - The files grid element
             */
            setupDragSelection(filesGrid) {
                const self = this;

                filesGrid.addEventListener('mousedown', (e) => {
                    // Only start drag selection on empty space (not on file items)
                    if (e.target.closest('.file-item')) return;

                    // Don't start drag selection if right-clicking
                    if (e.button !== 0) return;

                    // Clear selection when clicking on empty space
                    self.clearSelection();

                    state.isDragging = true;
                    const rect = filesGrid.getBoundingClientRect();
                    state.dragStartX = e.clientX - rect.left + filesGrid.scrollLeft;
                    state.dragStartY = e.clientY - rect.top + filesGrid.scrollTop;

                    // Create selection box element
                    if (!state.selectionBox) {
                        state.selectionBox = document.createElement('div');
                        state.selectionBox.className = 'selection-rectangle';
                        filesGrid.appendChild(state.selectionBox);
                    }

                    state.selectionBox.style.left = state.dragStartX + 'px';
                    state.selectionBox.style.top = state.dragStartY + 'px';
                    state.selectionBox.style.width = '0px';
                    state.selectionBox.style.height = '0px';
                    state.selectionBox.style.display = 'block';

                    e.preventDefault();
                });

                filesGrid.addEventListener('mousemove', (e) => {
                    if (!state.isDragging) return;

                    const rect = filesGrid.getBoundingClientRect();
                    const currentX = e.clientX - rect.left + filesGrid.scrollLeft;
                    const currentY = e.clientY - rect.top + filesGrid.scrollTop;

                    const left = Math.min(state.dragStartX, currentX);
                    const top = Math.min(state.dragStartY, currentY);
                    const width = Math.abs(currentX - state.dragStartX);
                    const height = Math.abs(currentY - state.dragStartY);

                    state.selectionBox.style.left = left + 'px';
                    state.selectionBox.style.top = top + 'px';
                    state.selectionBox.style.width = width + 'px';
                    state.selectionBox.style.height = height + 'px';

                    // Update selection based on rectangle intersection
                    self.updateDragSelection(left, top, width, height);
                });

                const endDragSelection = () => {
                    if (!state.isDragging) return;
                    state.isDragging = false;
                    if (state.selectionBox) {
                        state.selectionBox.style.display = 'none';
                    }
                };

                filesGrid.addEventListener('mouseup', endDragSelection);
                filesGrid.addEventListener('mouseleave', endDragSelection);
            }
        };
    }

    // Export to namespace
    window.NexusModules.filesSelection = {
        createSelectionManager
    };

    // Also export to window for backward compatibility
    window.createSelectionManager = createSelectionManager;

})();
