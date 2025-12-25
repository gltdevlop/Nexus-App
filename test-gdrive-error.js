/**
 * Script de test pour simuler une erreur d'authentification Google Drive
 * 
 * Ce script va temporairement corrompre votre token Google Drive pour tester
 * l'affichage des erreurs dans l'application.
 * 
 * Usage:
 *   node test-gdrive-error.js corrupt    # Corrompre le token (simuler l'erreur)
 *   node test-gdrive-error.js restore    # Restaurer le token original
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Chemins des fichiers
const userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'nexus-app');
const tokensPath = path.join(userDataPath, 'gdrive-tokens.json');
const backupPath = path.join(userDataPath, 'gdrive-tokens.backup.json');

const command = process.argv[2];

if (!command || !['corrupt', 'restore'].includes(command)) {
    console.log('Usage:');
    console.log('  node test-gdrive-error.js corrupt    # Corrompre le token');
    console.log('  node test-gdrive-error.js restore    # Restaurer le token');
    process.exit(1);
}

if (command === 'corrupt') {
    // Vérifier si le fichier de tokens existe
    if (!fs.existsSync(tokensPath)) {
        console.error('❌ Aucun token Google Drive trouvé.');
        console.error('   Veuillez d\'abord vous connecter à Google Drive dans l\'application.');
        process.exit(1);
    }

    // Sauvegarder le token original
    const originalTokens = fs.readFileSync(tokensPath, 'utf8');
    fs.writeFileSync(backupPath, originalTokens);
    console.log('✅ Token original sauvegardé dans:', backupPath);

    // Corrompre le token
    const tokens = JSON.parse(originalTokens);
    tokens.refresh_token = 'INVALID_TOKEN_FOR_TESTING_' + Date.now();
    // Also invalidate access_token and set expiry to past to force immediate refresh
    tokens.access_token = 'INVALID_ACCESS_TOKEN_' + Date.now();
    tokens.expiry_date = Date.now() - 1000; // Expired 1 second ago
    fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));

    console.log('✅ Token corrompu avec succès!');
    console.log('');
    console.log('📋 Étapes suivantes:');
    console.log('   1. Redémarrez l\'application (Cmd+Q puis relancer)');
    console.log('   2. Ouvrez Google Drive dans l\'application');
    console.log('   3. Vous devriez voir le message d\'erreur avec le bouton de reconnexion');
    console.log('');
    console.log('💡 Pour restaurer le token original:');
    console.log('   node test-gdrive-error.js restore');

} else if (command === 'restore') {
    // Vérifier si la sauvegarde existe
    if (!fs.existsSync(backupPath)) {
        console.error('❌ Aucune sauvegarde trouvée.');
        console.error('   Vous devez d\'abord exécuter: node test-gdrive-error.js corrupt');
        process.exit(1);
    }

    // Restaurer le token original
    const backupTokens = fs.readFileSync(backupPath, 'utf8');
    fs.writeFileSync(tokensPath, backupTokens);

    // Supprimer la sauvegarde
    fs.unlinkSync(backupPath);

    console.log('✅ Token original restauré avec succès!');
    console.log('');
    console.log('📋 Étapes suivantes:');
    console.log('   1. Redémarrez l\'application (Cmd+Q puis relancer)');
    console.log('   2. Google Drive devrait fonctionner normalement');
}
