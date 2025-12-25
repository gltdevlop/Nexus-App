const { shell, dialog, protocol, net } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

module.exports = function (ipcMain, userDataPath) {
    const configPath = path.join(userDataPath, 'gdrive.json');
    const tokensPath = path.join(userDataPath, 'gdrive-tokens.json');

    let oauth2Client = null;

    // --- HELPER: Get Client ---
    const getClient = async () => {
        if (oauth2Client) return oauth2Client;

        if (!fs.existsSync(configPath)) return null;
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (!config.clientId || !config.clientSecret) return null;

            oauth2Client = new google.auth.OAuth2(
                config.clientId,
                config.clientSecret,
                'http://localhost:3000/oauth2callback'
            );

            // Load tokens if exist
            if (fs.existsSync(tokensPath)) {
                const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
                oauth2Client.setCredentials(tokens);
            }

            return oauth2Client;
        } catch (e) {
            console.error("Error creating GDrive client", e);
            return null;
        }
    };

    // --- IPC: Config & Auth ---

    ipcMain.handle('gdrive-get-config', async () => {
        let config = {};
        if (fs.existsSync(configPath)) {
            try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { }
        }
        // Check if authenticated
        let connected = false;
        if (fs.existsSync(tokensPath)) connected = true; // Primitive check

        return { ...config, connected };
    });

    ipcMain.handle('gdrive-save-config', async (event, newConfig) => {
        // Only save Client ID / Secret
        const data = {
            clientId: newConfig.clientId,
            clientSecret: newConfig.clientSecret,
            showHiddenFiles: newConfig.showHiddenFiles
        };
        fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
        oauth2Client = null; // force reload
        return { success: true };
    });

    let authServer = null;

    ipcMain.handle('gdrive-auth', async () => {
        const client = await getClient();
        if (!client) return { success: false, error: "Client ID/Secret missing" };

        const authUrl = client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/drive'],
        });

        // Close existing server if any (e.g. from failed previous attempt)
        if (authServer) {
            try { authServer.close(); } catch (e) { }
            authServer = null;
        }

        // Start local server to catch callback
        return new Promise((resolve) => {
            authServer = http.createServer(async (req, res) => {
                if (req.url.startsWith('/oauth2callback')) {
                    const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
                    const code = qs.get('code');
                    res.end('Authentication successful! You can check the app.');
                    if (authServer) authServer.close();
                    authServer = null;

                    try {
                        const { tokens } = await client.getToken(code);
                        client.setCredentials(tokens);
                        fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
                        resolve({ success: true });
                    } catch (e) {
                        resolve({ success: false, error: e.message });
                    }
                }
            });

            authServer.on('error', (e) => {
                console.error("Auth Server Error:", e);
                resolve({ success: false, error: "Erreur serveur local (Port 3000 occupé ?): " + e.message });
            });

            authServer.listen(3000, async () => {
                await shell.openExternal(authUrl);
            });
        });
    });

    ipcMain.handle('gdrive-disconnect', async () => {
        if (fs.existsSync(tokensPath)) fs.unlinkSync(tokensPath);
        oauth2Client = null;
        return { success: true };
    });


    // --- IPC: File Operations ---

    // Helper: Resolve Path to File ID
    // We strictly assume structure: Root -> Folder -> File
    // This is slow for deep structures but simple for now. 
    async function getFileIdFromPath(drive, pathStr) {
        if (pathStr === '/' || pathStr === '') return 'root';

        const parts = pathStr.split('/').filter(p => p);
        let parentId = 'root';

        for (const part of parts) {
            const res = await drive.files.list({
                q: `'${parentId}' in parents and name = '${part}' and trashed = false`,
                fields: 'files(id, mimeType)',
            });
            if (res.data.files.length === 0) throw new Error(`Path not found: ${pathStr}`);
            parentId = res.data.files[0].id;
        }
        return parentId;
    }

    ipcMain.handle('gdrive-ls', async (event, remotePath) => {
        const client = await getClient();
        if (!client) throw new Error("Non configuré");
        const drive = google.drive({ version: 'v3', auth: client });

        try {
            const folderId = await getFileIdFromPath(drive, remotePath);
            console.log(`[GDrive LS] Listing folderId: ${folderId} (Path: ${remotePath})`);

            const res = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType, size, modifiedTime)',
                pageSize: 1000
            });

            // Map to generic format matching WebDAV
            return res.data.files.map(f => ({
                filename: path.posix.join(remotePath, f.name), // Full virtual path
                basename: f.name,
                lastmod: f.modifiedTime,
                size: parseInt(f.size || 0),
                type: f.mimeType === 'application/vnd.google-apps.folder' ? 'directory' : 'file',
                mime: f.mimeType
            }));
        } catch (e) {
            console.error("GDrive LS Error:", e);
            if (e.response && e.response.data) {
                console.error("GDrive Error Details:", JSON.stringify(e.response.data, null, 2));
            }
            throw e;
        }
    });

    ipcMain.handle('gdrive-open', async (event, remotePath) => {
        const client = await getClient();
        if (!client) throw new Error("Non configuré");
        const drive = google.drive({ version: 'v3', auth: client });

        try {
            const fileId = await getFileIdFromPath(drive, remotePath);

            // Check if it's a Google Doc/Sheet (cannot download directly, need export)
            const fileMeta = await drive.files.get({ fileId, fields: 'mimeType, name' });

            let destPath = path.join(os.tmpdir(), fileMeta.data.name);
            let destStream = fs.createWriteStream(destPath);
            let res;

            if (fileMeta.data.mimeType.startsWith('application/vnd.google-apps.')) {
                // Export PDF for docs? Or Open in Browser?
                // For simplicity, OPEN IN BROWSER for native Google types
                const webLinkRes = await drive.files.get({ fileId, fields: 'webViewLink' });
                await shell.openExternal(webLinkRes.data.webViewLink);
                return { success: true, openedBrowser: true };
            } else {
                res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
                await new Promise((resolve, reject) => {
                    res.data
                        .on('end', () => resolve())
                        .on('error', err => reject(err))
                        .pipe(destStream);
                });
                await shell.openPath(destPath);
                return { success: true, localPath: destPath };
            }

        } catch (e) {
            console.error("GDrive Open Error:", e);
            throw e;
        }
    });

    ipcMain.handle('gdrive-download', async (event, remotePath) => {
        const client = await getClient();
        const drive = google.drive({ version: 'v3', auth: client });

        try {
            const fileId = await getFileIdFromPath(drive, remotePath);
            const fileName = path.basename(remotePath);

            const { filePath } = await dialog.showSaveDialog({
                defaultPath: fileName
            });

            if (filePath) {
                // Get file metadata to know the size
                const fileMeta = await drive.files.get({ fileId, fields: 'size' });
                const fileSize = parseInt(fileMeta.data.size || 0);
                let downloadedBytes = 0;

                const destStream = fs.createWriteStream(filePath);
                const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

                // Track download progress
                res.data.on('data', (chunk) => {
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

                await new Promise((resolve, reject) => {
                    res.data
                        .on('end', () => resolve())
                        .on('error', err => reject(err))
                        .pipe(destStream);
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
            console.error("GDrive Download Error:", e);
            throw e;
        }
    });

    ipcMain.handle('gdrive-upload-file', async (event, remoteDir) => {
        const client = await getClient();
        const drive = google.drive({ version: 'v3', auth: client });

        const { filePaths } = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
        if (!filePaths || filePaths.length === 0) return { success: false, canceled: true };

        try {
            const parentId = await getFileIdFromPath(drive, remoteDir);

            for (const localPath of filePaths) {
                const name = path.basename(localPath);

                // Get file size for progress
                const stats = fs.statSync(localPath);
                const fileSize = stats.size;
                let uploadedBytes = 0;

                const fileStream = fs.createReadStream(localPath);

                // Monitor stream for progress
                fileStream.on('data', (chunk) => {
                    uploadedBytes += chunk.length;
                    const progress = Math.round((uploadedBytes / fileSize) * 100);
                    event.sender.send('upload-progress', {
                        filename: name,
                        progress
                    });
                });

                const media = {
                    mimeType: 'application/octet-stream',
                    body: fileStream
                };
                await drive.files.create({
                    resource: { name, parents: [parentId] },
                    media: media,
                    fields: 'id'
                });

                // Ensure 100% is sent
                event.sender.send('upload-progress', {
                    filename: name,
                    progress: 100
                });
            }
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('gdrive-upload-directory', async (event, remoteDir) => {
        const client = await getClient();
        const drive = google.drive({ version: 'v3', auth: client });

        const { filePaths } = await dialog.showOpenDialog({
            properties: ['openDirectory']
        });

        if (filePaths && filePaths.length > 0) {
            const localPath = filePaths[0]; // The folder selected by user
            const folderName = path.basename(localPath);

            try {
                const parentId = await getFileIdFromPath(drive, remoteDir);

                // Count total files for progress tracking
                const totalFiles = countFilesInDirectory(localPath);
                const progressTracker = {
                    folderName: folderName,
                    totalFiles: totalFiles,
                    uploadedFiles: 0
                };

                await uploadDirectoryRecursive(drive, event, localPath, parentId, progressTracker);
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }
        return { success: false, canceled: true };
    });

    ipcMain.handle('gdrive-delete', async (event, remotePath) => {
        const client = await getClient();
        const drive = google.drive({ version: 'v3', auth: client });
        try {
            const fileId = await getFileIdFromPath(drive, remotePath);
            await drive.files.delete({ fileId });
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('gdrive-mkdir', async (event, remotePath) => {
        const client = await getClient();
        const drive = google.drive({ version: 'v3', auth: client });
        try {
            const parentPath = path.dirname(remotePath);
            const folderName = path.basename(remotePath);
            const parentId = await getFileIdFromPath(drive, parentPath);

            await drive.files.create({
                resource: {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [parentId]
                },
                fields: 'id'
            });
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('gdrive-rename', async (event, params) => {
        // params: { oldPath, newPath } - In GDrive we just change name.
        // NOTE: We assume newPath is in samedir! Move is harder.
        const { oldPath, newPath } = params;
        const newName = path.basename(newPath);

        const client = await getClient();
        const drive = google.drive({ version: 'v3', auth: client });
        try {
            const fileId = await getFileIdFromPath(drive, oldPath);
            await drive.files.update({
                fileId,
                resource: { name: newName }
            });
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // Copy file within Google Drive
    ipcMain.handle('gdrive-copy-file', async (event, params) => {
        const { sourcePath, destPath } = params;
        const client = await getClient();
        const drive = google.drive({ version: 'v3', auth: client });
        try {
            const sourceFileId = await getFileIdFromPath(drive, sourcePath);
            const destParentPath = path.dirname(destPath);
            const destName = path.basename(destPath);
            const destParentId = await getFileIdFromPath(drive, destParentPath);

            await drive.files.copy({
                fileId: sourceFileId,
                resource: {
                    name: destName,
                    parents: [destParentId]
                }
            });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // Download file as buffer (for cross-service copy)
    ipcMain.handle('gdrive-download-file-buffer', async (event, remotePath) => {
        const client = await getClient();
        const drive = google.drive({ version: 'v3', auth: client });
        try {
            const fileId = await getFileIdFromPath(drive, remotePath);
            const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

            // Collect stream into buffer
            const chunks = [];
            const buffer = await new Promise((resolve, reject) => {
                res.data
                    .on('data', chunk => chunks.push(chunk))
                    .on('end', () => resolve(Buffer.concat(chunks)))
                    .on('error', err => reject(err));
            });

            // Convert to Uint8Array for IPC serialization
            return new Uint8Array(buffer);
        } catch (e) {
            throw e;
        }
    });

    // Upload file from buffer (for cross-service copy)
    ipcMain.handle('gdrive-upload-file-buffer', async (event, params) => {
        const { remoteDir, fileName, buffer } = params;
        const client = await getClient();
        const drive = google.drive({ version: 'v3', auth: client });
        try {
            const parentId = await getFileIdFromPath(drive, remoteDir);
            const { Readable } = require('stream');

            // Ensure buffer is a Buffer object
            const bufferData = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
            const bufferStream = Readable.from(bufferData);

            await drive.files.create({
                resource: { name: fileName, parents: [parentId] },
                media: {
                    mimeType: 'application/octet-stream',
                    body: bufferStream
                },
                fields: 'id'
            });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // Helper: Count total files in directory recursively
    function countFilesInDirectory(dirPath) {
        let count = 0;
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
            if (item === '.DS_Store') continue;
            const itemPath = path.join(dirPath, item);
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
                count += countFilesInDirectory(itemPath);
            } else {
                count++;
            }
        }
        return count;
    }

    // Helper: Upload Directory Recursively with folder-level progress
    async function uploadDirectoryRecursive(drive, event, localPath, parentId, progressTracker) {
        // Create the folder in Google Drive
        const folderName = path.basename(localPath);
        const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        };

        const folderRes = await drive.files.create({
            resource: folderMetadata,
            fields: 'id'
        });
        const newFolderId = folderRes.data.id;

        // Read local directory contents
        const items = fs.readdirSync(localPath);
        for (const item of items) {
            if (item === '.DS_Store') continue; // Skip MacOS junk

            const itemLocalPath = path.join(localPath, item);
            const stat = fs.statSync(itemLocalPath);

            if (stat.isDirectory()) {
                // Recursively upload subdirectory
                await uploadDirectoryRecursive(drive, event, itemLocalPath, newFolderId, progressTracker);
            } else {
                // Upload file without individual progress tracking
                const fileStream = fs.createReadStream(itemLocalPath);

                const media = {
                    mimeType: 'application/octet-stream',
                    body: fileStream
                };

                await drive.files.create({
                    resource: { name: item, parents: [newFolderId] },
                    media: media,
                    fields: 'id'
                });

                // Update folder-level progress
                if (progressTracker) {
                    progressTracker.uploadedFiles++;
                    const progress = Math.round((progressTracker.uploadedFiles / progressTracker.totalFiles) * 100);
                    event.sender.send('upload-progress', {
                        filename: progressTracker.folderName,
                        progress,
                        isFolder: true,
                        current: progressTracker.uploadedFiles,
                        total: progressTracker.totalFiles
                    });
                }
            }
        }
    }



    // NEW: Upload multiple paths (for Drag & Drop)
    ipcMain.handle('gdrive-upload-paths', async (event, params) => {
        const { remoteDir, localPaths } = params;
        const client = await getClient();
        const drive = google.drive({ version: 'v3', auth: client });

        if (!localPaths || localPaths.length === 0) return { success: false, error: "No files provided" };

        try {
            const parentId = await getFileIdFromPath(drive, remoteDir);

            for (const localPath of localPaths) {
                const name = path.basename(localPath);
                const stat = fs.statSync(localPath);

                // Check if directory
                if (stat.isDirectory()) {
                    // Count total files for progress tracking
                    const totalFiles = countFilesInDirectory(localPath);
                    const progressTracker = {
                        folderName: name,
                        totalFiles: totalFiles,
                        uploadedFiles: 0
                    };

                    // Upload directory recursively with progress tracking
                    await uploadDirectoryRecursive(drive, event, localPath, parentId, progressTracker);
                    continue;
                }

                // Get file size for progress
                const stats = fs.statSync(localPath);
                const fileSize = stats.size;
                let uploadedBytes = 0;

                const fileStream = fs.createReadStream(localPath);

                // Monitor stream for progress
                fileStream.on('data', (chunk) => {
                    uploadedBytes += chunk.length;
                    const progress = Math.round((uploadedBytes / fileSize) * 100);
                    event.sender.send('upload-progress', {
                        filename: name,
                        progress
                    });
                });

                const media = {
                    mimeType: 'application/octet-stream',
                    body: fileStream // googleapis reads this stream
                };

                await drive.files.create({
                    resource: { name, parents: [parentId] },
                    media: media,
                    fields: 'id'
                });

                // Ensure 100% is sent
                event.sender.send('upload-progress', {
                    filename: name,
                    progress: 100
                });
            }
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
};
