window.addEventListener('DOMContentLoaded', () => {
    const settingsForm = document.getElementById('settings-form');

    settingsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const webdavUrl = document.getElementById('webdav-url').value;
        const webdavUsername = document.getElementById('webdav-username').value;
        const webdavPassword = document.getElementById('webdav-password').value;

        // Save the settings
        window.settings.save({
            webdav: {
                url: webdavUrl,
                username: webdavUsername,
                password: webdavPassword,
            },
        });
    });

    // Load the settings
    window.settings.get().then((settings) => {
        if (settings.webdav) {
            document.getElementById('webdav-url').value = settings.webdav.url;
            document.getElementById('webdav-username').value = settings.webdav.username;
            document.getElementById('webdav-password').value = settings.webdav.password;
        }
    });
});
