const fs = require('fs');
const path = require('path');

module.exports = function (ipcMain, userDataPath) {
    const todoFilePath = path.join(userDataPath, 'todo.json');

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
};
