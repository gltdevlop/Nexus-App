const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
});

contextBridge.exposeInMainWorld('tabs', {
  get: () => ipcRenderer.invoke('get-tabs'),
  save: (tabs) => ipcRenderer.invoke('save-tabs', tabs),
  showContextMenu: (tabId) => ipcRenderer.send('show-tab-context-menu', tabId),
  onDelete: (callback) => ipcRenderer.on('delete-tab', (event, tabId) => callback(tabId)),
  getContent: (tabId) => ipcRenderer.invoke('get-tab-content', tabId),
  saveContent: (tabId, content) => ipcRenderer.invoke('save-tab-content', { tabId, content }),
});

contextBridge.exposeInMainWorld('settings', {
    open: () => ipcRenderer.send('open-settings-window'),
    get: () => ipcRenderer.invoke('get-settings').then(JSON.parse),
    save: (settings) => ipcRenderer.invoke('save-settings', settings),
});
