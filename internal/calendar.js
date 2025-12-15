const { shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

module.exports = function (ipcMain, userDataPath) {
    const calendarFilePath = path.join(userDataPath, 'calendar.json');
    const gcalConfigPath = path.join(userDataPath, 'gcal.json');
    const gcalTokensPath = path.join(userDataPath, 'gcal-tokens.json');

    let oauth2Client = null;

    // --- HELPER: Get Google Calendar Client ---
    const getGCalClient = async () => {
        if (oauth2Client) return oauth2Client;

        if (!fs.existsSync(gcalConfigPath)) return null;
        try {
            const config = JSON.parse(fs.readFileSync(gcalConfigPath, 'utf8'));
            if (!config.clientId || !config.clientSecret) return null;

            oauth2Client = new google.auth.OAuth2(
                config.clientId,
                config.clientSecret,
                'http://localhost:3001/oauth2callback'
            );

            // Load tokens if exist
            if (fs.existsSync(gcalTokensPath)) {
                const tokens = JSON.parse(fs.readFileSync(gcalTokensPath, 'utf8'));
                oauth2Client.setCredentials(tokens);
            }

            return oauth2Client;
        } catch (e) {
            console.error("Error creating Google Calendar client", e);
            return null;
        }
    };

    // --- LOCAL CALENDAR EVENTS ---

    ipcMain.handle('get-calendar-events', async () => {
        const emptyData = { events: [] };
        if (!fs.existsSync(calendarFilePath)) {
            return emptyData;
        }

        try {
            const data = fs.readFileSync(calendarFilePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error("Error parsing calendar.json:", error);
            const backupPath = calendarFilePath + '.bak';
            fs.renameSync(calendarFilePath, backupPath);
            console.log(`Corrupted file backed up to ${backupPath}`);
            return emptyData;
        }
    });

    ipcMain.handle('save-calendar-events', async (event, calendarData) => {
        try {
            fs.writeFileSync(calendarFilePath, JSON.stringify(calendarData, null, 2), 'utf8');
            return { success: true };
        } catch (error) {
            console.error("Error (save-calendar-events):", error);
            return { success: false, error: error.message };
        }
    });

    // --- GOOGLE CALENDAR CONFIG & AUTH ---

    ipcMain.handle('gcal-get-config', async () => {
        let config = {};
        if (fs.existsSync(gcalConfigPath)) {
            try {
                config = JSON.parse(fs.readFileSync(gcalConfigPath, 'utf8'));
            } catch (e) {
                console.error("Error reading gcal config:", e);
            }
        }
        // Check if authenticated
        let connected = false;
        if (fs.existsSync(gcalTokensPath)) connected = true;

        return { ...config, connected };
    });

    ipcMain.handle('gcal-save-config', async (event, newConfig) => {
        const data = {
            clientId: newConfig.clientId,
            clientSecret: newConfig.clientSecret,
            enabled: newConfig.enabled || false,
            selectedCalendars: newConfig.selectedCalendars || []
        };
        fs.writeFileSync(gcalConfigPath, JSON.stringify(data, null, 2));
        oauth2Client = null; // force reload
        return { success: true };
    });

    let authServer = null;

    ipcMain.handle('gcal-auth', async () => {
        const client = await getGCalClient();
        if (!client) return { success: false, error: "Client ID/Secret missing" };

        const authUrl = client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar'],
        });

        // Close existing server if any
        if (authServer) {
            try { authServer.close(); } catch (e) { }
            authServer = null;
        }

        // Start local server to catch callback
        return new Promise((resolve) => {
            authServer = http.createServer(async (req, res) => {
                if (req.url.startsWith('/oauth2callback')) {
                    const qs = new url.URL(req.url, 'http://localhost:3001').searchParams;
                    const code = qs.get('code');
                    res.end('Authentication successful! You can close this window and return to the app.');
                    if (authServer) authServer.close();
                    authServer = null;

                    try {
                        const { tokens } = await client.getToken(code);
                        client.setCredentials(tokens);
                        fs.writeFileSync(gcalTokensPath, JSON.stringify(tokens, null, 2));
                        resolve({ success: true });
                    } catch (e) {
                        console.error("Error getting tokens:", e);
                        resolve({ success: false, error: e.message });
                    }
                }
            });

            authServer.on('error', (e) => {
                console.error("Auth Server Error:", e);
                resolve({ success: false, error: "Erreur serveur local (Port 3001 occupé ?): " + e.message });
            });

            authServer.listen(3001, async () => {
                await shell.openExternal(authUrl);
            });
        });
    });

    ipcMain.handle('gcal-disconnect', async () => {
        if (fs.existsSync(gcalTokensPath)) fs.unlinkSync(gcalTokensPath);
        oauth2Client = null;
        return { success: true };
    });

    // --- GOOGLE CALENDAR EVENTS ---

    ipcMain.handle('gcal-list-calendars', async () => {
        const client = await getGCalClient();
        if (!client) return { success: false, error: "Not configured" };

        try {
            const calendar = google.calendar({ version: 'v3', auth: client });
            const res = await calendar.calendarList.list();

            const calendars = res.data.items.map(cal => ({
                id: cal.id,
                name: cal.summary,
                description: cal.description || '',
                primary: cal.primary || false,
                accessRole: cal.accessRole,
                backgroundColor: cal.backgroundColor
            }));

            return { success: true, calendars };
        } catch (e) {
            console.error("Error listing Google Calendars:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('gcal-fetch-events', async (event, params) => {
        const { timeMin, timeMax, calendarIds } = params;
        const client = await getGCalClient();
        if (!client) return { success: false, error: "Not configured" };

        try {
            const calendar = google.calendar({ version: 'v3', auth: client });
            const calendarsToFetch = calendarIds && calendarIds.length > 0 ? calendarIds : ['primary'];

            // Fetch events from all selected calendars
            const allEvents = [];
            for (const calendarId of calendarsToFetch) {
                try {
                    const res = await calendar.events.list({
                        calendarId: calendarId,
                        timeMin: timeMin,
                        timeMax: timeMax,
                        singleEvents: true,
                        orderBy: 'startTime',
                    });

                    const events = res.data.items.map(event => ({
                        id: event.id,
                        calendarId: calendarId,
                        title: event.summary || '(No title)',
                        description: event.description || '',
                        start: event.start.dateTime || event.start.date,
                        end: event.end.dateTime || event.end.date,
                        colorId: event.colorId,
                        source: 'google'
                    }));

                    allEvents.push(...events);
                } catch (e) {
                    console.error(`Error fetching events from calendar ${calendarId}:`, e);
                }
            }

            return { success: true, events: allEvents };
        } catch (e) {
            console.error("Error fetching Google Calendar events:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('gcal-create-event', async (event, eventData) => {
        const client = await getGCalClient();
        if (!client) return { success: false, error: "Not configured" };

        try {
            const calendar = google.calendar({ version: 'v3', auth: client });

            const googleEvent = {
                summary: eventData.title,
                description: eventData.description || '',
            };

            // Handle all-day vs timed events
            if (eventData.isAllDay) {
                // All-day events use 'date' field (YYYY-MM-DD format)
                googleEvent.start = {
                    date: eventData.start,
                    timeZone: 'Europe/Paris',
                };
                googleEvent.end = {
                    date: eventData.end,
                    timeZone: 'Europe/Paris',
                };
            } else {
                // Timed events use 'dateTime' field (ISO 8601 format)
                googleEvent.start = {
                    dateTime: eventData.start,
                    timeZone: 'Europe/Paris',
                };
                googleEvent.end = {
                    dateTime: eventData.end,
                    timeZone: 'Europe/Paris',
                };
            }

            // Add recurrence if specified
            if (eventData.recurrence && eventData.recurrence.length > 0) {
                googleEvent.recurrence = eventData.recurrence.map(rule => `RRULE:${rule}`);
            }

            const res = await calendar.events.insert({
                calendarId: eventData.calendarId || 'primary',
                resource: googleEvent,
            });

            return { success: true, event: res.data };
        } catch (e) {
            console.error("Error creating Google Calendar event:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('gcal-update-event', async (event, params) => {
        const { eventId, eventData, calendarId } = params;
        const client = await getGCalClient();
        if (!client) return { success: false, error: "Not configured" };

        try {
            const calendar = google.calendar({ version: 'v3', auth: client });

            const googleEvent = {
                summary: eventData.title,
                description: eventData.description || '',
            };

            // Handle all-day vs timed events
            if (eventData.isAllDay) {
                // All-day events use 'date' field (YYYY-MM-DD format)
                googleEvent.start = {
                    date: eventData.start,
                    timeZone: 'Europe/Paris',
                };
                googleEvent.end = {
                    date: eventData.end,
                    timeZone: 'Europe/Paris',
                };
            } else {
                // Timed events use 'dateTime' field (ISO 8601 format)
                googleEvent.start = {
                    dateTime: eventData.start,
                    timeZone: 'Europe/Paris',
                };
                googleEvent.end = {
                    dateTime: eventData.end,
                    timeZone: 'Europe/Paris',
                };
            }

            const res = await calendar.events.update({
                calendarId: calendarId || 'primary',
                eventId: eventId,
                resource: googleEvent,
            });

            return { success: true, event: res.data };
        } catch (e) {
            console.error("Error updating Google Calendar event:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('gcal-delete-event', async (event, params) => {
        const { eventId, calendarId } = params;
        const client = await getGCalClient();
        if (!client) return { success: false, error: "Not configured" };

        try {
            const calendar = google.calendar({ version: 'v3', auth: client });
            await calendar.events.delete({
                calendarId: calendarId || 'primary',
                eventId: eventId,
            });

            return { success: true };
        } catch (e) {
            console.error("Error deleting Google Calendar event:", e);
            return { success: false, error: e.message };
        }
    });
};
