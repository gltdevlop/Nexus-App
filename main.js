const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');


let win;

const createWindow = () => {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  

  win.loadFile('index.html');
};

let settingsWindow;

const createSettingsWindow = (parentWindow) => {
    settingsWindow = new BrowserWindow({
        width: 600,
        height: 400,
        parent: parentWindow,
        modal: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    settingsWindow.loadFile('settings.html');
};

ipcMain.on('open-settings-window', () => {
    if (settingsWindow) {
        settingsWindow.focus();
    } else {
        createSettingsWindow(win);
    }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const tabsFilePath = path.join(app.getPath('userData'), 'tabs.json');

ipcMain.handle('get-tabs', async () => {
  try {
    return fs.readFileSync(tabsFilePath, 'utf-8');
  } catch (error) {
    // If the file doesn't exist, return default tabs
    return JSON.stringify([
      { id: 'home', name: 'Accueil' }
    ]);
  }
});

ipcMain.handle('save-tabs', async (event, tabs) => {
  fs.writeFileSync(tabsFilePath, JSON.stringify(tabs, null, 2));
});

const contentFilePath = (tabId) => path.join(app.getPath('userData'), `${tabId}.html`);

ipcMain.handle('get-tab-content', async (event, tabId) => {
    try {
        return fs.readFileSync(contentFilePath(tabId), 'utf-8');
    } catch (error) {
        return '';
    }
});

ipcMain.handle('save-tab-content', async (event, { tabId, content }) => {
    fs.writeFileSync(contentFilePath(tabId), content);
});

const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('get-settings', async () => {
    try {
        return fs.readFileSync(settingsFilePath, 'utf-8');
    } catch (error) {
        return JSON.stringify({});
    }
});

ipcMain.handle('save-settings', async (event, settings) => {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
});
