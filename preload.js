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
});
