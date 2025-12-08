window.addEventListener('DOMContentLoaded', async () => {
    const tabsContainer = document.getElementById('tabs');
    const contentArea = document.getElementById('content-area');
    const addTabButton = document.getElementById('add-tab-button');

    let tabs = [];

    const activateTab = (tabElement) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));

        tabElement.classList.add('active');
        const tabId = tabElement.getAttribute('data-tab');
        const contentElement = document.getElementById(tabId);
        contentElement.classList.add('active');
    };

    const createTabElement = (tab) => {
        const tabElement = document.createElement('li');
        tabElement.classList.add('tab');
        tabElement.setAttribute('data-tab', tab.id);
        tabElement.innerHTML = `
            <span>${tab.name}</span>
        `;

        tabElement.addEventListener('click', async () => {
            const tabId = tabElement.getAttribute('data-tab');
            const content = await window.tabs.getContent(tabId);
            const contentElement = document.getElementById(tabId);
            contentElement.innerHTML = content;
            activateTab(tabElement);
        });

        tabElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            window.tabs.showContextMenu(tab.id);
        });

        return tabElement;
    };

    const createContentElement = (tab) => {
        const contentElement = document.createElement('div');
        contentElement.id = tab.id;
        contentElement.classList.add('content');
        contentElement.setAttribute('contenteditable', 'true');
        if (tab.id === 'home') {
            contentElement.innerHTML = `<h1>Bienvenue !</h1><p>Ceci est la page d'accueil.</p><p>We are using Node.js <span id="node-version"></span>, Chromium <span id="chrome-version"></span>, and Electron <span id="electron-version"></span>.</p>`;
        } else {
            contentElement.innerHTML = `<h1>${tab.name}</h1><p>Contenu de l'onglet ${tab.name}.</p>`;
        }
        return contentElement;
    };

    const renderTabs = () => {
        tabsContainer.innerHTML = '';
        contentArea.innerHTML = '';

        tabs.forEach(tab => {
            const tabElement = createTabElement(tab);
            const contentElement = createContentElement(tab);
            tabsContainer.appendChild(tabElement);
            contentArea.appendChild(contentElement);
        });

        const saveButton = document.createElement('button');
        saveButton.id = 'save-button';
        saveButton.textContent = 'Enregistrer';
        contentArea.appendChild(saveButton);

        saveButton.addEventListener('click', () => {
            const activeTab = document.querySelector('.tab.active');
            if (activeTab) {
                const tabId = activeTab.getAttribute('data-tab');
                const contentElement = document.getElementById(tabId);
                window.tabs.saveContent(tabId, contentElement.innerHTML);
            }
        });

        if (tabs.length > 0) {
            activateTab(tabsContainer.firstChild);
        }

        // Set version numbers
        const setVersion = (selector, version) => {
            const element = document.getElementById(selector);
            if (element) {
                element.innerText = version;
            }
        };

        for (const dependency of ['chrome', 'node', 'electron']) {
            if (window.versions && typeof window.versions[dependency] === 'function') {
                setVersion(`${dependency}-version`, window.versions[dependency]());
            }
        }
    };

    const addTab = () => {
        const tabName = prompt('Entrez le nom du nouvel onglet:');
        if (tabName) {
            const newTab = {
                id: `tab-${Date.now()}`,
                name: tabName,
            };
            tabs.push(newTab);
            window.tabs.save(tabs);
            renderTabs();
        }
    };

    const deleteTab = (tabId) => {
        tabs = tabs.filter(tab => tab.id !== tabId);
        window.tabs.save(tabs);
        renderTabs();
    };

    const addTabButton = document.getElementById('add-tab-button');
    addTabButton.addEventListener('click', addTab);

    const settingsButton = document.getElementById('settings-button');
    settingsButton.addEventListener('click', () => {
        window.settings.open();
    });

    window.tabs.onDelete((tabId) => {
        deleteTab(tabId);
    });

    const savedTabs = await window.tabs.get();
    tabs = JSON.parse(savedTabs);
    renderTabs();
});
