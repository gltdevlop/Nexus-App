const { shell, dialog } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');

module.exports = function (ipcMain, userDataPath) {
    const webdavConfigPath = path.join(userDataPath, 'webdav.json');

    let webdavLib; // Cache for the library

    const getWebDAVClient = async () => {
        if (!webdavLib) {
            webdavLib = await import("webdav");
        }
        const { createClient } = webdavLib;

        if (!fs.existsSync(webdavConfigPath)) return null;
        try {
            const config = JSON.parse(fs.readFileSync(webdavConfigPath, 'utf8'));
            if (!config.url || !config.username || !config.password) return null;
            return createClient(config.url, {
                username: config.username,
                password: config.password
            });
        } catch (e) {
            console.error("Error creating WebDAV client", e);
            return null;
        }
    };

    ipcMain.handle('webdav-get-config', async () => {
        if (!fs.existsSync(webdavConfigPath)) return null;
        try {
            return JSON.parse(fs.readFileSync(webdavConfigPath, 'utf8'));
        } catch (e) { return null; }
    });

    ipcMain.handle('save-webdav-config', async (event, config) => {
        try {
            fs.writeFileSync(webdavConfigPath, JSON.stringify(config, null, 2));
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('webdav-ls', async (event, remotePath) => {
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");
        try {
            const items = await client.getDirectoryContents(remotePath);
            return items;
        } catch (e) {
            console.error("WebDAV Ls Error:", e);
            throw e; // Renderer will catch
        }
    });

    ipcMain.handle('webdav-open', async (event, remotePath) => {
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");

        try {
            const buffer = await client.getFileContents(remotePath);
            // Créer un fichier temporaire
            const tempDir = os.tmpdir();
            const fileName = path.basename(remotePath);
            const localPath = path.join(tempDir, fileName);

            fs.writeFileSync(localPath, buffer);

            // Ouvrir avec l'app par défaut
            await shell.openPath(localPath);
            return { success: true, localPath };
        } catch (e) {
            console.error("WebDAV Open Error:", e);
            throw e;
        }
    });

    ipcMain.handle('webdav-download', async (event, remotePath) => {
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");

        try {
            // Demander à l'utilisateur où sauvegarder
            const fileName = path.basename(remotePath);
            const { filePath } = await dialog.showSaveDialog({
                defaultPath: fileName
            });

            if (filePath) {
                // Get file info to know the size
                const items = await client.getDirectoryContents(path.dirname(remotePath));
                const fileInfo = items.find(item => item.filename === remotePath);
                const fileSize = fileInfo ? fileInfo.size : 0;

                let downloadedBytes = 0;

                // Get file as stream
                const stream = client.createReadStream(remotePath);
                const writeStream = fs.createWriteStream(filePath);

                // Track download progress
                stream.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (fileSize > 0) {
                        const progress = Math.round((downloadedBytes / fileSize) * 100);
                        event.sender.send('download-progress', {
                            filename: fileName,
                            progress,
                            downloadedBytes,
                            totalBytes: fileSize
                        });
                    }
                });

                // Pipe to file
                await new Promise((resolve, reject) => {
                    stream.pipe(writeStream);
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                    stream.on('error', reject);
                });

                // Send 100% completion
                event.sender.send('download-progress', {
                    filename: fileName,
                    progress: 100,
                    downloadedBytes: fileSize,
                    totalBytes: fileSize
                });

                return { success: true };
            }
            return { success: false, canceled: true };
        } catch (e) {
            console.error("WebDAV Download Error:", e);
            throw e;
        }
    });

    ipcMain.handle('webdav-delete', async (event, remotePath) => {
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");
        try {
            await client.deleteFile(remotePath);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('webdav-rename', async (event, params) => {
        const { oldPath, newPath } = params;
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");
        try {
            await client.moveFile(oldPath, newPath);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('webdav-mkdir', async (event, remotePath) => {
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");
        try {
            await client.createDirectory(remotePath);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('webdav-upload-file', async (event, remoteDir) => {
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");

        const { filePaths } = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections']
        });

        if (filePaths && filePaths.length > 0) {
            try {
                for (const localPath of filePaths) {
                    const filename = path.basename(localPath);
                    const remotePath = path.posix.join(remoteDir, filename);

                    // Get file size for progress tracking
                    const stat = fs.statSync(localPath);
                    const fileSize = stat.size;
                    let uploadedBytes = 0;

                    // Create read stream
                    const fileStream = fs.createReadStream(localPath);

                    // Create write stream to WebDAV (true streaming!)
                    const writeStream = client.createWriteStream(remotePath);

                    // Track progress by monitoring the read stream
                    fileStream.on('data', (chunk) => {
                        uploadedBytes += chunk.length;
                        const progress = Math.round((uploadedBytes / fileSize) * 100);
                        event.sender.send('upload-progress', {
                            filename: filename,
                            progress
                        });
                    });

                    // Pipe the file stream to WebDAV write stream
                    await new Promise((resolve, reject) => {
                        fileStream.pipe(writeStream);
                        writeStream.on('finish', resolve);
                        writeStream.on('error', reject);
                        fileStream.on('error', reject);
                    });

                    // Ensure 100% is sent
                    event.sender.send('upload-progress', {
                        filename: filename,
                        progress: 100
                    });
                }
                return { success: true };
            } catch (e) {
                console.error("WebDAV Upload Error:", e);
                return { success: false, error: e.message };
            }
        }
        return { success: false, canceled: true };
    });

    async function uploadDirectoryRecursive(client, localPath, remotePath) {
        // Ensure remote dir exists
        try {
            if (await client.exists(remotePath) === false) {
                await client.createDirectory(remotePath);
            }
        } catch (e) {
            // Ignore error if it means directory already exists or cannot check
            console.warn("Create directory error (ignored):", e.message);
        }

        const items = fs.readdirSync(localPath);
        for (const item of items) {
            if (item === '.DS_Store') continue; // Skip MacOS junk

            const itemLocalPath = path.join(localPath, item);
            const itemRemotePath = path.posix.join(remotePath, item);
            const stat = fs.statSync(itemLocalPath);

            if (stat.isDirectory()) {
                await uploadDirectoryRecursive(client, itemLocalPath, itemRemotePath);
            } else {
                const data = fs.readFileSync(itemLocalPath);
                await client.putFileContents(itemRemotePath, data);
            }
        }
    }

    ipcMain.handle('webdav-upload-directory', async (event, remoteDir) => {
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");

        const { filePaths } = await dialog.showOpenDialog({
            properties: ['openDirectory']
        });

        if (filePaths && filePaths.length > 0) {
            const localPath = filePaths[0]; // The folder selected by user
            const folderName = path.basename(localPath);
            const remotePath = path.posix.join(remoteDir, folderName);

            try {
                await uploadDirectoryRecursive(client, localPath, remotePath);
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }
        return { success: false, canceled: true };
    });

    ipcMain.handle('webdav-upload-paths', async (event, params) => {
        const { remoteDir, localPaths } = params;
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");

        try {
            for (const localPath of localPaths) {
                const stat = fs.statSync(localPath);
                const basename = path.basename(localPath);
                const remotePath = path.posix.join(remoteDir, basename);

                if (stat.isDirectory()) {
                    await uploadDirectoryRecursive(client, localPath, remotePath);
                } else {
                    // Upload file with progress tracking
                    const fileSize = stat.size;
                    let uploadedBytes = 0;

                    // Create read stream
                    const fileStream = fs.createReadStream(localPath);

                    // Create write stream to WebDAV (true streaming!)
                    const writeStream = client.createWriteStream(remotePath);

                    // Track progress
                    fileStream.on('data', (chunk) => {
                        uploadedBytes += chunk.length;
                        const progress = Math.round((uploadedBytes / fileSize) * 100);
                        event.sender.send('upload-progress', {
                            filename: basename,
                            progress
                        });
                    });

                    // Pipe the file stream to WebDAV write stream
                    await new Promise((resolve, reject) => {
                        fileStream.pipe(writeStream);
                        writeStream.on('finish', resolve);
                        writeStream.on('error', reject);
                        fileStream.on('error', reject);
                    });

                    // Ensure 100% is sent
                    event.sender.send('upload-progress', {
                        filename: basename,
                        progress: 100
                    });
                }
            }
            return { success: true };
        } catch (e) {
            console.error("WebDAV Upload Paths Error:", e);
            return { success: false, error: e.message };
        }
    });

    // Helper for recursive download
    async function downloadDirectoryRecursive(client, remotePath, localPath) {
        if (!fs.existsSync(localPath)) fs.mkdirSync(localPath);

        const items = await client.getDirectoryContents(remotePath);
        for (const item of items) {
            const itemLocalPath = path.join(localPath, item.basename);
            if (item.type === 'directory') {
                await downloadDirectoryRecursive(client, item.filename, itemLocalPath);
            } else {
                const buffer = await client.getFileContents(item.filename);
                fs.writeFileSync(itemLocalPath, buffer);
            }
        }
    }

    ipcMain.handle('webdav-download-directory', async (event, remotePath) => {
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");

        const { filePaths } = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory', 'promptToCreate']
        });

        if (filePaths && filePaths.length > 0) {
            const targetLocalRoot = filePaths[0];
            const folderName = path.basename(remotePath);
            const finalPath = path.join(targetLocalRoot, folderName);

            try {
                await downloadDirectoryRecursive(client, remotePath, finalPath);
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }
        return { success: false, canceled: true };
    });

    // Copy file within WebDAV
    ipcMain.handle('webdav-copy-file', async (event, params) => {
        const { sourcePath, destPath } = params;
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");
        try {
            await client.copyFile(sourcePath, destPath);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // Download file as buffer (for cross-service copy)
    ipcMain.handle('webdav-download-file-buffer', async (event, remotePath) => {
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");
        try {
            const buffer = await client.getFileContents(remotePath);
            // Convert to Uint8Array for IPC serialization
            return new Uint8Array(buffer);
        } catch (e) {
            throw e;
        }
    });

    // Upload file from buffer (for cross-service copy)
    ipcMain.handle('webdav-upload-file-buffer', async (event, params) => {
        const { remoteDir, fileName, buffer } = params;
        const client = await getWebDAVClient();
        if (!client) throw new Error("Non configuré");
        try {
            const remotePath = path.posix.join(remoteDir, fileName);
            await client.putFileContents(remotePath, buffer);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
};
