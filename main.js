const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');

// INTERNAL MODULES
const setupTodo = require('./internal/todo');
const setupWebdav = require('./internal/webdav');
const setupGdrive = require('./internal/gdrive');
const setupCalendar = require('./internal/calendar');
const setupAi = require('./internal/ai');

// --- Chemins de sauvegarde ---
const userDataPath = app.getPath('userData');
const servicesFilePath = path.join(userDataPath, 'services.json');
const firstUseFilePath = path.join(userDataPath, 'firstUse.json');

// --- Auto-Updater Configuration ---
let mainWindow;

// Configure auto-updater
autoUpdater.autoDownload = false; // Don't auto-download, ask user first
autoUpdater.autoInstallOnAppQuit = true;

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available. Current version is:', info.version);
});

autoUpdater.on('error', (err) => {
  console.error('Error in auto-updater:', err);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', err.message);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
  if (mainWindow) {
    mainWindow.webContents.send('download-progress', {
      percent: progressObj.percent,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', {
      version: info.version
    });
  }
});

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  // Re-define is redundant but harmless, keeping variables in scope if needed.

  createWindow();

  // Initialize Internal Modules
  setupTodo(ipcMain, userDataPath);
  setupWebdav(ipcMain, userDataPath);
  setupGdrive(ipcMain, userDataPath);
  setupCalendar(ipcMain, userDataPath);
  setupAi(ipcMain, userDataPath);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
  });

  // --- Communication IPC pour les Services ---

  const defaultServices = [
    {
      name: "ToDo",
      url: "internal://todo"
    },
    {
      name: "Calendrier",
      url: "internal://calendar"
    },
    {
      name: "Fichiers WebDAV",
      url: "internal://files"
    },
    {
      name: "Plus de services",
      url: "internal://add-service"
    }
  ];

  ipcMain.handle('get-services', async () => {
    if (!fs.existsSync(servicesFilePath)) {
      // Le fichier n'existe pas, on le crée avec les services par défaut
      fs.writeFileSync(servicesFilePath, JSON.stringify(defaultServices, null, 2));
      return defaultServices;
    }

    try {
      const data = fs.readFileSync(servicesFilePath, 'utf8');
      const services = JSON.parse(data);

      let changed = false;

      // Migration: Renommer l'ancien nom "Fichiers" ou "Fichier actuel" en "Fichier WebDAV"
      services.forEach(s => {
        if (s.url === 'internal://files' && (s.name === 'Fichiers' || s.name === 'Fichier actuel')) {
          s.name = 'Fichiers WebDAV';
          changed = true;
        }
      });

      // Vérifie si le service ToDo est déjà dans la liste
      const hasTodoService = services.some(service => service.url === 'internal://todo');
      if (!hasTodoService) {
        services.unshift({ name: "ToDo", url: "internal://todo" });
        changed = true;
      }

      // Vérifie si le service Files est déjà dans la liste
      const hasFilesService = services.some(service => service.url === 'internal://files');
      if (!hasFilesService) {
        services.splice(1, 0, { name: "Fichiers WebDAV", url: "internal://files" });
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(servicesFilePath, JSON.stringify(services, null, 2), 'utf8');
      }
      return services;
    } catch (error) {
      console.error("Erreur de parsing pour services.json:", error);
      // Le fichier est corrompu, on le sauvegarde et on repart de zéro.
      const backupPath = servicesFilePath + '.bak';
      fs.renameSync(servicesFilePath, backupPath);
      console.log(`Fichier corrompu sauvegardé dans ${backupPath}`);
      // On repart avec les services par défaut
      fs.writeFileSync(servicesFilePath, JSON.stringify(defaultServices, null, 2));
      return defaultServices;
    }
  });

  ipcMain.handle('save-services', async (event, services) => {
    try {
      fs.writeFileSync(servicesFilePath, JSON.stringify(services, null, 2), 'utf8');
      return { success: true };
    } catch (error) {
      console.error("Erreur (save-services):", error);
      return { success: false, error: error.message };
    }
  });

  // --- First Use Handlers ---
  ipcMain.handle('check-first-use', async () => {
    return !fs.existsSync(firstUseFilePath);
  });

  ipcMain.handle('complete-first-use', async () => {
    try {
      fs.writeFileSync(firstUseFilePath, JSON.stringify({ completed: true, date: new Date().toISOString() }, null, 2));
      return { success: true };
    } catch (error) {
      console.error("Erreur (complete-first-use):", error);
      return { success: false, error: error.message };
    }
  });

  // --- Get User Name ---
  ipcMain.handle('get-user-name', async () => {
    try {
      const username = os.userInfo().username;
      // Try to extract first name (before space or dot)
      const firstName = username.split(/[\s._]/)[0];
      // Capitalize first letter
      return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    } catch (error) {
      console.error("Erreur (get-user-name):", error);
      return 'utilisateur';
    }
  });

  // --- Auto-Update IPC Handlers ---
  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error('Error downloading update:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('open-release-page', () => {
    shell.openExternal('https://github.com/gltdevlop/Nexus-App/releases/latest');
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    }
  });

  // Check if this is the first use
  const isFirstUse = !fs.existsSync(firstUseFilePath);

  if (isFirstUse) {
    mainWindow.loadFile('onboarding.html');
  } else {
    mainWindow.loadFile('index.html');
  }

  // Check for updates after window is ready (only if not first use)
  if (!isFirstUse) {
    mainWindow.webContents.once('did-finish-load', () => {
      // Wait 3 seconds before checking for updates to let the app fully load
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => {
          console.error('Failed to check for updates:', err);
        });
      }, 3000);
    });
  }

  // mainWindow.webContents.openDevTools();
}
