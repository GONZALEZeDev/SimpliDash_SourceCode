
// ============================================================================
// helpers.js — Fonctions utilitaires et helpers pour l’app SimpliDash
// Toutes les fonctions ici servent à l’UI, la gestion des commandes, des exports,
// des modales, et des opérations courantes avec l’API ou le DOM.
// ============================================================================


// Importation des modules nécessaires
const { jsPDF } = require('jspdf');
// interop CommonJS <-> ESM :
let autoTable = require('jspdf-autotable');
if (autoTable && typeof autoTable.default === 'function') {
  autoTable = autoTable.default;
}

// Modules axios pour les appels API et import  des fonctions d'autres fichiers
const axios = require('axios');
const { fetchToken, getAccessToken } = require('../auth');
const { createPurchaseOrder, fetchAllDevices, addItemToPurchaseOrder, deletePurchaseOrder } = require('../api/integration');
const {fetchAllStockLocations} = require('../api/reporting');




// ============================================================================
// FONCTIONS D’UTILITAIRES GÉNÉRALES
// ============================================================================


/**
 * Affiche un spinner et gère les états de chargement pour n'importe quel appel asynchrone.
 * Gère aussi les erreurs et le renouvellement du token (401).
 * @param {Object} options
 * @param {HTMLButtonElement} options.btn - Bouton déclencheur (désactivé pendant le chargement)
 * @param {HTMLElement} options.container - Élément cible où afficher le contenu ou les messages
 * @param {function(): Promise<any>} options.fetchFn - Fonction async récupérant les données
 * @param {function(HTMLElement, any): void} options.displayFn - Fonction affichant les données
 * @param {string} [options.loadingMessage='Chargement…']
 * @param {string} [options.errorMessage='Erreur de récupération.']
 */
async function withLoader({
  btn, container, fetchFn, displayFn,
  loadingMessage = 'Chargement…',
  errorMessage = 'Erreur de récupération.'
}) {
  const prevLabel = btn.textContent;
  container.innerHTML = `
    <div class="spinner-container">
      <div class="spinner"></div>
      <p>${loadingMessage}</p>
    </div>
  `;
  btn.disabled = true;
  btn.textContent = '⏳ ' + prevLabel;

  try {
    let data;
    try {
      data = await fetchFn();
    } catch (e) {
      // Retry auto sur 401
      if (e.response && e.response.status === 401) {
        console.warn("Token expiré, récupération d'un nouveau...");
        await fetchToken();
        data = await fetchFn();
      } else {
        throw e;
      }
    }
    displayFn(container, data);
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p>${errorMessage}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
}

/**
 * Génère une fonction de refresh/rafraîchissement (par exemple pour un bouton "Recharger").
 * @param {object} options — mêmes options que withLoader
 * @returns {Function} — La fonction de rafraîchissement
*/
function makeHardRefresher({ btn, container, fetchFn, displayFn, loadingMessage = 'Chargement…', errorMessage = 'Erreur de chargement.' }) {
  return async function hardRefresh() {
    try {
      btn && (btn.disabled = true);
      container.innerHTML = `
        <div class="spinner-container">
          <div class="spinner"></div>
          <p>${loadingMessage}</p>
        </div>`;
      const data = await fetchFn();
      displayFn(container, data);
    } catch (err) {
      console.error('[hardRefresh]', err);
      container.innerHTML = `<p style="color:#c00;">${errorMessage}</p>`;
    } finally {
      btn && (btn.disabled = false);
    }
  };
}

/**
 * Pause asynchrone (Promise delay)
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ============================================================================
// ALERTES & CONFIRMATIONS CUSTOM (UI)
// ============================================================================

/**
 * Affiche une alerte personnalisée dans une modale custom.
 * Utilise innerHTML pour supporter les sauts de ligne (\n).
 * @param {string} message
 */
function customAlert(message) {
  const alertBox = document.getElementById('custom-alert');
  const msgBox = document.getElementById('custom-alert-message');
  const okBtn = document.getElementById('custom-alert-ok');
  msgBox.innerHTML = message.replace(/\n/g, '<br>');
  alertBox.style.display = 'flex';
  okBtn.focus();
  okBtn.onclick = () => {
    alertBox.style.display = 'none';
  };
}

/**
 * Affiche une confirmation custom avec deux callbacks (oui/non)
 * @param {string} message
 * @param {Function} onYes
 * @param {Function} onNo
 */
function customConfirm(message, onYes, onNo) {
  const confirmBox = document.getElementById('custom-confirm');
  const msgBox = document.getElementById('custom-confirm-message');
  const yesBtn = document.getElementById('custom-confirm-yes');
  const noBtn = document.getElementById('custom-confirm-no');
  msgBox.textContent = message;
  confirmBox.style.display = 'flex';
  yesBtn.onclick = () => {
    confirmBox.style.display = 'none';
    onYes && onYes();
  };
  noBtn.onclick = () => {
    confirmBox.style.display = 'none';
    onNo && onNo();
  };
}




// ============================================================================
// ACCÈS PRIX ARTICLES (API Cribwise)
// ============================================================================

/**
 * Récupère le prix unitaire réel d'un item à partir de son ID.
 * @param {string} itemId
 * @returns {Promise<number>}
 */
async function getPriceForItem(itemId) {
  if (!getAccessToken()) await fetchToken();
  const url = `https://api.cribwise.com/integration/v1/integrationapi/Items/${itemId}`;
  const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  // Check vendorItem.pricePerPiece ou fallback sur grossPricePerPiece
  if (resp.data?.vendorItem?.pricePerPiece != null)
    return resp.data.vendorItem.pricePerPiece;
  if (resp.data?.vendorItem?.grossPricePerPiece != null)
    return resp.data.vendorItem.grossPricePerPiece;
  return 0;
}

/**
 * PATCH le prix unitaire d'un item (champ vendorItem.pricePerPiece)
 * @param {string} itemId
 * @param {number} newPrice
 * @returns {Promise<any>}
 */
async function updateItemUnitPrice(itemId, newPrice) {
  if (!getAccessToken()) await fetchToken();
  const url = `https://api.cribwise.com/integration/v1/integrationapi/Items/${itemId}`;
  const patchData = { vendorItem: { pricePerPiece: newPrice } };
  const resp = await axios.patch(url, patchData, {
      headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  return resp.data;
}




// ============================================================================
// EXPORT CSV ET PDF DE COMMANDES
// ============================================================================

// Informations de l'entreprise pour le PDF et/ou le CSV
const COMPANY = {
  name: 'AMGM',
  address: '30 route de la Bourlaratte, 43200 SAINT-JEURES',
  phone: '04 71 65 00 73',
  website: 'https://www.amgm43.com/',
  siret: '31322139200019',
  ape: '285D',
  vatIntracom: 'FR65313221392',
  logoBase64: 'data:image/png;base64,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'
};



/**
 * Exporte une commande (order) au format CSV (incluant BOM pour Excel).
 * Async pour récupérer les infos fournisseur.
 * @param {object} order
 */
// Fonction non utiisée dans l'application, mais gardé en cas de besoin pour création d'un tableau excel de commande.
async function exportOrderAsCsv(order) {
  // 1. Récupère la ville du fournisseur
  let vendorCity = "";
  try {
    const vendor = await fetchVendorById(order.vendorId);
    vendorCity = vendor.description || "";
  } catch {}

  // 2. Prépare en-têtes
  const today = new Date().toLocaleDateString('fr-FR');
  const orderNumber = `CA-${order.orderId || order.id}`;
  const headerLines = [
    `${COMPANY.name}`,
    `${COMPANY.address}`,
    `Tél: ${COMPANY.phone}`,
    `Site: ${COMPANY.website}`,
    "",
    `Fournisseur: ${order.vendorName || ""}`,
    `Adresse fournisseur: ${vendorCity}`,
    "",
    `Numéro commande: ${orderNumber}`,
    `Date: ${today}`,
    ""
  ];

  // 3. Tableau articles (sans colonne TVA)
  const tableHeader = [
    "ID article",
    "Nom",
    "Quantité à commander",
    "% Remise",
    "PU HT",
    "Montant HT"
  ];
  const rows = [];
  let totalHT = 0;

  for (const item of order.items) {
    const ratio       = item.units?.purchaseUnitRatio > 1 ? item.units.purchaseUnitRatio : 1;
    const qtyInUnit   = item.totalQuantity;
    const qtyInPieces = qtyInUnit * ratio;

    const displayQty = ratio > 1
      ? `${qtyInUnit} * ${qtyInPieces} (${qtyInPieces} par paquet)`
      : `${qtyInUnit} ${item.units.dispenseUnit.toLowerCase()}`;

    let puHT = item.unitPrice ?? item.purchasePricePerPiece ?? 0;
    if (puHT === 0) {
      try { puHT = await getPriceForItem(item.itemId); } catch {}
    }

    const montantHT = qtyInPieces * puHT;
    totalHT += montantHT;

    rows.push([
      item.itemExternalId || "",
      item.itemName         || "",
      displayQty,
      "0",
      puHT.toFixed(2).replace(".", ","),
      montantHT.toFixed(2).replace(".", ",")
    ]);
  }

  // 4. Totaux et application de la TVA sur le total HT
  const tvaRate  = 20;
  const totalTVA = totalHT * tvaRate / 100;
  const totalTTC = totalHT + totalTVA;

  // 5. footer avec TVA unique
  const footerLines = [
    "",
    ["Total HT",   totalHT.toFixed(2).replace(".", ",") + " €"],
    ["TVA (20%)",  totalTVA.toFixed(2).replace(".", ",") + " €"],
    ["Total TTC",  totalTTC.toFixed(2).replace(".", ",") + " €"],
    "",
    ["SIRET",        `="${COMPANY.siret}"`],
    ["APE",          `="${COMPANY.ape}"`],
    ["TVA Intracom", `="${COMPANY.vatIntracom}"`]
  ];

  // 6. Construction du CSV (apostrophe pour forcer align à gauche)
  const bom   = "\uFEFF";
  const lines = [];

  // En-têtes fixes
  headerLines.forEach(l => lines.push(l));
  // header du tableau
  lines.push(tableHeader.join(";"));

  // Lignes articles
  rows.forEach(r => {
    const line = r.map(v => {
      const txt = v.replace(/"/g, '""');
      const isNum = /^-?\d+([,\.]\d+)?( €)?$/.test(v);
      return `"${isNum ? "'" : ""}${txt}"`;
    }).join(";");
    lines.push(line);
  });

  // Footer
  footerLines.forEach(cols => {
    const line = Array.isArray(cols)
      ? cols.map(v => {
          const txt = v.replace(/"/g, '""');
          const isNum = /^-?\d+([,\.]\d+)?( €)?$/.test(v);
          return `"${isNum ? "'" : ""}${txt}"`;
        }).join(";")
      : cols;
    lines.push(line);
  });

  // Création et téléchargement du blob
  const csvContent = bom + lines.join("\r\n");
  const blob       = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url        = URL.createObjectURL(blob);
  const a          = document.createElement("a");
  a.href           = url;
  a.download       = `${orderNumber}_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}



/**
 * Exporte une commande au format PDF, avec un header, un tableau stylisé et un footer.
 * @param {object} order — même structure que pour le CSV
 */
async function exportOrderAsPdf(order) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const { width, height } = doc.internal.pageSize;
  const margin = 30;

  // 1) Bandeau header 
  const headerH       = 250;
  const headerPadding = 10;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, headerH + headerPadding, 'F');
  doc.setTextColor(0);
  doc.setFontSize(16);
  const logoWidth  = 200; // ajustez la largeur du logo
  const logoHeight = 75;  // ajustez la hauteur du logo
  doc.addImage(
    COMPANY.logoBase64,  // votre data-URL ou Base64
    'PNG',
    margin,              // x
    margin + headerPadding / 2, // y
    logoWidth,
    logoHeight
  );
  doc.setFontSize(10);
  // On sélectionne la police "Helvetica" en style "bold"
  doc.setFont('helvetica', 'bold');
  // On dessine le texte en gras
  doc.text(COMPANY.address, margin, 130);
  doc.text(`Tél: ${COMPANY.phone}`, margin, 145);
  doc.text(`Site: ${COMPANY.website}`, margin, 160);
  // On rétablit le style normal pour la suite
  doc.setFont('helvetica', 'normal');

  // 2) Mini-tableau commande/date à gauche, fournisseur à droite
  const yInfo    = headerH + headerPadding + 20;  // on remonte un peu pour caler le tableau
  const infoTableX = margin;
  const infoTableWidth = 200;

  autoTable(doc, {
    head: [['Commande', 'Date']],
    body: [[
      `CA-${order.orderId || order.id}`,
      new Date().toLocaleDateString('fr-FR')
    ]],
    startY: yInfo,
    margin: { left: infoTableX },
    tableWidth: infoTableWidth,
    theme: 'grid',
    styles: {
      fontSize: 10,
      halign: 'center',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [220, 53, 69],
      textColor: 255,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: infoTableWidth * 0.6, halign: 'center' },
      1: { cellWidth: infoTableWidth * 0.5, halign: 'center' }
    },
    showHead: true
  });

    // On récupère la date de livraison souhaitée depuis l'objet order
    const deliveryDate = order.shippingDate || ''; 

    // Position juste sous le tableau Commande/Date
    const afterInfoY = doc.lastAutoTable.finalY;
  
    autoTable(doc, {
      head: [['Date de livraison souhaitée']],
      body: [[deliveryDate]],
      startY: afterInfoY,
      margin: { left: infoTableX },       // même alignement que le tableau commande
      tableWidth: infoTableWidth,         // même largeur
      theme: 'grid',
      styles: {
        fontSize: 10,
        halign: 'center',
        valign: 'middle'
      },
      headStyles: {
        fillColor: [220, 53, 69],
        textColor: 255,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: infoTableWidth + 20, halign: 'center' } // un peu plus large pour le texte
      },
      showHead: true
    });

  let vendorCity = '';
  try {
    const vendor = await fetchVendorById(order.vendorId);
    vendorCity = vendor.description || '';
  } catch { }
  

  // Paramètres du tableau fournisseur
  const vendorTableWidth = 200;
  const vendorTableX     = width - margin - vendorTableWidth;
  const vendorTableY     = yInfo; // même Y que pour la commande

  autoTable(doc, {
    head: [['Fournisseur', 'Adresse']],
    body: [[
      order.vendorName || '',
      vendorCity
    ]],
    startY: vendorTableY,
    margin: { left: vendorTableX },
    tableWidth: vendorTableWidth,
    theme: 'grid',
    styles: {
      fontSize: 10,
      halign : 'center',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [220, 53, 69],
      textColor: 255,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: vendorTableWidth * 0.4, halign: 'center' },
      1: { cellWidth: vendorTableWidth * 0.6, halign: 'center' }
    },
    showHead: true
  });

  // 3) Tableau des items
  const startY = yInfo + 130;

  // **Ici on déclare head AVANT de l’utiliser**
  const head = [['Réf.', 'Nom', 'Qté', 'PU (€)', 'Remise (%)', 'PU net (€)', 'Montant HT (€)']]

  let totalHT = 0;

  const body = await Promise.all(order.items.map(async it => {
    // 1) Calcul du ratio et de l'étiquette de quantité  
    const ratio     = it.units?.purchaseUnitRatio > 1 ? it.units.purchaseUnitRatio : 1;
    const qtyPieces = it.totalQuantity * ratio;
    const qtyLabel  = ratio > 1
      ? `${it.totalQuantity}×${ratio} (pièces/paquet)`
      : `${it.totalQuantity}`;

    // 2) Récupération du prix unitaire  
    let pu = it.unitPrice ?? 0;
    if (pu === 0) {
      try { pu = await getPriceForItem(it.itemId); }
      catch { pu = 0; }
    }

    // 3) Recherche de la remise applicable (order.discounts défini avant l'appel)
    const discObj  = (order.discounts || []).find(d => d.itemId === it.itemId);
    const discount = discObj ? discObj.discount : 0;

    // 4) Calcul du prix unitaire net et du montant HT  
    const puNet   = +(pu * (1 - discount/100)).toFixed(2);
    const montant = +(puNet * qtyPieces).toFixed(2);

    // 5) Accumulation du total HT  
    totalHT += montant;

    // 6) Construction de la ligne du tableau  
    return [
      it.itemExternalId || it.itemId,  // Réf.
      it.itemName,                     // Nom
      qtyLabel,                        // Qté
      pu.toFixed(2),                   // PU (€)
      discount.toFixed(0),             // Remise (%)
      puNet.toFixed(2),                // PU net (€)
      montant.toFixed(2)               // Montant HT (€)
    ];
  }));



  autoTable(doc, {
    startY,
    head,
    body,
    styles:            { fontSize: 9, textColor: 50, halign: 'left' },
    headStyles:        { fillColor: [220, 53, 69], textColor: 255 },
    alternateRowStyles:{ fillColor: [245, 245, 245] },
    margin:            { left: margin, right: margin }
  });

  // === 4) Mini-tableau des totaux aligné à droite ===
  const finalY    = doc.lastAutoTable.finalY + 20;
  const tvaRate  = 20;
  const totalTVA = +(totalHT * tvaRate/100).toFixed(2);
  const totalTTC = +(totalHT + totalTVA).toFixed(2);

  // Largeur souhaitée du mini-tableau (en points PDF)
  const tableWidth = 140;
  // Point de départ X = pageWidth - margeDroite - tableWidth
  const startX = width - margin - tableWidth;

  // AutoTable Totaux
  autoTable(doc, {
    startY: finalY,
    margin:   { left: startX },  // colle tout à droite
    tableWidth,
    body: [
      ['Total HT',    totalHT .toFixed(2).replace('.', ',') + ' €'],
      ['TVA (20 %)',  totalTVA.toFixed(2).replace('.', ',') + ' €'],
      ['Total TTC',   totalTTC.toFixed(2).replace('.', ',') + ' €']
    ],
    theme:  'grid',
    styles: {
      fontSize:   8,
      textColor:  50,
      cellPadding: 4,
      halign:     'left'
    },
    columnStyles: {
      0: { // colonne = “titres”
        fillColor: [230, 230, 230],
        fontStyle: 'bold'
      },
      1: { // colonne = montants alignés à droite
        halign: 'right'
      }
    },
    // Pas de head ici, on utilise juste le body
    showHead: false
  });

  // === 5) Mentions légales en pied ===
  const footerY = height - 30;
  doc.setFontSize(8).setTextColor(100);


  const footerTexts = [
    `SIRET : ${COMPANY.siret}`,
    ' - ',
    `APE : ${COMPANY.ape}`,
    ' - ',
    `TVA Intracom : ${COMPANY.vatIntracom}`
  ];

  // Largeur disponible entre les marges
  const availableWidth = width - 2 * margin;
  // On place chaque texte à 1/4, 2/4, 3/4 de cette zone
  footerTexts.forEach((text, i) => {
    const x = margin + availableWidth * (i + 1) / (footerTexts.length + 1);
    doc.text(text, x, footerY, { align: 'center' });
  });

  // === 6) Enregistrement du PDF avec choix de l’emplacement ===
  if ('showSaveFilePicker' in window) {
    const opts = {
      suggestedName: `Commande_CA-${order.orderId || order.id}.pdf`,
      types: [{
        description: 'Fichiers PDF',
        accept: { 'application/pdf': ['.pdf'] }
      }]
    };
    try {
      // Affiche la boîte de dialogue
      const handle = await window.showSaveFilePicker(opts);
      // Crée un flux d’écriture
      const writable = await handle.createWritable();
      // Écrit le blob PDF
      await writable.write(doc.output('blob'));
      // Ferme et finalise
      await writable.close();
    } catch (err) {
      // Si l’utilisateur annule ou s’il y a une erreur, on peut retomber
      console.warn('Enregistrement annulé ou impossible :', err);
      doc.save(`Commande_CA-${order.orderId || order.id}.pdf`);
    }
  } else {
    // Fallback classique
    doc.save(`Commande_CA${order.orderId || order.id}.pdf`);
  }
}




// ============================================================================
// MODALES UI POUR COMMANDES, UTILISATEURS, OUTILS
// ============================================================================


/**
 * Affiche la modale de création de commande (vierge).
 * Appelle onCreate (async) à la sauvegarde, et onCancel à l'annulation/fermeture.
 * @param {object} params
 * @param {Array}  params.vendors
 * @param {Array}  params.stocks
 * @param {Array}  params.items
 * @param {Array}  params.devices
 * @param {Array}  params.stockLocations    // utilisé pour la recherche live
 * @param {Function} params.onCreate
 * @param {Function} [params.onCancel]
 */
async function showCreateOrderModal({
  vendors,
  stocks,
  items,
  devices,
  stockLocations,   // ← ajouté
  onCreate,
  onCancel
}) {
  const modal = document.getElementById('order-detail-modal');
  const title = document.getElementById('detail-order-title');
  const table = document.getElementById('order-detail-table-container');
  const totalSpan = document.getElementById('order-total');
  const btnSave = document.getElementById('save-order-changes');
  const btnClose = document.getElementById('close-order-modal');
  const btnCancel = document.getElementById('cancel-order-changes');

  // Affiche la modale + overlay
  modal.style.display = 'flex';
  if (modal.querySelector('.modal-overlay'))
    modal.querySelector('.modal-overlay').style.display = 'block';

  // Reset
  title.textContent = "Nouvelle commande";
  totalSpan.textContent = "";
  btnSave.disabled = false;
  btnSave.textContent = 'Créer la commande';
  btnSave.onclick = null;
  btnClose.onclick = null;
  btnCancel.onclick = null;

  // Sélection fournisseur/stock
  table.innerHTML = `
    <div style="margin-bottom: 1em;">
      <label>Fournisseur :
        <select id="order-vendor-select" class="orders-select">${
          vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('')
        }</select>
      </label>
      <label style="margin-left:2em;">Stock :
        <select id="order-stock-select" class="orders-select">${
          stocks.map(s => `<option value="${s.id}">${s.name}</option>`).join('')
        }</select>
      </label>
    </div>
    <div>
      <button id="add-order-item-btn" class="orders-button">Ajouter un article</button>
    </div>
    <div id="create-order-items-table"></div>
  `;

  let currentItems = [];

  // Affichage dynamique du tableau
  function renderItemsTable() {
    const rows = currentItems.map((it, idx) => `
      <tr>
        <td>${it.itemName}</td>
        <td>${it.itemExternalId || ''}</td>
        <td>
          <input type="number" min="1" value="${it.totalQuantity}" data-idx="${idx}" class="qty-input orders-input">
        </td>
        <td>
          ${
            // Affiche "X pièces par paquet" seulement si conditionné
            it.units?.purchaseUnitRatio > 1
              ? (
              it.units.purchaseUnitRatio
              + ' '
              + (it.units?.purchaseUnit?.toLowerCase() || '')
              + ' par '
              + (it.units?.dispenseUnit?.toLowerCase() || '')
              )
            : (it.units?.dispenseUnit?.toLowerCase() || 'pièces')
          }
        </td>
        <td>
          <input type="number" step="0.01" min="0" value="${it.unitPrice}" data-idx="${idx}" class="price-input orders-input">
        </td>
        <td><button class="delete-item-btn" data-idx="${idx}">Suppr.</button></td>
      </tr>
    `).join('');

    document.getElementById('create-order-items-table').innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nom</th><th>Référence</th><th>Qté</th><th>Unité</th><th>Prix unitaire</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Events : suppression, modif qté/prix, recalc
    document.querySelectorAll('.delete-item-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = +btn.dataset.idx;
        currentItems.splice(idx, 1);
        renderItemsTable();
        recalc();
      };
    });
    document.querySelectorAll('.qty-input').forEach(inp => {
      inp.oninput = () => {
        currentItems[+inp.dataset.idx].totalQuantity = +inp.value;
        recalc();
      };
    });
    document.querySelectorAll('.price-input').forEach(inp => {
      inp.oninput = () => {
        currentItems[+inp.dataset.idx].unitPrice = +inp.value;
        recalc();
      };
    });
    recalc();
  }

  // Calcule le total de la commande en temps réel
  function recalc() {
    let total = 0;
    currentItems.forEach(it => {
      // Si l'article est conditionné (plus d'1 pièce par paquet), on multiplie
      const multiplier = it.units?.purchaseUnitRatio > 1
        ? it.units.purchaseUnitRatio
        : 1;
      total += it.totalQuantity * multiplier * it.unitPrice;
    });
    totalSpan.textContent = `Total: ${total.toFixed(2)} €`;
  }

  // Pop-up pour ajouter un article
  document.getElementById('add-order-item-btn').onclick = () => {
    const div = document.createElement('div');
    div.style = "background:white; position:fixed; left:50%;top:50%;transform:translate(-50%,-50%);z-index:10001;padding:2em;border-radius:12px;box-shadow:0 2px 20px #0003;";
    div.innerHTML = `
      <div>
        <label>Recherche (nom ou référence):<br>
          <input type="text" id="search-item-input" class="orders-input" style="width:200px;">
        </label>
        <div id="search-item-results" style="margin-top:1em;max-height:200px;overflow:auto"></div>
        <label>Qté:<input type="number" id="search-qty-input" class="orders-input" value="1" min="1" style="width:60px"></label>
        <label style="margin-left:1em;">Prix:<input type="number" id="search-price-input" class="orders-input" value="0" step="0.01" min="0" style="width:80px"></label>
        <button id="search-item-add" disabled>Ajouter</button>
        <button id="search-item-cancel">Annuler</button>
      </div>
    `;
    document.body.appendChild(div);

    let selectedItem = null;
    const input   = div.querySelector('#search-item-input');
    const results = div.querySelector('#search-item-results');

    input.oninput = (e) => {
      const val = e.target.value.trim().toLowerCase();
      if (!val) {
        results.innerHTML = "";
        selectedItem = null;
        div.querySelector('#search-item-add').disabled = true;
        return;
      }

      // 1) Récupère le device pour le stock choisi
      const stockId  = document.getElementById('order-stock-select').value;
      const device   = devices.find(d => d.stockId === stockId);
      const deviceId = device?.id;

      // 2) Garde les emplacements de ce device avec ItemId non nul
      const availableExternalIds = stockLocations
        .filter(loc => loc.DeviceId === deviceId && loc.ItemId)
        .map(loc => loc.ItemId);
      
      const found = items
        .filter(it => availableExternalIds.includes(it.externalId) && (
            it.name.toLowerCase().includes(val) || (it.externalId && it.externalId.toLowerCase().includes(val))))
            .slice(0, 10);

      // 6) Affiche
      results.innerHTML = found.map((it, idx) => `
        <div class="search-res" data-idx="${idx}">
          <b>${it.name}</b> (${it.externalId||''})
        </div>
      `).join('');

      // 7) Sélection clic
      results.querySelectorAll('.search-res').forEach((el, i) => {
        el.onclick = () => {
          selectedItem = found[i];
          results.querySelectorAll('.search-res').forEach(e2 => e2.style.background = "");
          el.style.background = "#bdf";
          div.querySelector('#search-item-add').disabled = false;
        };
      });
    };

    // Ajout au tableau de commande
    div.querySelector('#search-item-add').onclick = () => {
      if (!selectedItem) return;
      currentItems.push({
        itemId:        selectedItem.id,
        itemName:      selectedItem.name,
        itemExternalId:selectedItem.externalId,
        vendorId:      document.getElementById('order-vendor-select').value,
        totalQuantity:+div.querySelector('#search-qty-input').value || 1,
        unitPrice:    +div.querySelector('#search-price-input').value || 0,
        units:         selectedItem.units,
        vendorItem:    selectedItem.vendorItem
      });
      renderItemsTable();
      document.body.removeChild(div);
    };

    // Annulation
    div.querySelector('#search-item-cancel').onclick = () => {
      document.body.removeChild(div);
    };
  };

  // Fermeture de la modale
  function closeModal() {
    if (modal.querySelector('.modal-overlay'))
      modal.querySelector('.modal-overlay').style.display = 'none';
    modal.style.display = 'none';
    if (typeof onCancel === "function") onCancel();
  }
  btnClose.onclick = closeModal;
  btnCancel.onclick = closeModal;

  // Validation de la commande (vérif vendorId des items)
  btnSave.onclick = async () => {
    if (!currentItems.length) {
      customAlert("Veuillez ajouter au moins un article !");
      return;
    }
    const vendorId = document.getElementById('order-vendor-select').value;
    const stockId = document.getElementById('order-stock-select').value;
    // Vérifie pour chaque item si le vendor correspond
    const badItems = currentItems.filter(it => {
      const refItem = items.find(i => i.id === it.itemId || i.externalId === it.itemId);
      return refItem && refItem.vendorItem?.vendorId && refItem.vendorItem.vendorId !== vendorId;
    });
    if (badItems.length) {
      customAlert(
        "Erreur : Les articles suivants n'appartiennent pas au fournisseur sélectionné :<br>" +
        badItems.map(it => `• ${it.itemName}`).join('<br>') +
        "<br>Veuillez corriger avant de créer la commande."
      );
      return;
    }

    // Callback réel
    if (typeof onCreate === "function") {
      btnSave.disabled = true;
      btnSave.textContent = 'Création...';
      try {
        await onCreate({ vendorId, stockId, items: currentItems });
        closeModal();
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Créer la commande';
      }
    }
  };

  renderItemsTable();
}



/**
 * Affiche la modale de détail/édition d’une commande existante.
 * (Pré-remplissage, ajout/suppression articles, modif qté/prix, re-save)
 * @param {object} order
 * @param {Array} allItems
 * @param {Function} onSave
 * @param {Function} onCancel
 */
async function showOrderDetail(order, allItems, onSave, onCancel) {
  const modal     = document.getElementById('order-detail-modal');
  const title     = document.getElementById('detail-order-title');
  const table     = document.getElementById('order-detail-table-container');
  const totalSpan = document.getElementById('order-total');
  const btnSave   = document.getElementById('save-order-changes');
  const btnClose  = document.getElementById('close-order-modal');
  const btnCancel = document.getElementById('cancel-order-changes');

  // 1) Affiche la modale + loader
  modal.style.display = 'flex';
  const overlay = modal.querySelector('.modal-overlay');
  if (overlay) overlay.style.display = 'block';

  title.textContent     = '';
  totalSpan.textContent = '';
  btnSave.disabled      = true;
  table.innerHTML       = `<div class="spinner-container"><div class="spinner"></div><p>Chargement du détail de la commande…</p></div>`;

  // 2) Charge devices et stockLocations avant rendu
  const [devices, stockLocations] = await Promise.all([
    fetchAllDevices(),
    fetchAllStockLocations()
  ]);

  // 3) Prépare les items existants
  let itemsInOrder = order.items ? order.items.map(it => ({ ...it })) : [];

  // Fonction interne de rendu du tableau
  async function renderOrderTable() {
    // Enrichit unités et images
    await Promise.all(itemsInOrder.map(async it => {
      const info = allItems.find(i =>
        i.id === it.itemId || i.externalId === it.itemId ||
        i.id === it.itemExternalId || i.externalId === it.itemExternalId
      );
      if (info) it.units = info.units;
      if ((it.unitPrice == null || it.unitPrice === 0) && info?.id) {
        try { const p = await getPriceForItem(info.id); if (p > 0) it.unitPrice = p; }
        catch { it.unitPrice = 0; }
      }
      if (!it.imageUrl && info?.id && typeof tryFetchThumbnail === 'function') {
        try { it.imageUrl = await tryFetchThumbnail(info.id); }
        catch { it.imageUrl = null; }
      }
    }));

    // Construction du HTML du tableau
    const rows = itemsInOrder.map((it, idx) => `
      <tr data-item-id="${it.itemId}">
        <td>${it.imageUrl ? `<img src="${it.imageUrl}" width="40">` : '—'}</td>
        <td>${it.itemName}</td>
        <td>${it.itemExternalId || ''}</td>
        <td><input type="number" class="order-item-qty orders-input" value="${it.totalQuantity}" min="1" data-idx="${idx}"></td>
        <td>${
          it.units?.purchaseUnitRatio > 1
            ? `${it.units.purchaseUnitRatio} ${it.units.purchaseUnit.toLowerCase()} par ${it.units.dispenseUnit.toLowerCase()}`
            : (it.units?.dispenseUnit.toLowerCase() || 'pièce')
        }</td>
        <td><input type="number" class="order-item-price orders-input" value="${it.unitPrice != null ? it.unitPrice : ''}" step="0.01" min="0" data-idx="${idx}"></td>
        <td><button class="delete-item-btn" data-idx="${idx}">Suppr.</button></td>
      </tr>
    `).join('');

    table.innerHTML = `
      <button id="add-order-item-btn" class="orders-button">Ajouter un article</button>
      <table>
        <thead><tr><th>Image</th><th>Nom</th><th>Référence</th><th>Qté</th><th>Unité</th><th>Prix unitaire</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Pop-up pour ajouter un article
    document.getElementById('add-order-item-btn').onclick = () => {
      const div = document.createElement('div');
      div.style = "background:white; position:fixed; left:50%;top:50%;transform:translate(-50%,-50%);z-index:10001;padding:2em;border-radius:12px;box-shadow:0 2px 20px #0003;";
      div.innerHTML = `
        <div>
          <label>Recherche (nom ou référence):<br>
            <input type="text" id="search-item-input" class="orders-input" style="width:200px;">
          </label>
          <div id="search-item-results" style="margin-top:1em;max-height:200px;overflow:auto"></div>
          <label>Qté:<input type="number" id="search-qty-input" class="orders-input" value="1" min="1" style="width:60px"></label>
          <label style="margin-left:1em;">Prix:<input type="number" id="search-price-input" class="orders-input" value="0" step="0.01" min="0" style="width:80px"></label>
          <button id="search-item-add" disabled>Ajouter</button>
          <button id="search-item-cancel">Annuler</button>
        </div>
      `;
      document.body.appendChild(div);

      let selectedItem = null;
      const input   = div.querySelector('#search-item-input');
      const results = div.querySelector('#search-item-results');

      input.oninput = (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (!val) {
          results.innerHTML = "";
          selectedItem = null;
          div.querySelector('#search-item-add').disabled = true;
          return;
        }

        // 1) Récupère le device pour le stock choisi
        const stockId  = order.stockId;
        const device   = devices.find(d => d.stockId === stockId);
        const deviceId = device?.id;

        // 2) Garde les emplacements de ce device avec ItemId non nul
        const availableExternalIds = stockLocations
          .filter(loc => loc.DeviceId === deviceId && loc.ItemId)
          .map(loc => loc.ItemId);
        
          const found = allItems
          .filter(it => availableExternalIds.includes(it.externalId) && (
              it.name.toLowerCase().includes(val) || (it.externalId && it.externalId.toLowerCase().includes(val))))
              .slice(0, 10);

        // 6) Affiche
        results.innerHTML = found.map((it, idx) => `
          <div class="search-res" data-idx="${idx}">
            <b>${it.name}</b> (${it.externalId||''})
          </div>
        `).join('');

        // 7) Sélection clic
        results.querySelectorAll('.search-res').forEach((el, i) => {
          el.onclick = () => {
            selectedItem = found[i];
            results.querySelectorAll('.search-res').forEach(e2 => e2.style.background = "");
            el.style.background = "#bdf";
            div.querySelector('#search-item-add').disabled = false;
          };
        });
      };

      // Ajout au tableau de commande
      div.querySelector('#search-item-add').onclick = () => {
        if (!selectedItem) return;
        itemsInOrder.push({
          itemId:        selectedItem.id,
          itemName:      selectedItem.name,
          itemExternalId:selectedItem.externalId,
          totalQuantity:+div.querySelector('#search-qty-input').value || 1,
          unitPrice:    +div.querySelector('#search-price-input').value || 0,
          units:         selectedItem.units,
          vendorItem:    selectedItem.vendorItem
        });
        renderOrderTable();
        recalc();
        document.body.removeChild(div);
      };

      // Annulation
      div.querySelector('#search-item-cancel').onclick = () => {
        document.body.removeChild(div);
      };
    };

    // Events suppression, maj qté/prix
    table.querySelectorAll('.delete-item-btn').forEach(btn => {
      btn.onclick = () => { itemsInOrder.splice(+btn.dataset.idx, 1); renderOrderTable(); recalc(); };
    });
    table.querySelectorAll('.order-item-qty').forEach(inp => {
      inp.oninput = () => { itemsInOrder[+inp.dataset.idx].totalQuantity = +inp.value; recalc(); };
    });
    table.querySelectorAll('.order-item-price').forEach(inp => {
      inp.oninput = () => { itemsInOrder[+inp.dataset.idx].unitPrice = +inp.value; recalc(); };
    });
  }

  function recalc() {
    let total = 0;
    itemsInOrder.forEach(it => {
      const mult = it.units?.purchaseUnitRatio > 1 ? it.units.purchaseUnitRatio : 1;
      total += it.totalQuantity * mult * it.unitPrice;
    });
    totalSpan.textContent = `Total: ${total.toFixed(2)} €`;
  }

  // 4) Rendu final
  await renderOrderTable();
  recalc();

  // 5) Boutons et handlers
  btnSave.disabled    = false;
  btnSave.textContent = 'Enregistrer';
  btnSave.onclick     = async () => {
    btnSave.disabled    = true;
    btnSave.textContent = 'Enregistrement...';
    try {
      // 1) Création de la nouvelle commande avec modifications
      const newOrderId = await createPurchaseOrder({
        vendorId: order.vendorId,
        status:   'Suggested',
        stockId:  order.stockId,
        deviceId: (await fetchAllDevices()).find(d => d.stockId === order.stockId)?.id || null
      });
      // 2) Ajout des articles à la nouvelle commande
      for (const it of itemsInOrder) {

        // 1) Si le prix a été modifié, on le persiste dans la fiche article
        if (typeof it.unitPrice === 'number') {
          try {
            await updateItemUnitPrice(it.itemId, it.unitPrice);
          } catch (e) {
            console.warn('Impossible de mettre à jour le prix pour', it.itemName, e);
          }
        }
        // Ajout des articles à la nouvelle commande via l'ID retourné
        await addItemToPurchaseOrder(newOrderId, {
          itemId:        it.itemId,
          totalQuantity: it.totalQuantity,
          stockId:       order.stockId,
          deviceId:      (await fetchAllDevices()).find(d => d.stockId === order.stockId)?.id || null
        });
      }
      // 3) Suppression de l'ancienne commande
      await deletePurchaseOrder(order.id || order.orderId);

      customAlert('Commande recréée et mise à jour avec succès !');
      onSave();
      if (overlay) overlay.style.display = 'none';
      modal.style.display = 'none';
    } catch (err) {
      console.error(err);
      customAlert('Erreur lors de la recréation de la commande.');
    } finally {
      btnSave.disabled    = false;
      btnSave.textContent = 'Enregistrer';
    }
  };

  const confirmCancel = () => {
    customConfirm(
      'Si vous quittez sans enregistrer, vos modifications seront perdues. Continuer ?',
      () => {
        if (overlay) overlay.style.display = 'none';
        modal.style.display = 'none';
        onCancel();
      },
      () => {}
    );
  };

  btnClose.onclick  = confirmCancel;
  btnCancel.onclick = confirmCancel;
}


  /**
   * Affiche une fenêtre pour saisir la date de livraison.
   * @returns {Promise<string|null>} La date au format "YYYY-MM-DD" ou null si annulation.
   */
  function showDeliveryDateModal() {
    return new Promise(resolve => {
      const modal  = document.getElementById('delivery-date-modal');
      const input  = document.getElementById('delivery-date-input');
      const btnOk  = document.getElementById('delivery-date-confirm');
      const btnNo  = document.getElementById('delivery-date-cancel');

      // Remise à zéro
      input.value = '';
      modal.style.display = 'flex';

      const clean = () => {
        modal.style.display = 'none';
        btnOk .onclick = null;
        btnNo .onclick = null;
      };

      btnOk.onclick = () => {
        const date = input.value || null;
        clean();
        resolve(date);
      };
      btnNo.onclick = () => {
        clean();
        resolve(null);
      };
    });
}

/**
 * Ouvre une modale listant les items et un input % remise (par défaut 0).
 * @param {Array} items — chaque item { itemId, itemName, totalQuantity, unitPrice, units }
 * @returns {Promise<Object[]>} — resolve([{ itemId, discount }]) ou null si annulé
 */
function showDiscountModal(items) {
  return new Promise(resolve => {
    const modal = document.getElementById('discount-modal');
    const overlay = modal.querySelector('.modal-overlay');
    const container = document.getElementById('discount-table-container');
    const btnConfirm = document.getElementById('discount-confirm');
    const btnCancel  = document.getElementById('discount-cancel');

    // 1) Génère le tableau HTML
    container.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left">Article</th>
          <th style="text-align:right">Qté</th>
          <th style="text-align:right">PU (€)</th>
          <th style="text-align:right">Remise (%)</th>
        </tr></thead>
        <tbody>
          ${items.map(it => `
            <tr data-item-id="${it.itemId}">
              <td>${it.itemName}</td>
              <td style="text-align:right">${it.totalQuantity}</td>
              <td style="text-align:right">${it.unitPrice.toFixed(2)}</td>
              <td style="text-align:right">
                <input type="number" class="orders-input" style="width:60px; text-align:right" min="0" max="100" value="0">
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // 2) Affiche la modale
    modal.style.display = 'flex';
    overlay.style.display = 'block';

    // 3) Handlers
    btnCancel.onclick = () => {
      modal.style.display = 'none';
      resolve(null);
    };
    btnConfirm.onclick = () => {
      const discounts = Array.from(container.querySelectorAll('tr[data-item-id]')).map(row => ({
        itemId: row.dataset.itemId,
        discount: parseFloat(row.querySelector('.orders-input').value) || 0
      }));
      modal.style.display = 'none';
      resolve(discounts);
    };
  });
}




/**
 * Modale de création d'utilisateur (formulaire, spinner, vérif champs)
 * @param {object} params
 */
function showCreateUserModal({ groups, onCreate, onCancel }) {
  const modal     = document.getElementById('create-user-modal');
  const overlay   = modal.querySelector('.modal-overlay');
  const content   = modal.querySelector('.modal-content');
  const btnClose  = document.getElementById('close-create-user-modal');
  const btnCancel = document.getElementById('create-user-cancel');
  const btnConfirm= document.getElementById('create-user-confirm');
  const selGroup  = document.getElementById('create-user-group');

  // 1) Affiche la modale + overlay
  modal.style.display   = 'flex';
  overlay.style.display = 'block';

  // 2) Affiche un overlay spinner par-dessus la modal-content
  const spinnerOverlay = document.createElement('div');
  spinnerOverlay.className = 'spinner-container';
  // on positionne en absolute pour recouvrir tout le contenu
  Object.assign(spinnerOverlay.style, {
    position:   'absolute',
    top:        '0',
    left:       '0',
    width:      '100%',
    height:     '100%',
    background: 'rgba(255,255,255,0.8)',
    zIndex:     '1000'
  });
  spinnerOverlay.innerHTML = `
    <div class="spinner"></div>
    <p>Chargement…</p>
  `;
  content.appendChild(spinnerOverlay);

  // 3) Remplit la <select> des groupes (groups a déjà été récupéré en amont)
  selGroup.innerHTML = groups
    .map(g => `<option value="${g.id}">${g.name}</option>`)
    .join('');

  // 4) Lorsque la <select> est prête, on retire l’overlay spinner
  content.removeChild(spinnerOverlay);

  // 5) Fonctions de fermeture
  const close = () => {
    overlay.style.display = 'none';
    modal.style.display   = 'none';
    if (typeof onCancel === 'function') onCancel();
  };
  btnClose.onclick  = close;
  btnCancel.onclick = close;

  // 6) Validation & envoi
  btnConfirm.onclick = async () => {
    const name        = document.getElementById('create-user-name').value.trim();
    const pwd         = document.getElementById('create-user-password').value;
    const pwdConf     = document.getElementById('create-user-password-confirm').value;
    const userName    = document.getElementById('create-user-firstname').value.trim();
    const userSurname = document.getElementById('create-user-lastname').value.trim();
    const email       = document.getElementById('create-user-email').value.trim();
    const userGroupId = selGroup.value;

    // Vérifications


    // ** Vérifier que tous les champs sont remplis **
    if (!name||!pwd||!pwdConf||!userName||!userSurname||!email) {
      customAlert('Tous les champs sont obligatoires.');
      return;
    }
    // ** Vérifier le format de l'email **
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      customAlert('Veuillez saisir une adresse e-mail valide.');
      return;
    }
    // ** Vérifier que le mot de passe soit identique au champ de confirmation du mot de passe et que le mot de passe soit supérieur à 6 caractères **
    if (pwd.length < 6 || pwd !== pwdConf) {
      customAlert('La confirmation du mot de passe ne correspond pas. (Le mot de passe doit contenir au moins 6 caractères !)');
      return;
    }

    // Callback onCreate avec spinner dans le bouton
    if (typeof onCreate === 'function') {
      btnConfirm.disabled = true;
      // conserve l’HTML d’origine pour restaurer après
      const origHTML = btnConfirm.innerHTML;
      btnConfirm.innerHTML = `
        <div class="spinner" style="width:20px;height:20px;border-width:3px;margin-right:6px;"></div>
        <span>Création…</span>
      `;
      try {
        await onCreate({
          name,
          password: pwd,
          userName,
          userSurname,
          email,
          userGroupId,
          resetPasswordDuringNextLogin: false
        });
        close();
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = origHTML;
      }
    }
  };
}

/**
 * Affiche la modale d’édition d’un utilisateur.
 * @param {object} params
 * @param {{id:string,password?:string,userName:string,userSurname:string,email:string,userGroupId:string}} params.user  Données existantes de l’utilisateur
 * @param {Array<{id:string,name:string}>} params.groups  Liste des UserGroups
 * @param {Function} params.onSave  Callback appelé avec le payload {password,userName,userSurname,email,userGroupId, resetPasswordDuringNextLogin:false}
 * @param {Function} [params.onCancel]
 */
function showEditUserModal({ user, groups, onSave, onCancel }) {
  const modal      = document.getElementById('edit-user-modal');
  const overlay    = modal.querySelector('.modal-overlay');
  const btnClose   = document.getElementById('close-edit-user-modal');
  const btnCancel  = document.getElementById('edit-user-cancel');
  const btnSave    = document.getElementById('edit-user-save');
  const selGroup   = document.getElementById('edit-user-group');
  const inpPwd     = document.getElementById('edit-user-password');
  const inpPwdConf = document.getElementById('edit-user-password-confirm');
  const inpFirst   = document.getElementById('edit-user-firstname');
  const inpLast    = document.getElementById('edit-user-lastname');
  const inpEmail   = document.getElementById('edit-user-email');

  // Affiche la modale
  modal.style.display   = 'flex';
  overlay.style.display = 'block';

  // Remplit la <select> des groupes
  selGroup.innerHTML = groups
    .map(g => `<option value="${g.id}">${g.name}</option>`)
    .join('');
  selGroup.value = user.userGroupId;

  // Pré-remplissage des champs
  inpPwd.value       = '';
  inpPwdConf.value   = '';
  inpFirst.value     = user.userName || '';
  inpLast.value      = user.userSurname || '';
  inpEmail.value     = user.email || '';

  // Fermeture
  const close = () => {
    overlay.style.display = 'none';
    modal.style.display   = 'none';
    if (typeof onCancel === 'function') onCancel();
  };
  btnClose.onclick = close;
  btnCancel.onclick = close;

  // Sauvegarde
  btnSave.onclick = async () => {
    const pwd     = inpPwd.value;
    const pwdConf = inpPwdConf.value;
    const userName   = inpFirst.value.trim();
    const userSurname= inpLast.value.trim();
    const email      = inpEmail.value.trim();
    const userGroupId= selGroup.value;

    // Vérifs
    if (!pwd || !pwdConf || !userName || !userSurname || !email) {
      customAlert('Tous les champs sont obligatoires.');
      return;
    }
    if (pwd !== pwdConf) {
      customAlert('La confirmation du mot de passe ne correspond pas.');
      return;
    }

    // Callback onSave
    btnSave.disabled = true;
    btnSave.textContent = 'Enregistrement…';
    try {
      await onSave({
        password: pwd,
        userName,
        userSurname,
        email,
        userGroupId,
        resetPasswordDuringNextLogin: false
      });
      close();
    } catch (err) {
      console.error(err);
      customAlert('Erreur lors de la mise à jour.');
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = 'Enregistrer';
    }
  };
}

/**
 * Modale d’édition d’un outil existant (remplissage, validation, image)
 * @param {object} tool
 * @param {object} lists
 * @param {Function} onSave
 * @param {Function} [onCancel]
 */
function showToolEditModal(tool, lists, onSave, onCancel = () => {}) {
  const { vendors, manufacturers, categories } = lists;
  const isEdit = !!tool;
  const safe = (v, d = '') => (v == null ? d : v);
  // on garde la valeur API originale pour la re-soumettre
  const initialApiType = tool?.type ?? 'Consumable';

  // === Mapping unités API <-> UI (Bundles <-> Paquets) ======================
  const API2UI_UNIT = u => ({
    Pieces : 'Pièces',
    Bundles: 'Paquets'
  }[u] || u);

  const UI2API_UNIT = u => ({
    'Pièces' : 'Pieces',
    'Paquets': 'Bundles'
  }[u] || u);

  // --- Traductions statuts
  const STATUS_LABELS = {
    Defined:    'Défini',
    'Phase in': 'Entrée progressive',
    Released:   'Disponible',
    'Phase out':'Retrait progressif',
    Obsolete:   'Obsolète'
  };


  const TYPE_LABELS = {
  Consumable: 'Consommable'
  };

  /* Debug
  console.group('[showToolEditModal]', tool?.id || tool?.externalId);
  console.log('tool.units brut =', tool?.units);
  console.log('tool.units.dispenseUnit =', tool?.units?.dispenseUnit);
  console.log('tool.units.purchaseUnitRatio =', tool?.units?.purchaseUnitRatio);
  console.groupEnd();*/

  const rawDispense =
    tool?.units?.dispenseUnit ??
    tool?.units?.dispenseUnits ??
    null;

  // ---------------------------------------------------------------------------
  // 1) Données initiales
  // ---------------------------------------------------------------------------
  const initial = {
    name:           safe(tool?.name),
    externalId:     safe(tool?.externalId),
    type:           safe(tool?.type, 'Consommable'),
    status:         safe(tool?.status, 'Defined'),
    classification: safe(tool?.classification, 'C'),

    dispenseUnit:      rawDispense ? API2UI_UNIT(rawDispense) : 'Pièces',
    purchaseUnitRatio: Number(tool?.units?.purchaseUnitRatio) || 1,

    vendorId:      safe(tool?.vendorItem?.vendorId),
    orderCode:     safe(tool?.vendorItem?.orderCode),
    pricePerPiece: safe(tool?.vendorItem?.pricePerPiece, 0),
    barCode:       (tool?.vendorItem?.barCode ?? '').toString(),

    manufacturerId:   safe(tool?.manufacturerItem?.manufacturerId),
    manufacturerCode: safe(tool?.manufacturerItem?.orderCode),

    categoryId:    safe(tool?.categoryId),
    description:   safe(tool?.description),
    descriptionCulture: tool?.descriptionCulture || 'fr-FR',
    translationId: tool?.translationId || null,

    imageMeta:    tool?.imageMeta    || null,
    imagePreview: tool?.imagePreview || null
  };

  // ---------------------------------------------------------------------------
  // 2) Constantes UI
  // ---------------------------------------------------------------------------
  const STATUS = ['Defined','Phase in','Released','Phase out','Obsolete'];
  const statusOptions = (isEdit && initial.status !== 'Defined')
    ? STATUS.filter(s => s !== 'Defined')
    : STATUS;

  const CLASSIFICATIONS = ['A','B','C'];
  const UNITS = ['Pièces','Paquets'];

  // Catégories hiérarchiques
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
  const buildPath = id => {
    const arr = [];
    let cur = id;
    while (cur) {
      const c = catMap[cur];
      if (!c) break;
      arr.unshift(c.name);
      cur = c.parentId;
    }
    return arr.join(' > ');
  };
  const categoryOptions = categories
    .map(c => ({ id: c.id, label: buildPath(c.id) }))
    .sort((a,b) => a.label.localeCompare(b.label));

  const vendorOpts   = vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  const manuOpts     = manufacturers.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  const categoryOpts = categoryOptions.map(c => `<option value="${c.id}">${c.label}</option>`).join('');

  // ---------------------------------------------------------------------------
  // 3) Modale
  // ---------------------------------------------------------------------------
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'tool-edit-modal';
  modal.style.display = 'flex';

  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content" style="max-width:900px;width:95%;">
      <h2>${isEdit ? 'Modifier' : 'Créer'} un outil (* = obligatoire)</h2>

      <div style="display:flex;flex-direction:column;gap:0.8rem;">

        <!-- Identité -->
        <label>Nom *<br>
          <input id="tool-name" class="orders-input" value="${initial.name}">
        </label>

        <label>Référence *<br>
          <input id="tool-externalId" class="orders-input" value="${initial.externalId}">
        </label>

        <label>Type *<br>
          <input id="tool-type" class="orders-input"
                value="${TYPE_LABELS[initial.type] || initial.type}" disabled>
        </label>

        <label>Status *<br>
          <select id="tool-status" class="orders-select">
            ${statusOptions.map(s => `
              <option value="${s}" ${s===initial.status?'selected':''}>
                ${STATUS_LABELS[s] || s}
              </option>`).join('')}
          </select>
        </label>

        <label>Classification *<br>
          <select id="tool-classification" class="orders-select">
            ${CLASSIFICATIONS.map(c => `<option value="${c}" ${c===initial.classification?'selected':''}>${c}</option>`).join('')}
          </select>
        </label>

        <!-- Unités -->
        <fieldset style="border:1px solid #ccc;border-radius:4px;padding:0.6rem;">
          <legend>Unités</legend>

          <label>Unité de stock *<br>
            <select id="tool-dispenseUnit" class="orders-select">
              ${UNITS.map(u => `<option value="${u}" ${u===initial.dispenseUnit?'selected':''}>${u}</option>`).join('')}
            </select>
          </label>

          <label>Unité d'achat *<br>
            <input class="orders-input" value="Pièces" disabled>
          </label>

          <label>Ratio d'achat *<br>
            <input type="number" min="1" id="tool-purchaseUnitRatio" class="orders-input" value="${initial.purchaseUnitRatio}">
          </label>

          <div id="pack-conversion" class="inline-row" style="display:none;gap:.4rem;flex-wrap:wrap;align-items:center;margin-top:0.5rem;">
            <span>Taux de conversion (Paquet → Pièces) :  </span>
            <input type="number" id="pack-nb" class="orders-input" value="1" style="width:70px;">
            <span>Paquet(s) =</span>
            <input type="number" id="pack-pieces" class="orders-input" value="${initial.purchaseUnitRatio}" style="width:90px;">
            <span>Pièces</span>
          </div>
        </fieldset>

        <!-- Fournisseur -->
        <fieldset style="border:1px solid #ccc;border-radius:4px;padding:0.6rem;">
          <legend>Fournisseur</legend>
          <label>Fournisseur *<br>
            <select id="tool-vendorId" class="orders-select">
              <option value="">—</option>
              ${vendorOpts}
            </select>
          </label>
          <label>Code de commande *<br>
            <input id="tool-orderCode" class="orders-input" value="${initial.orderCode}">
          </label>
          <label>Prix unitaire *<br>
            <input type="number" step="0.01" id="tool-pricePerPiece" class="orders-input" value="${initial.pricePerPiece}">
          </label>
          <label>Code barre<br>
            <input id="tool-barCode" class="orders-input" type="text" inputmode="numeric" autocomplete="off" value="${initial.barCode}">
          </label>
        </fieldset>

        <!-- Fabricant -->
        <fieldset style="border:1px solid #ccc;border-radius:4px;padding:0.6rem;">
          <legend>Fabricant</legend>
          <label>Fabricant<br>
            <select id="tool-manufacturerId" class="orders-select">
              <option value="">—</option>
              ${manuOpts}
            </select>
          </label>
          <label>Code commande fabricant<br>
            <input id="tool-manufacturerCode" class="orders-input" value="${initial.manufacturerCode}">
          </label>
        </fieldset>

        <!-- Catégorie + Description -->
        <label>Catégorie<br>
          <select id="tool-categoryId" class="orders-select">
            <option value="">—</option>
            ${categoryOpts}
          </select>
        </label>

        <label>Description<br>
          <textarea id="tool-description" class="orders-input" rows="3">${initial.description || ''}</textarea>
        </label>

        <!-- Image -->
        <fieldset style="border:1px solid #ccc;border-radius:4px;padding:0.6rem;">
          <legend>Image</legend>

          <label>Titre<br>
            <input id="img-title" class="orders-input" value="${initial.imageMeta?.title || ''}" disabled>
          </label>

          <label>Type de document<br>
            <select id="img-doc-type" class="orders-select" disabled>
              <option value="Image" ${(!initial.imageMeta || initial.imageMeta.documentType==='Image')?'selected':''}>Image</option>
            </select>
          </label>

          <label class="inline-row" id="img-show-sfi-row" style="gap:.4rem;">
            <input type="checkbox" id="img-show-sfi" ${initial.imageMeta?.showInSfi ? 'checked' : ''} disabled>
            <span>Afficher dans le SFI</span>
          </label>

          <label>Remplacer le fichier (.png de préférence)<br>
            <input type="file" id="tool-image" accept="image/png,image/jpeg,image/webp">
          </label>

          <div id="img-preview" style="margin-top:0.5rem;"></div>
        </fieldset>

      </div>

      <div style="text-align:right;margin-top:1rem;">
        <button id="tool-cancel" class="orders-button">Annuler</button>
        <button id="tool-save"   class="orders-button">Enregistrer</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // ---------------------------------------------------------------------------
  // 4) Pré-affectations & UI
  // ---------------------------------------------------------------------------
  modal.querySelector('#tool-vendorId').value       = initial.vendorId       || '';
  modal.querySelector('#tool-manufacturerId').value = initial.manufacturerId || '';
  modal.querySelector('#tool-categoryId').value     = initial.categoryId     || '';

  // Pack / pièces
  const dispenseSelect  = modal.querySelector('#tool-dispenseUnit');
  const packDiv         = modal.querySelector('#pack-conversion');
  const ratioInput      = modal.querySelector('#tool-purchaseUnitRatio');
  const packPiecesInput = modal.querySelector('#pack-pieces');

  const refreshPackUI = () => {
    if (dispenseSelect.value === 'Paquets') {
      packDiv.style.display = 'flex';
      packPiecesInput.value = ratioInput.value;
    } else {
      packDiv.style.display = 'none';
    }
  };
  // Initial value already set via HTML selected attr, but re-apply to be safe
  dispenseSelect.value = initial.dispenseUnit;
  refreshPackUI();

  dispenseSelect.onchange = refreshPackUI;
  ratioInput.oninput       = () => { if (dispenseSelect.value === 'Paquets') packPiecesInput.value = ratioInput.value; };
  packPiecesInput.oninput  = () => { ratioInput.value = packPiecesInput.value; };

  // Preview image initiale
  const previewDiv = modal.querySelector('#img-preview');
  if (initial.imagePreview) {
    previewDiv.innerHTML = `<img src="${initial.imagePreview}" class="tool-img-preview">`;
  }

  // Preview live
  const fileInput = modal.querySelector('#tool-image');
  fileInput.onchange = () => {
    const f = fileInput.files[0];
    if (!f) {
      previewDiv.innerHTML = initial.imagePreview
        ? `<img src="${initial.imagePreview}" class="tool-img-preview">`
        : '';
      return;
    }
    const reader = new FileReader();
    reader.onload = e => { previewDiv.innerHTML = `<img src="${e.target.result}" class="tool-img-preview">`; };
    reader.readAsDataURL(f);
  };

  // ---------------------------------------------------------------------------
  // 5) Boutons
  // ---------------------------------------------------------------------------
  modal.querySelector('#tool-cancel').onclick = () => {
    document.body.removeChild(modal);
    onCancel();
  };

  modal.querySelector('#tool-save').onclick = () => {
    // --- 1) Récupère tous les champs ---
    const name           = modal.querySelector('#tool-name').value.trim();
    const externalId     = modal.querySelector('#tool-externalId').value.trim();
    const status         = modal.querySelector('#tool-status').value;
    const classification = modal.querySelector('#tool-classification').value;
    const dispenseUnitUI = modal.querySelector('#tool-dispenseUnit').value; // "Pièces" / "Paquets"
    const purchaseUnitRatio = Number(modal.querySelector('#tool-purchaseUnitRatio').value) || 1;
    const vendorId       = modal.querySelector('#tool-vendorId').value || null;
    const orderCode      = modal.querySelector('#tool-orderCode').value.trim();
    const pricePerPiece  = Number(modal.querySelector('#tool-pricePerPiece').value) || 0;
    const barCode        = modal.querySelector('#tool-barCode').value.trim() || undefined;
    const manufacturerId   = modal.querySelector('#tool-manufacturerId').value || null;
    const manufacturerCode = modal.querySelector('#tool-manufacturerCode').value.trim();
    const categoryId     = modal.querySelector('#tool-categoryId').value || null;
    const descriptionFR  = modal.querySelector('#tool-description').value.trim();
    const file           = modal.querySelector('#tool-image').files[0] || null;

    // --- 2) Vérifs basiques ---
    if (!name || !externalId || !vendorId || !orderCode) {
      customAlert('Merci de remplir tous les champs obligatoires (*).');
      return;
    }
    if (isEdit && tool.status !== 'Defined' && status === 'Defined') {
      customAlert('Impossible de repasser au statut "Defined".');
      return;
    }

    // --- 3) Calcule bundle versus pièce ---
    const isBundle = dispenseUnitUI === 'Paquets';
    const piecesPerBundle = purchaseUnitRatio;
    const purchasePackageQuantity = isBundle ? piecesPerBundle : 1;

    // --- 4) Construis le payload principal ---
    const itemPayload = {
      name,
      externalId,
      type: initialApiType,  // on garde la vraie valeur API ici
      status,
      classification,
      categoryId: categoryId || undefined,
      units: isBundle
        ? {
            purchaseUnit:      'Pieces',
            dispenseUnit:      'Bundles',
            purchaseUnitRatio: piecesPerBundle,
            dispenseUnitRatio: 1
          }
        : {
            purchaseUnit:      'Pieces',
            dispenseUnit:      'Pieces',
            purchaseUnitRatio: 1,
            dispenseUnitRatio: 1
          },
      vendorItem: {
        vendorId,
        orderCode,
        pricePerPiece,
        purchasePackageQuantity,
        ...(barCode && { barCode })
      },
      manufacturerItem: (manufacturerId || manufacturerCode)
        ? { manufacturerId, orderCode: manufacturerCode }
        : undefined
    };

    // ─── DEBUG : on affiche exactement ce qu’on envoie ────────────────────────
    console.group('[DEBUG][showToolEditModal] updateItem payload');
    console.log(JSON.stringify(itemPayload, null, 2));
    console.groupEnd();

    // --- 5) Prépare aussi description + image (hors du try principal) ---
    const translationPayload = descriptionFR !== initial.description
      ? {
          cultureCode:  initial.descriptionCulture || 'fr-FR',
          translation:  descriptionFR,
          translationId: initial.translationId
        }
      : null;

    const imageFilePayload = file
      ? { file, replace: true }
      : null;
    
    document.body.removeChild(modal);

    onSave({ itemPayload, translationPayload, imageFilePayload });
  };
}


/**
 * Modale de création d’un nouvel outil
 * @param {object} lists
 * @param {Function} onSave
 * @param {Function} [onCancel]
 */
function showToolCreateModal(lists, onSave, onCancel = () => {}) {
  const { vendors, manufacturers, categories } = lists;

  // Helpers
  const UI2API_UNIT = u => (u === 'Paquets' ? 'Bundles' : u === 'Pièces' ? 'Pieces' : u);

  const STATUS = ['Defined','Phase in','Released','Phase out','Obsolete'];
  const STATUS_LABELS = {
    Defined:    'Défini',
    'Phase in': 'Entrée progressive',
    Released:   'Disponible',
    'Phase out':'Retrait progressif',
    Obsolete:   'Obsolète'
  };
  const CLASSIFICATIONS = ['A','B','C'];
  const UNITS = ['Pièces', 'Paquets'];

  // Catégories affichées en chemin
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
  const buildPath = id => {
    const arr=[]; let cur=id;
    while (cur) { const c = catMap[cur]; if(!c) break; arr.unshift(c.name); cur = c.parentId; }
    return arr.join(' > ');
  };
  const categoryOptions = categories
    .map(c => ({ id: c.id, label: buildPath(c.id) }))
    .sort((a,b)=>a.label.localeCompare(b.label));

  const vendorOpts   = vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  const manuOpts     = manufacturers.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  const categoryOpts = categoryOptions.map(c => `<option value="${c.id}">${c.label}</option>`).join('');

  // Valeurs par défaut
  const initial = {
    status: 'Defined',
    classification: 'C',
    dispenseUnit: 'Pièces',
    purchaseUnitRatio: 1
  };

  // ------------- Modal HTML
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'tool-create-modal';
  modal.style.display = 'flex';

  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content" style="max-width:900px;width:95%;">
      <h2>Créer un outil (* = obligatoire)</h2>

      <div style="display:flex;flex-direction:column;gap:0.8rem;">

        <label>Nom *<br>
          <input id="c-name" class="orders-input">
        </label>

        <label>Référence *<br>
          <input id="c-externalId" class="orders-input">
        </label>

        <label>Type *<br>
          <input id="c-type" class="orders-input" value="Consommable" disabled>
        </label>

        <label>Status *<br>
          <select id="c-status" class="orders-select">
            ${STATUS.map(s=>`<option value="${s}" ${s===initial.status?'selected':''}>${STATUS_LABELS[s]||s}</option>`).join('')}
          </select>
        </label>

        <label>Classification *<br>
          <select id="c-classification" class="orders-select">
            ${CLASSIFICATIONS.map(c=>`<option value="${c}" ${c===initial.classification?'selected':''}>${c}</option>`).join('')}
          </select>
        </label>

        <fieldset>
          <legend>Unités</legend>

          <label>Unité de stock *<br>
            <select id="c-dispenseUnit" class="orders-select">
              ${UNITS.map(u=>`<option value="${u}" ${u===initial.dispenseUnit?'selected':''}>${u}</option>`).join('')}
            </select>
          </label>

          <label>Unité d'achat *<br>
            <input class="orders-input" value="Pièces" disabled>
          </label>

          <label>Ratio d'achat *<br>
            <input type="number" min="1" id="c-purchaseUnitRatio" class="orders-input" value="${initial.purchaseUnitRatio}">
          </label>

          <div id="c-pack-conversion" class="inline-row" style="display:none;margin-top:0.5rem;">
            <span>Taux de conversion Paquet → Pièces</span>
            <input type="number" id="c-pack-nb" class="orders-input" value="1" style="width:70px;">
            <span>Paquet(s) =</span>
            <input type="number" id="c-pack-pieces" class="orders-input" value="${initial.purchaseUnitRatio}" style="width:90px;">
            <span>Pièces</span>
          </div>
        </fieldset>

        <fieldset>
          <legend>Fournisseur</legend>
          <label>Fournisseur *<br>
            <select id="c-vendorId" class="orders-select">
              <option value="">—</option>
              ${vendorOpts}
            </select>
          </label>
          <label>Code de commande *<br>
            <input id="c-orderCode" class="orders-input">
          </label>
          <label>Prix unitaire *<br>
            <input type="number" step="0.01" id="c-pricePerPiece" class="orders-input" value="0">
          </label>
          <label>Code barre<br>
            <input id="c-barCode" class="orders-input" type="text" inputmode="numeric" autocomplete="off">
          </label>
        </fieldset>

        <fieldset>
          <legend>Fabricant</legend>
          <label>Fabricant<br>
            <select id="c-manufacturerId" class="orders-select">
              <option value="">—</option>
              ${manuOpts}
            </select>
          </label>
          <label>Code commande fabricant<br>
            <input id="c-manufacturerCode" class="orders-input">
          </label>
        </fieldset>

        <label>Catégorie<br>
          <select id="c-categoryId" class="orders-select">
            <option value="">—</option>
            ${categoryOpts}
          </select>
        </label>

        <label>Description<br>
          <textarea id="c-description" class="orders-input" rows="3"></textarea>
        </label>

        <fieldset>
          <legend>Image</legend>
          <label>Titre *<br>
            <input id="c-img-title" class="orders-input">
          </label>

          <label>Type de document *<br>
            <select id="c-img-doc-type" class="orders-select">
              <option value="Image" selected>Image</option>
            </select>
          </label>

          <div class="inline-row" id="c-img-show-sfi-row">
            <input type="checkbox" id="c-img-show-sfi" checked />
            <label for="c-img-show-sfi">Afficher dans le SFI</label>
          </div>

          <label>Fichier (.png de préférence) *<br>
            <input type="file" id="c-tool-image" accept="image/png,image/jpeg,image/webp">
          </label>
          <div id="c-img-preview" style="margin-top:0.5rem;"></div>
        </fieldset>

      </div>

      <div style="text-align:right;margin-top:1rem;">
        <button id="c-cancel" class="orders-button">Annuler</button>
        <button id="c-save"   class="orders-button">Créer</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // ----------- UI logique
  const dispenseSelect   = modal.querySelector('#c-dispenseUnit');
  const packDiv          = modal.querySelector('#c-pack-conversion');
  const ratioInput       = modal.querySelector('#c-purchaseUnitRatio');
  const packPiecesInput  = modal.querySelector('#c-pack-pieces');

  const refreshPackUI = () => {
    if (dispenseSelect.value === 'Paquets') {
      packDiv.style.display = 'flex';
      packPiecesInput.value = ratioInput.value;
    } else {
      packDiv.style.display = 'none';
    }
  };
  dispenseSelect.onchange = refreshPackUI;
  ratioInput.oninput      = () => { if (dispenseSelect.value === 'Paquets') packPiecesInput.value = ratioInput.value; };
  packPiecesInput.oninput = () => { ratioInput.value = packPiecesInput.value; };
  refreshPackUI();

  // Preview image
  const previewDiv = modal.querySelector('#c-img-preview');
  const fileInput  = modal.querySelector('#c-tool-image');
  fileInput.onchange = () => {
    const f = fileInput.files[0];
    if (!f) { previewDiv.innerHTML = ''; return; }
    const reader = new FileReader();
    reader.onload = e => previewDiv.innerHTML = `<img src="${e.target.result}" class="tool-img-preview">`;
    reader.readAsDataURL(f);
  };

  // ----------- Boutons
  modal.querySelector('#c-cancel').onclick = () => {
    document.body.removeChild(modal);
    onCancel();
  };

  modal.querySelector('#c-save').onclick = () => {
    // Récup champs
    const name           = modal.querySelector('#c-name').value.trim();
    const externalId     = modal.querySelector('#c-externalId').value.trim();
    const status         = modal.querySelector('#c-status').value;
    const classification = modal.querySelector('#c-classification').value;

    const dispenseUnitUI    = dispenseSelect.value;
    const purchaseUnitUI    = 'Pièces';
    const purchaseUnitRatio = Number(ratioInput.value) || 1;

    const vendorId      = modal.querySelector('#c-vendorId').value || null;
    const orderCode     = modal.querySelector('#c-orderCode').value.trim();
    const pricePerPiece = Number(modal.querySelector('#c-pricePerPiece').value) || 0;
    const barCode       = modal.querySelector('#c-barCode').value.trim();

    const manufacturerId   = modal.querySelector('#c-manufacturerId').value || null;
    const manufacturerCode = modal.querySelector('#c-manufacturerCode').value.trim();

    const categoryId    = modal.querySelector('#c-categoryId').value || null;
    const descriptionFR = modal.querySelector('#c-description').value.trim();

    // Image
    const imgTitle   = modal.querySelector('#c-img-title').value.trim();
    const imgDocType = modal.querySelector('#c-img-doc-type').value;
    const imgShow    = modal.querySelector('#c-img-show-sfi').checked;
    const file       = fileInput.files[0] || null;

    // Vérifs basiques
    if (!name || !externalId || !vendorId || !orderCode) {
      customAlert('Merci de remplir tous les champs obligatoires (*).');
      return;
    }
    if (!file || !imgTitle) {
      customAlert('Image : titre et fichier sont obligatoires.');
      return;
    }

    // --- 3) Calcule bundle versus pièce ---
    const isBundle = dispenseUnitUI === 'Paquets';
    const piecesPerBundle = purchaseUnitRatio;
    const purchasePackageQuantity = isBundle ? piecesPerBundle : 1;

    // --- 4) Construis le payload principal ---
    const itemPayload = {
      name,
      externalId,
      type: 'Consumable',
      status,
      classification,
      categoryId: categoryId || undefined,
      units: isBundle
        ? {
            purchaseUnit:      'Pieces',
            dispenseUnit:      'Bundles',
            purchaseUnitRatio: piecesPerBundle,
            dispenseUnitRatio: 1
          }
        : {
            purchaseUnit:      'Pieces',
            dispenseUnit:      'Pieces',
            purchaseUnitRatio: 1,
            dispenseUnitRatio: 1
          },
      vendorItem: {
        vendorId,
        orderCode,
        pricePerPiece,
        purchasePackageQuantity,
        ...(barCode && { barCode })
      },
      manufacturerItem: (manufacturerId || manufacturerCode)
        ? { manufacturerId, orderCode: manufacturerCode }
        : undefined
    };

    // Description : à créer via translations
    const translationPayload = descriptionFR
      ? { cultureCode: 'fr-FR', translation: descriptionFR }
      : null;

    // Image -> upload + meta
    const imageFilePayload = { file, replace: true };
    const imageMetaPayload = {
      name: imgTitle,
      documentType: imgDocType,
      showOnSfi: imgShow
    };

    document.body.removeChild(modal);
    onSave({ itemPayload, translationPayload, imageFilePayload, imageMetaPayload });
  };
}




// ============================================================================
// EXPORT DES HELPERS
// ============================================================================

module.exports = {
  withLoader,
  makeHardRefresher,
  getPriceForItem,
  updateItemUnitPrice,
  customAlert,
  customConfirm,
  exportOrderAsCsv,
  exportOrderAsPdf,
  showCreateOrderModal,
  showOrderDetail,
  wait, 
  showDeliveryDateModal,
  showDiscountModal,
  showCreateUserModal,
  showEditUserModal,
  showToolEditModal,
  showToolCreateModal
};
