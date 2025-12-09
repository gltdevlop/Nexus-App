// Onboarding flow logic
let currentStep = 'step-welcome';
let selectedService = null;
let configuredServices = [];

// Step navigation
function showStep(stepId) {
    document.querySelectorAll('.onboarding-step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById(stepId).classList.add('active');
    currentStep = stepId;
}

// Step 1: Welcome
document.getElementById('btn-start').addEventListener('click', () => {
    showStep('step-service-selection');
});

// Step 2: Service Selection
document.querySelectorAll('.service-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const service = e.currentTarget.dataset.service;
        selectedService = service;

        if (service === 'webdav') {
            showStep('step-webdav-config');
        } else if (service === 'gdrive') {
            showStep('step-gdrive-config');
        }
    });
});

document.getElementById('btn-skip-service').addEventListener('click', () => {
    selectedService = null;
    showStep('step-add-website');
});

// Step 3a: WebDAV Configuration
document.getElementById('btn-save-webdav').addEventListener('click', async () => {
    const url = document.getElementById('webdav-url').value.trim();
    const username = document.getElementById('webdav-username').value.trim();
    const password = document.getElementById('webdav-password').value.trim();

    if (url && username && password) {
        // Save WebDAV config
        await window.api.webdav.saveConfig({
            url,
            username,
            password,
            showHiddenFiles: false
        });

        // Add WebDAV service to list
        configuredServices.push({
            name: "Fichiers WebDAV",
            url: "internal://files"
        });
    }

    showStep('step-add-website');
});

document.getElementById('btn-skip-webdav').addEventListener('click', () => {
    showStep('step-add-website');
});

// Step 3b: Google Drive Configuration
document.getElementById('link-gdrive-console').addEventListener('click', (e) => {
    e.preventDefault();
    require('electron').shell.openExternal('https://console.cloud.google.com/apis/credentials');
});

document.getElementById('btn-gdrive-auth').addEventListener('click', async () => {
    const clientId = document.getElementById('gdrive-client-id').value.trim();
    const clientSecret = document.getElementById('gdrive-client-secret').value.trim();
    const statusEl = document.getElementById('gdrive-status');
    const continueBtn = document.getElementById('btn-save-gdrive');

    if (!clientId || !clientSecret) {
        statusEl.textContent = "⚠️ Veuillez remplir les identifiants";
        statusEl.className = 'status-text error';
        return;
    }

    // Save config first
    await window.api.gdrive.saveConfig({
        clientId,
        clientSecret,
        showHiddenFiles: false
    });

    statusEl.textContent = "Authentification en cours... Veuillez vérifier votre navigateur.";
    statusEl.className = 'status-text';

    const result = await window.api.gdrive.auth();

    if (result.success) {
        statusEl.textContent = "✅ Connecté avec succès !";
        statusEl.className = 'status-text success';
        continueBtn.disabled = false;

        // Add GDrive service to list
        configuredServices.push({
            name: "Fichiers GDrive",
            url: "internal://gdrive"
        });
    } else {
        statusEl.textContent = "❌ Erreur: " + result.error;
        statusEl.className = 'status-text error';
    }
});

document.getElementById('btn-save-gdrive').addEventListener('click', () => {
    showStep('step-add-website');
});

document.getElementById('btn-skip-gdrive').addEventListener('click', () => {
    showStep('step-add-website');
});

// Step 4: Add Website
document.getElementById('btn-save-website').addEventListener('click', async () => {
    const name = document.getElementById('website-name').value.trim();
    const url = document.getElementById('website-url').value.trim();

    if (name && url) {
        try {
            // Validate URL
            new URL(url);

            configuredServices.push({
                name,
                url
            });
        } catch (e) {
            alert("URL invalide. Veuillez entrer une URL valide (ex: https://example.com)");
            return;
        }
    }

    await finishOnboarding();
});

document.getElementById('btn-skip-website').addEventListener('click', async () => {
    await finishOnboarding();
});

// Step 5: Completion
document.getElementById('btn-finish').addEventListener('click', async () => {
    // Mark onboarding as complete
    await window.api.completeFirstUse();

    // Reload to main app
    window.location.href = 'index.html';
});

// Finish onboarding and save services
async function finishOnboarding() {
    // Always include default services
    const defaultServices = [
        {
            name: "ToDo",
            url: "internal://todo"
        }
    ];

    // Merge with configured services
    const allServices = [...defaultServices, ...configuredServices];

    // Add "Plus de services" at the end
    allServices.push({
        name: "Plus de services",
        url: "internal://add-service"
    });

    // Save services
    await window.api.saveServices(allServices);

    // Show completion step
    showStep('step-complete');
}
