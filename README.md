# Nexus App

Une application Electron tout-en-un pour la gestion de tâches, calendrier, fichiers WebDAV et plus encore.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Electron](https://img.shields.io/badge/electron-31.0.1-brightgreen.svg)
![License](https://img.shields.io/badge/license-ISC-orange.svg)

## 📋 Table des matières

- [Fonctionnalités](#-fonctionnalités)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Développement](#-développement)
- [Build de l'application](#-build-de-lapplication)
- [Structure du projet](#-structure-du-projet)
- [Configuration](#-configuration)
- [Utilisation](#-utilisation)
- [Dépannage](#-dépannage)

## ✨ Fonctionnalités

- **📝 Gestionnaire de tâches (ToDo)** - Organisez vos tâches quotidiennes avec des listes personnalisables
- **📅 Calendrier** - Intégration avec Google Calendar et calendrier local
- **📁 Gestionnaire de fichiers WebDAV** - Accédez à vos fichiers distants via WebDAV
- **☁️ Google Drive** - Intégration avec Google Drive
- **🤖 IA** - Configuration de services IA (Gemini, ChatGPT, Claude)
- **🎨 Interface moderne** - Design sombre avec animations fluides
- **🔒 Sécurité** - Isolation du contexte et protection des données

## 🔧 Prérequis

Avant de commencer, assurez-vous d'avoir installé :

- **Node.js** (version 16 ou supérieure) - [Télécharger Node.js](https://nodejs.org/)
- **npm** (inclus avec Node.js)
- **Git** (optionnel, pour cloner le dépôt)

### Vérifier les installations

```bash
node --version  # Devrait afficher v16.x.x ou supérieur
npm --version   # Devrait afficher 8.x.x ou supérieur
```

## 📦 Installation

### 1. Cloner le dépôt (ou télécharger le code source)

```bash
git clone https://github.com/votre-username/Nexus-App.git
cd Nexus-App
```

### 2. Installer les dépendances

```bash
npm install
```

Cette commande installera toutes les dépendances nécessaires :
- Electron (framework de l'application)
- electron-builder (pour créer les packages)
- google-auth-library (authentification Google)
- googleapis (API Google)
- webdav (client WebDAV)

## 🚀 Développement

### Lancer l'application en mode développement

```bash
npm start
```

Cette commande lance l'application Electron en mode développement. L'application se rechargera automatiquement si vous modifiez les fichiers.

### Activer les outils de développement

Pour activer les DevTools de Chrome, décommentez la ligne suivante dans `main.js` :

```javascript
// mainWindow.webContents.openDevTools();
```

## 🏗️ Build de l'application

### Build pour macOS

#### Build pour l'architecture actuelle
```bash
npm run build:mac
```

Cette commande créera :
- Un fichier `.dmg` (installateur macOS)
- Un fichier `.zip` (version portable)

Pour les architectures **x64** (Intel) et **arm64** (Apple Silicon).

Les fichiers seront générés dans le dossier `dist/`.

#### Build universel (Intel + Apple Silicon)
Le build par défaut crée déjà des versions pour les deux architectures. Les fichiers générés seront :
- `Nexus App-1.0.0-x64.dmg` (pour Mac Intel)
- `Nexus App-1.0.0-arm64.dmg` (pour Mac Apple Silicon)
- `Nexus App-1.0.0-x64-mac.zip`
- `Nexus App-1.0.0-arm64-mac.zip`

### Build pour Windows

```bash
npm run build:win
```

Cette commande créera :
- Un installateur **NSIS** (`.exe`)
- Une version **portable** (`.exe`)

Pour l'architecture **x64**.

Les fichiers seront générés dans le dossier `dist/`.

### Build pour toutes les plateformes

```bash
npm run build:all
```

Cette commande créera les packages pour macOS et Windows simultanément.

### Build générique

```bash
npm run build
```

Cette commande utilisera la configuration par défaut d'electron-builder.

## 📁 Structure du projet

```
Nexus-App/
├── assets/                  # Ressources (icônes, images)
│   ├── icon.icns           # Icône macOS
│   └── icon.ico            # Icône Windows
├── internal/               # Modules internes
│   ├── ai.js              # Service IA
│   ├── calendar.js        # Service calendrier
│   ├── gdrive.js          # Service Google Drive
│   ├── todo.js            # Service ToDo
│   └── webdav.js          # Service WebDAV
├── renderer/              # Scripts du renderer process
│   ├── context-menu.js    # Menus contextuels
│   └── service-manager.js # Gestion des services
├── dist/                  # Dossier de sortie des builds (généré)
├── index.html            # Page principale de l'application
├── onboarding.html       # Page d'onboarding (première utilisation)
├── main.js               # Point d'entrée Electron (main process)
├── preload.js            # Script de préchargement (bridge sécurisé)
├── renderer.js           # Script principal du renderer
├── style.css             # Styles principaux
├── todo.css              # Styles pour le ToDo
├── calendar.css          # Styles pour le calendrier
├── calendar-app.css      # Styles supplémentaires calendrier
├── files.css             # Styles pour le gestionnaire de fichiers
├── onboarding.css        # Styles pour l'onboarding
├── onboarding.js         # Script pour l'onboarding
├── package.json          # Configuration npm et electron-builder
└── README.md            # Ce fichier
```

## ⚙️ Configuration

### Première utilisation

Au premier lancement, l'application affichera un assistant d'onboarding qui vous guidera pour :

1. **Configuration du système de fichiers** - Choisir le dossier de stockage
2. **Configuration du calendrier** - Choisir entre calendrier local ou Google Calendar
3. **Configuration de l'IA** - Sélectionner votre fournisseur IA préféré (optionnel)
4. **Ajout de sites web** - Ajouter vos sites favoris (optionnel)

### Fichiers de configuration

L'application stocke ses données dans le dossier utilisateur :

- **macOS** : `~/Library/Application Support/nexus-app/`
- **Windows** : `%APPDATA%/nexus-app/`
- **Linux** : `~/.config/nexus-app/`

Fichiers créés :
- `services.json` - Liste des services et onglets
- `firstUse.json` - Indicateur de première utilisation
- `todos.json` - Données des tâches
- `webdav-config.json` - Configuration WebDAV
- `calendar-config.json` - Configuration du calendrier
- `ai-config.json` - Configuration IA

### Modifier la configuration de build

Pour personnaliser le build, éditez la section `build` dans `package.json` :

```json
{
  "build": {
    "appId": "com.nexusapp.app",
    "productName": "Nexus App",
    "mac": {
      "category": "public.app-category.productivity"
    }
  }
}
```

## 💡 Utilisation

### Lancer l'application

#### En développement
```bash
npm start
```

#### Après installation (macOS)
1. Ouvrez le fichier `.dmg` généré dans `dist/`
2. Glissez l'application dans le dossier Applications
3. Lancez "Nexus App" depuis le Launchpad ou le dossier Applications

#### Après installation (Windows)
1. Exécutez l'installateur `.exe` généré dans `dist/`
2. Suivez les instructions d'installation
3. Lancez "Nexus App" depuis le menu Démarrer

### Fonctionnalités principales

#### Gestionnaire de tâches
- Créez des listes de tâches
- Ajoutez, modifiez et supprimez des tâches
- Marquez les tâches comme terminées
- Définissez des dates d'échéance

#### Calendrier
- Visualisez vos événements
- Synchronisez avec Google Calendar
- Créez de nouveaux événements

#### Fichiers WebDAV
- Connectez-vous à un serveur WebDAV
- Parcourez vos fichiers distants
- Téléchargez et uploadez des fichiers

#### Paramètres
- Accédez aux paramètres via l'icône ⚙️
- Gérez vos services
- Configurez les intégrations
- Personnalisez l'application

## 🐛 Dépannage

### L'application ne démarre pas

**Problème** : Erreur au lancement de l'application

**Solutions** :
1. Vérifiez que Node.js est installé : `node --version`
2. Réinstallez les dépendances :
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
3. Vérifiez les logs dans la console

### Erreur lors du build

**Problème** : `npm run build:mac` échoue

**Solutions** :
1. Vérifiez que vous avez les permissions nécessaires
2. Assurez-vous que les icônes existent dans `assets/`
3. Vérifiez l'espace disque disponible
4. Pour macOS, assurez-vous d'avoir Xcode Command Line Tools :
   ```bash
   xcode-select --install
   ```

### Erreur 503 lors du téléchargement d'Electron

**Problème** : Erreur réseau lors du build

**Solutions** :
1. Vérifiez votre connexion Internet
2. Utilisez un VPN si nécessaire
3. Configurez un proxy si vous êtes derrière un firewall d'entreprise
4. Réessayez plus tard (problème temporaire des serveurs)

### Les données ne se sauvegardent pas

**Problème** : Les modifications ne sont pas persistantes

**Solutions** :
1. Vérifiez les permissions du dossier utilisateur
2. Consultez les logs de la console pour les erreurs
3. Vérifiez que les fichiers JSON ne sont pas corrompus dans :
   - macOS : `~/Library/Application Support/nexus-app/`
   - Windows : `%APPDATA%/nexus-app/`

### Problèmes avec Google Calendar/Drive

**Problème** : Impossible de se connecter à Google

**Solutions** :
1. Vérifiez votre connexion Internet
2. Assurez-vous d'avoir configuré les credentials OAuth correctement
3. Vérifiez que les API Google sont activées dans la console Google Cloud
4. Réautorisez l'application dans les paramètres

### L'interface est cassée ou mal affichée

**Problème** : Problèmes d'affichage

**Solutions** :
1. Videz le cache de l'application
2. Réinitialisez les paramètres en supprimant les fichiers de configuration
3. Vérifiez que tous les fichiers CSS sont présents
4. Relancez l'application

## 📝 Notes importantes

### Sécurité

- L'application utilise `contextIsolation: true` pour la sécurité
- Les credentials sont stockés localement de manière sécurisée
- N'exposez jamais vos tokens ou credentials dans le code

### Performance

- L'application est optimisée pour macOS et Windows
- Les builds sont créés pour les architectures natives (meilleure performance)
- Le mode développement peut être plus lent que la version buildée

### Mises à jour

Pour mettre à jour les dépendances :

```bash
npm update
```

Pour mettre à jour Electron vers la dernière version :

```bash
npm install electron@latest --save-dev
```

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :

1. Fork le projet
2. Créer une branche pour votre fonctionnalité (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence ISC.

## 🆘 Support

Pour toute question ou problème :

1. Consultez d'abord la section [Dépannage](#-dépannage)
2. Vérifiez les issues existantes sur GitHub
3. Créez une nouvelle issue si nécessaire

---

**Développé avec ❤️ en utilisant Electron**
