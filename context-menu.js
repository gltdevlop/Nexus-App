const { Menu, MenuItem } = require('electron');

const createTabContextMenu = (win, tabId) => {
    const menu = new Menu();
    menu.append(new MenuItem({
        label: 'Supprimer l\'onglet',
        click: () => {
            win.webContents.send('delete-tab', tabId);
        }
    }));
    return menu;
};

module.exports = { createTabContextMenu };
