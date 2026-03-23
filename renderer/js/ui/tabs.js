// ============================================================================
//  Fichier : tabs.js
//  Dossier : src/renderer/js/ui/
//  Projet  : SimpliDash (Electron)
//  Rôle    : Gère le système d’onglets de navigation UI (masquage/affichage onglets)
//            Fournit :
//              - showTab(tab)      : affiche l’onglet demandé et active le bon nav item
//              - initTabs(mapping) : attache les listeners aux onglets du menu principal
//  Dépendances : aucune (DOM natif uniquement)
// ============================================================================

/**
 * Masque tous les contenus d’onglets et affiche celui correspondant à l’ID donné.
 * Met également à jour la barre de navigation (active).
 * @param {string} tab - Nom logique de l’onglet, ex : 'home', 'users', 'orders'...
 *                      → correspond à l’id 'tab-xxx' dans le DOM et 'nav-xxx' dans la barre.
 */
function showTab(tab) {
    // Masque tous les div de contenus d’onglet
    document.querySelectorAll('.tab-content')
            .forEach(div => div.style.display = 'none');
    // Désactive tous les onglets du menu
    document.querySelectorAll('nav li')
            .forEach(li => li.classList.remove('active'));
    // Affiche le contenu de l’onglet demandé
    const content = document.getElementById('tab-' + tab);
    const navItem = document.getElementById('nav-' + tab);
    if (content) content.style.display = '';
    if (navItem)  navItem.classList.add('active');
}

/**
 * Initialise les listeners de clic sur chaque onglet de navigation.
 * Permet de lier chaque onglet à sa fonction d’affichage/logique.
 * @param {Object} mapping - Objet clé/valeur { nomOnglet: fonctionCallback }
 *        Exemple : { home: fnHome, users: fnUsers }
 */
function initTabs(mapping) {
    Object.entries(mapping).forEach(([tab, fn]) => {
      const navEl = document.getElementById('nav-' + tab);
      if (!navEl) return; // Ignore si onglet absent
      navEl.onclick = () => {
        showTab(tab); // Affiche l’onglet demandé
        fn();         // Appelle la logique associée (refresh, affichage, etc.)
      };
    });
}

// Exporte les fonctions pour usage externe (require/import)
module.exports = { showTab, initTabs };
