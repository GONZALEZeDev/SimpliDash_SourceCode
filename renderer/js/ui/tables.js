// ============================================================================
//  Fichier   : tables.js
//  Dossier   : src/renderer/js/ui/
//  Projet    : SimpliDash (Electron)
//  Rôle      : Fonctions utilitaires d’affichage des principaux tableaux de l’UI :
//              transactions, outils, utilisateurs, commandes, appareils, etc.
//              Chaque fonction génère et insère du HTML dans un container donné.
//  Dépendances : Aucune (DOM natif uniquement), CSS prévu pour les classes des tableaux
// ============================================================================

/**
 * Affiche un tableau des transactions brutes (top 5).
 * @param {HTMLElement} container    Élément DOM cible
 * @param {Array} transactions       Liste d’objets transaction
 */
function displayRawTransactions(container, transactions) {
  if (!transactions.length) {
    container.innerHTML = '<p>Aucune transaction trouvée.</p>';
    return;
  }
  let html = '<table><tr>'
          + '<th>Date</th><th>Type</th><th>Utilisateur</th><th>Outil</th><th>Quantité</th>'
          + '</tr>';
  transactions.forEach(trx => {
    html += `<tr>
      <td>${trx.CreatedOn
                ? new Date(trx.CreatedOn).toLocaleString()
                : '—'}</td>
      <td>${trx.TransactionType || ''}</td>
      <td>${trx.UserName || trx.User || ''}</td>
      <td>${trx.ProductName || trx.Item || ''}</td>
      <td>${trx.Quantity || ''}</td>
    </tr>`;
  });
  html += '</table>';
  container.innerHTML = html;
}

/**
 * Affiche un tableau d’items critiques à réapprovisionner, avec photo.
 * @param {HTMLElement} container
 * @param {Array} items  objets { ItemName, Quantity, OrderPoint, imageUrl }
 */
function displayCriticalItems(container, items) {
  if (!items.length) return container.innerHTML = '<p>Aucun outil à réapprovisionner.</p>';

  let html = '<table>'
          + '<tr><th>Photo</th><th>Nom</th><th>En stock</th><th>Point de commande</th></tr>';

  items.forEach(it => {
    html += `<tr>
      <td>
      ${it.imageUrl
          ? `<img src="${it.imageUrl}" alt="Photo de ${it.ItemName}" class="item-image" />`
          : `<span style="color:#999;">–</span>`
        }
      </td>
      <td>${it.ItemName}</td>
      <td>${it.Quantity}</td>
      <td>${it.OrderPoint}</td>
    </tr>`;
  });

  // Affiche le total en pied de tableau
  const totalQuantity = items.length;
  html += `<tr><td colspan="3" style="text-align:right;"><strong>Total :</strong></td>
    <td>${totalQuantity}</td></tr>`;
  html += '</table>';
  container.innerHTML = html;
}

/**
 * Affiche un tableau des utilisateurs, avec actions et statistiques (admin, opérateurs).
 * @param {HTMLElement} container
 * @param {Array} usersDisplay  objets {id, firstName, lastName, group, hasRfid}
 */
function displayUsers(container, usersDisplay) {
  if (!usersDisplay.length) {
    container.innerHTML = '<p>Aucun utilisateur trouvé.</p>';
    return;
  }
  // En-têtes incluant la colonne Actions (modifier, supprimer, révoquer badge)
  let html = '<table><tr>'
          + '<th>Prénom</th><th>Nom</th><th>Groupe</th><th>Badge RFID</th><th>Actions</th>'
          + '</tr>';

  usersDisplay.forEach(u => {
    html += `<tr>
      <td>${u.firstName}</td>
      <td>${u.lastName}</td>
      <td>${u.group}</td>
      <td>${u.hasRfid}</td>
      <td>
        <button class="users-button edit-user-btn"     data-user-id="${u.id}">Modifier</button>
        <button class="users-button delete-user-btn"   data-user-id="${u.id}">Supprimer</button>
        <button class="users-button revoke-badge-btn"  data-user-id="${u.id}">Révoquer badge</button>
      </td>
    </tr>`;
  });

  html += '</table>';

  // Statistiques en pied de tableau
  const adminCount    = usersDisplay.filter(u => u.group === 'Administrators').length;
  const operatorCount = usersDisplay.filter(u => u.group === 'Operators').length;
  const totalCount    = usersDisplay.length;

  html += `<p><strong>Administrateurs : ${adminCount}</strong></p>`;
  html += `<p><strong>Opérateurs : ${operatorCount}</strong></p>`;
  html += `<p><strong>Total utilisateurs : ${totalCount}</strong></p>`;

  container.innerHTML = html;
}

/**
 * Affiche un tableau des appareils connectés.
 * @param {HTMLElement} container
 * @param {Array} devices  objets { name, isCloud, version, lastModified }
 */
function displayDevices(container, devices) {
  if (!Array.isArray(devices) || devices.length === 0) {
    container.innerHTML = '<p>Aucun appareil trouvé.</p>';
    return;
  }

  let html = '<table><tr>'
    + '<th>Nom</th>'
    + '<th>Sur site/Cloud</th>'
    + '<th>Version</th>'
    + '<th>Dernière modification</th>'
    + '</tr>';

  devices.forEach(d => {
    html += `<tr>
      <td>${d.name || '—'}</td>
      <td>${d.isCloud ? 'Cloud' : 'Sur site'}</td>
      <td>${d.version || '—'}</td>
      <td>${d.lastModified
                ? new Date(d.lastModified).toLocaleString()
                : '—'}</td>
    </tr>`;
  });

  html += '</table>';
  container.innerHTML = html;
}

/**
 * Affiche un tableau paginé d’outils (photo, code, nom, catégorie, fournisseur, stock, actions).
 * Génère également la pagination (précédent/suivant). Les événements doivent être gérés en dehors.
 * Utilise lazy loading pour les images.
 * @param {HTMLElement} container
 * @param {Array} toolsPage     Page courante d’outils enrichis (max 50)
 * @param {number} pageNumber   Page courante (1-based)
 * @param {number} totalPages   Nombre total de pages
 */
function displayTools(container, toolsPage, pageNumber, totalPages) {
  if (!toolsPage.length) {
    container.innerHTML = '<p>Aucun outil trouvé.</p>';
    return;
  }

  // Chaque ligne = outil enrichi
  const rowsHtml = toolsPage.map(it => {
    const imgCell = it.imageUrl
      ? `<img class="lazy" data-src="${it.imageUrl}" src="" alt="${it.externalId || ''}" width="40">`
      : '—';
    return `
      <tr>
        <td>${imgCell}</td>
        <td>${it.externalId || '–'}</td>
        <td>${it.name || '–'}</td>
        <td>${it.categoryPath || '–'}</td>
        <td>${it.supplierName || '–'}</td>
        <td>${it.inStock ? '✔️' : '—'}</td>
        <td>
          <button class="orders-button tool-action" data-action="edit"   data-id="${it.id}">Modifier</button>
          <button class="orders-button tool-delete-btn tool-action" data-action="delete" data-id="${it.id}">Supprimer</button>
        </td>
      </tr>`;
  }).join('');

  // Construction du HTML avec header, corps, et pagination
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Photo</th>
          <th>Code</th><th>Nom</th>
          <th>Catégorie</th>
          <th>Fournisseur</th>
          <th>Dans l’appareil</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="pagination">
      <button ${pageNumber === 1 ? 'disabled' : ''} id="prev-page">← Précédent</button>
      <span>Page ${pageNumber} / ${totalPages}</span>
      <button ${pageNumber === totalPages ? 'disabled' : ''} id="next-page">Suivant →</button>
    </div>
  `;

  // Lazy loading des images via IntersectionObserver (optimisation UX)
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove('lazy');
        obs.unobserve(img);
      }
    });
  }, {
    root: container,
    rootMargin: '0px 0px 50px 0px',
    threshold: 0.01
  });

  container.querySelectorAll('img.lazy').forEach(img => observer.observe(img));
}

/**
 * Affiche un tableau des commandes fournisseurs, avec actions.
 * @param {HTMLElement} container
 * @param {Array} orders  Objets enrichis (vendor, items…)
 */
function displayOrders(container, orders) {
  if (!orders.length) {
    container.innerHTML = '<p>Aucune commande trouvée.</p>';
    return;
  }

  const rows = orders.map(o => {
    const id       = o.orderId || o.id;
    const totalQty = o.items.length;
    // Somme du coût total (prix d’achat total, ou prix unitaire × quantité)
    const totalCost = o.items
      .reduce((sum, item) =>
        sum + (item.purchaseTotalPrice ?? (item.pricePerPiece * item.totalQuantity) ?? 0)
      , 0)
      .toFixed(2);

    return `
      <tr data-order-id="${id}">
        <td>${id}</td>
        <td>${o.vendorName || '–'}</td>
        <td>${new Date(o.orderCreatedDate||o.creationDate).toLocaleDateString()}</td>
        <td>${totalQty}</td>
        <td>${totalCost} €</td>
        <td>
          <button class="orders-button edit-order-btn" data-order-id="${id}">Modifier</button>
          <button class="export-order-btn" data-order-id="${id}">Exporter PDF</button>
          <button class="orders-button delete-order-btn" data-order-id="${id}">Supprimer</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Fournisseur</th>
          <th>Date</th>
          <th>Nb Outil</th>
          <th>Coût Total</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ============================================================================
//  EXPORTS : Expose toutes les fonctions d’affichage pour usage global UI
// ============================================================================
module.exports = {
  displayRawTransactions,
  displayCriticalItems,
  displayUsers,
  displayDevices,
  displayTools,
  displayOrders
};
