const { contextBridge, ipcRenderer } = require('electron');

// Expose des fonctions au processus de rendu (la page web)
// de manière sécurisée via l'objet `window.api`.
contextBridge.exposeInMainWorld('api', {
  /**
   * Demande au processus principal de récupérer la liste des services.
   * @returns {Promise<Array>} La liste des services.
   */
  getServices: () => ipcRenderer.invoke('get-services'),

  /**
   * Demande au processus principal de sauvegarder la liste des services.
   * @param {Array} services - La liste complète des services à sauvegarder.
   * @returns {Promise<{success: boolean, error?: string}>} Un objet indiquant le succès de l'opération.
   */
  saveServices: (services) => ipcRenderer.invoke('save-services', services),

  /**
   * Vérifie si c'est la première utilisation de l'application.
   * @returns {Promise<boolean>}
   */
  checkFirstUse: () => ipcRenderer.invoke('check-first-use'),

  /**
   * Marque l'onboarding comme terminé.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  completeFirstUse: () => ipcRenderer.invoke('complete-first-use'),

  /**
   * Récupère les tâches de la ToDo list.
   * @returns {Promise<Array>}
   */
  getTodos: () => ipcRenderer.invoke('get-todos'),

  /**
   * Sauvegarde les tâches de la ToDo list.
   * @param {Array} todos 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  saveTodos: (todos) => ipcRenderer.invoke('save-todos', todos),

  // --- WebDAV ---
  webdav: {
    getConfig: () => ipcRenderer.invoke('webdav-get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-webdav-config', config),
    ls: (path) => ipcRenderer.invoke('webdav-ls', path),
    open: (path) => ipcRenderer.invoke('webdav-open', path),
    download: (path) => ipcRenderer.invoke('webdav-download', path),
    uploadFile: (remoteDir) => ipcRenderer.invoke('webdav-upload-file', remoteDir),
    uploadDirectory: (remoteDir) => ipcRenderer.invoke('webdav-upload-directory', remoteDir),
    uploadPaths: (remoteDir, paths) => ipcRenderer.invoke('webdav-upload-paths', { remoteDir, localPaths: paths }),
    delete: (remotePath) => ipcRenderer.invoke('webdav-delete', remotePath),
    rename: (oldPath, newPath) => ipcRenderer.invoke('webdav-rename', { oldPath, newPath }),
    downloadDirectory: (remotePath) => ipcRenderer.invoke('webdav-download-directory', remotePath),
    mkdir: (path) => ipcRenderer.invoke('webdav-mkdir', path),
  },
  gdrive: {
    getConfig: () => ipcRenderer.invoke('gdrive-get-config'),
    saveConfig: (config) => ipcRenderer.invoke('gdrive-save-config', config),
    auth: () => ipcRenderer.invoke('gdrive-auth'),
    disconnect: () => ipcRenderer.invoke('gdrive-disconnect'),
    ls: (path) => ipcRenderer.invoke('gdrive-ls', path),
    open: (path) => ipcRenderer.invoke('gdrive-open', path),
    download: (path) => ipcRenderer.invoke('gdrive-download', path),
    uploadFile: (path) => ipcRenderer.invoke('gdrive-upload-file', path),
    delete: (path) => ipcRenderer.invoke('gdrive-delete', path),
    rename: (oldPath, newPath) => ipcRenderer.invoke('gdrive-rename', { oldPath, newPath }),
    mkdir: (path) => ipcRenderer.invoke('gdrive-mkdir', path)
  }
});
