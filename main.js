const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// --- Chemins de sauvegarde ---
const userDataPath = app.getPath('userData');
const servicesFilePath = path.join(userDataPath, 'services.json');
const todoFilePath = path.join(userDataPath, 'todo.json');


app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  const servicesFilePath = path.join(userDataPath, 'services.json');
  const todoFilePath = path.join(userDataPath, 'todo.json');

  createWindow();
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
      url: "internal://todo" // URL spéciale pour identifier un service interne
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

      // Vérifie si le service ToDo est déjà dans la liste
      const hasTodoService = services.some(service => service.url === 'internal://todo');
      if (!hasTodoService) {
        services.unshift(defaultServices[0]);
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


  // --- Communication IPC pour la ToDo List ---

  ipcMain.handle('get-todos', async () => {
    const emptyTodoData = { lists: [], tasks: [] };
    if (!fs.existsSync(todoFilePath)) {
      return emptyTodoData;
    }

    try {
      const data = fs.readFileSync(todoFilePath, 'utf8');
      const jsonData = JSON.parse(data);

      // Rétrocompatibilité
      if (Array.isArray(jsonData)) {
        const newStructure = { lists: [], tasks: jsonData };
        fs.writeFileSync(todoFilePath, JSON.stringify(newStructure, null, 2), 'utf8');
        return newStructure;
      }
      return jsonData;
    } catch (error) {
      console.error("Erreur de parsing pour todo.json:", error);
      const backupPath = todoFilePath + '.bak';
      fs.renameSync(todoFilePath, backupPath);
      console.log(`Fichier corrompu sauvegardé dans ${backupPath}`);
      return emptyTodoData;
    }
  });

  ipcMain.handle('save-todos', async (event, todoData) => {
    try {
      fs.writeFileSync(todoFilePath, JSON.stringify(todoData, null, 2), 'utf8');
      return { success: true };
    } catch (error) {
      console.error("Erreur (save-todos):", error);
      return { success: false, error: error.message };
    }
  });
});

function createWindow () {
    const mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webviewTag: true,
      }
    });
  
    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools();
  }
