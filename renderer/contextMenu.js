// Context Menu Management Module

export function initContextMenus(callbacks) {
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
    filesContextMenu.style.zIndex = "10001";
    filesContextMenu.innerHTML = `
        <div class="context-menu-item" id="ctx-files-open">Ouvrir</div>
        <div class="context-menu-item" id="ctx-files-download">Télécharger</div>
        <div class="context-menu-item" id="ctx-files-new-folder">Nouveau dossier</div>
        <div class="context-menu-item" id="ctx-files-rename">Renommer</div>
        <div class="context-menu-item delete" id="ctx-files-delete">Supprimer</div>
    `;
    document.body.appendChild(filesContextMenu);

    let contextMenuTargetIndex = -1;
    let contextMenuTargetFile = null;

    // Hide context menus on click
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
        filesContextMenu.style.display = 'none';
    });

    // Service Context Menu Actions
    document.getElementById('ctx-edit').addEventListener('click', () => {
        if (contextMenuTargetIndex >= 0 && callbacks.onEditService) {
            callbacks.onEditService(contextMenuTargetIndex);
        }
    });

    document.getElementById('ctx-delete').addEventListener('click', async () => {
        if (contextMenuTargetIndex >= 0 && callbacks.onDeleteService) {
            await callbacks.onDeleteService(contextMenuTargetIndex);
        }
    });

    return {
        contextMenu,
        filesContextMenu,
        getContextMenuTargetIndex: () => contextMenuTargetIndex,
        setContextMenuTargetIndex: (index) => { contextMenuTargetIndex = index; },
        getContextMenuTargetFile: () => contextMenuTargetFile,
        setContextMenuTargetFile: (file) => { contextMenuTargetFile = file; }
    };
}
