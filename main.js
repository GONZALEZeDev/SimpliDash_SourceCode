// ============================================================================
//  Fichier   : main.js (processus principal Electron)
//  Projet    : SimpliDash (Electron - SECO/CRIBWISE)
//  Rôle      : Point d’entrée principal du process Electron (main process).
//              Initialise la fenêtre, charge le renderer (index.html) et gère
//              le cycle de vie de l’application (multi-plateforme).
//  Remarques :
//      - Gère le “single window” classique (fenêtre unique, relance sur macOS)
//      - Les options webPreferences autorisent l’intégration Node (pas sécurisé en prod !)
//        En attendant une refonte avec preload/IPC, l’exposition est limitée :
//        DevTools désactivés en build, pas de nouvelles fenêtres, pas de navigation
//        hors de l’app, et une CSP stricte sur les scripts dans index.html.
// ============================================================================

const { app, BrowserWindow } = require('electron');
const path = require('path');

/**
 * Crée la fenêtre principale de l’application et charge l’UI du renderer.
 * Définit la taille, l’icône et certaines préférences web.
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    icon: path.join(__dirname, 'assets', 'icon', 'Logo_SimpliDash-removebg-preview.png'),
    webPreferences: {
      nodeIntegration: true,     // Permet require dans le renderer (⚠️ attention sécurité)
      contextIsolation: false,   // Accès direct au contexte Node (pour dev seulement)
      devTools: !app.isPackaged  // Console inaccessible dans l’app distribuée (token visible dans les logs)
    }
  });

  // Aucune fenêtre secondaire (window.open, liens target="_blank") : avec l’intégration
  // Node active, une page externe ouverte ici aurait accès à require().
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Interdit toute navigation hors de la page de l’app (lien injecté, redirection…)
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  // Charge la page principale de l’interface utilisateur (renderer)
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // (Optionnel) Ouvre la console de développement automatiquement au démarrage.
  // Pour prod, commenter cette ligne !
  //win.webContents.openDevTools();
}

// Lance la création de la fenêtre principale quand l’app est prête
app.whenReady().then(createWindow);

// Quitte complètement l’application quand toutes les fenêtres sont fermées (sauf sur macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// macOS : Relance une fenêtre si l’icône du dock est cliquée alors qu’il n’y a plus de fenêtre ouverte
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
