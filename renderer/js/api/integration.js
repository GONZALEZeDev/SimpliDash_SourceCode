// ============================================================================
//  Fichier : integration.js
//  Projet  : SimpliDash (Electron, armoire intelligente SECO)
//  Rôle    : Wrapper central pour l’API Integration de Cribwise.
//            Contient tous les appels CRUD pour Users, Vendors, Devices, Items,
//            Orders, ainsi que des helpers pour l’UI (affichage, images, etc).
//            Gère la présence du token OAuth automatiquement pour chaque requête.
//  Dépendances : axios, ../auth (pour l’accès token)
//  Convention  : Toutes les fonctions exportées sont asynchrones (Promise).
// ============================================================================

// --- IMPORTS -----------------------------------------------------------
const axios = require('axios');
const {
  getAccessToken,
  fetchToken: fetchAuthToken
} = require('../auth');

// Base URL commune à toutes les requêtes Integration API
const BASE_URL = 'https://api_CRIBWISE_INTEGRATION_ENDPOINT';  // Remplacez par l’URL de base de l'API Integration de Cribwise

// ============================================================================
//  UTILS INTERNES : Authentification automatique avant appel API
// ============================================================================
/**
 * Vérifie et rafraîchit le token d'accès OAuth si nécessaire.
 * À appeler avant chaque requête API.
 */
async function ensureAuth() {
  if (!getAccessToken()) await fetchAuthToken();
}

// ============================================================================
//  USERS : Gestion utilisateurs (CRUD, groupes, clés, helpers UI)
// ============================================================================
/**
 * Récupère tous les utilisateurs Cribwise.
 * @returns {Promise<Array>} Liste des utilisateurs
 */
async function fetchAllUsers() {
  await ensureAuth();
  const resp = await axios.get(`${BASE_URL}/Users`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  return resp.data || [];
}

/**
 * Récupère tous les groupes d’utilisateurs disponibles.
 * @returns {Promise<Array>} Liste des groupes
 */
async function fetchAllUserGroups() {
  await ensureAuth();
  const resp = await axios.get(`${BASE_URL}/UserGroups`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  return resp.data || [];
}

/**
 * Récupère toutes les clés utilisateur (badges, RFID, etc.).
 * @returns {Promise<Array>} Liste de UserKeys
 */
async function fetchAllUserKeys() {
  await ensureAuth();
  const resp = await axios.get(`${BASE_URL}/UserKeys`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  return resp.data || [];
}

/**
 * Crée un nouvel utilisateur dans l’API.
 * @param {object} userPayload  { name, password, userName, userSurname, email, userGroupId, resetPasswordDuringNextLogin }
 * @returns {Promise<object>}   L’utilisateur créé
 */
async function createUser(userPayload) {
  await ensureAuth();
  const resp = await axios.post(
    `${BASE_URL}/Users`,
    userPayload,
    { headers: { Authorization: `Bearer ${getAccessToken()}` } }
  );
  return resp.data;
}

/**
 * Supprime un utilisateur et ses clés associées.
 * @param {string} id – ID technique de l’utilisateur à supprimer
 * @returns {Promise<void>}
 */
async function deleteUser(id) {
  await ensureAuth();
  const url = `${BASE_URL}/Users/${encodeURIComponent(id)}`;
  await axios.delete(url, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
}

/**
 * Met à jour les informations d’un utilisateur existant.
 * @param {string} userId   ID de l’utilisateur à modifier
 * @param {object} payload  Champs à mettre à jour (password, userName, email, etc.)
 * @returns {Promise<void>}
 */
async function updateUser(userId, payload) {
  if (!getAccessToken()) await fetchAuthToken();
  return axios.patch(
    `${BASE_URL}/Users/${encodeURIComponent(userId)}`,
    payload,
    { headers: { Authorization: `Bearer ${getAccessToken()}` } }
  );
}

/**
 * Supprime une clé utilisateur (badge RFID, etc.).
 * @param {string} keyId
 * @returns {Promise<void>}
 */
async function deleteUserKey(keyId) {
  await ensureAuth();
  await axios.delete(
    `${BASE_URL}/UserKeys/${encodeURIComponent(keyId)}`,
    { headers: { Authorization: `Bearer ${getAccessToken()}` } }
  );
}

/**
 * Helper d’affichage : structure les users pour l’UI (nom, groupe, badge, etc.).
 * @param {Array} users
 * @param {Array} groups
 * @param {Array} keys
 * @returns {Array<{firstName, lastName, group, hasRfid}>}
 */
function prepareUsersDisplay(users, groups, keys) {
  const groupMap = {};
  groups.forEach(g => { groupMap[g.id] = g.name; });

  const rfidSet = new Set(
    keys.filter(k => k.type === 'RFID').map(k => k.userId)
  );

  return users.map(u => ({
    id: u.id,
    firstName: u.userSurname,
    lastName:  u.userName,
    group:     groupMap[u.userGroupId] || '—',
    hasRfid:   rfidSet.has(u.id) ? 'Oui' : 'Non'
  }));
}

// ============================================================================
//  VENDORS & MANUFACTURERS : Fournisseurs et Fabricants
// ============================================================================
/**
 * Récupère tous les fournisseurs (vendors).
 * @returns {Promise<Array>} Liste de vendors { id, name, ... }
 */
async function fetchAllVendors() {
  await ensureAuth();
  const resp = await axios.get(`${BASE_URL}/Vendors`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  // Certains endpoints enveloppent dans .value
  return Array.isArray(resp.data.value)
    ? resp.data.value
    : (Array.isArray(resp.data) ? resp.data : []);
}

/**
 * Récupère tous les fabricants (manufacturers), gère la pagination si besoin.
 * @returns {Promise<Array>} Liste de manufacturers { id, name, ... }
 */ 
async function fetchAllManufacturers() {
  await ensureAuth();

  const result = [];
  let continuation = null;

  do {
    const { data } = await axios.get(
      `${BASE_URL}/Manufacturers`,
      {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        params : continuation ? { continuation } : undefined
      }
    );

    // Selon l’API, on adapte le nom du tableau renvoyé
    const list = data.manufacturers || data.items || data || [];
    result.push(...list);

    continuation = data.nextContinuation || data.continuation || data.continuationToken || null;
  } while (continuation);

  return result;
}

/**
 * Récupère un fabricant à partir de son ID.
 * @param {string} id
 * @returns {Promise<Object>} Détails du fabricant
 */
async function fetchManufacturerById(id) {
  await ensureAuth();
  const { data } = await axios.get(
    `${BASE_URL}/Manufacturers/${id}`,
    { headers: { Authorization: `Bearer ${getAccessToken()}` } }
  );
  return data;
}

/**
 * Récupère un fournisseur à partir de son ID.
 * @param {string} vendorId
 * @returns {Promise<Object>}
 */
async function fetchVendorById(vendorId) {
  await ensureAuth();
  const resp = await axios.get(`${BASE_URL}/Vendors/${encodeURIComponent(vendorId)}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  return resp.data;
}

// ============================================================================
//  ITEMS : Articles, images, descriptions, documents internes, etc.
// ============================================================================

/**
 * Résout l’ID technique (GUID) d’un item à partir de son externalId (code métier).
 * @param {string} code - externalId métier, ex. "P45371501"
 * @returns {Promise<string|null>} GUID ou null si non trouvé
 */
async function resolveItemGuid(code) {
  await ensureAuth();
  const url = `${BASE_URL}/Items?ExternalId=${encodeURIComponent(code)}`;
  const resp = await axios.get(url, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
  const items = Array.isArray(resp.data.value) ? resp.data.value : resp.data;
  return items.length ? items[0].id : null;
}

/**
 * Télécharge un binaire (image...) en Data-URL pour affichage direct (base64).
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function downloadAsDataUrl(url) {
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    responseType: 'arraybuffer'
  });
  const mime = resp.headers['content-type'];
  const b64  = Buffer.from(resp.data, 'binary').toString('base64');
  return `data:${mime};base64,${b64}`;
}

/**
 * Récupère la vignette native d’un item (image stockée par Cribwise).
 * @param {string} guid
 * @returns {Promise<string|null>} DataURL ou null si non trouvée
 */
async function tryFetchThumbnail(guid) {
  try {
    return await downloadAsDataUrl(`${BASE_URL}/Items/${encodeURIComponent(guid)}/image`);
  } catch (err) {
    if (err.response?.status !== 404) console.warn('Erreur thumbnail', err);
    return null;
  }
}

/**
 * Cherche un document interne de type Image si pas de vignette native.
 * @param {string} guid
 * @returns {Promise<string|null>}
 */
async function tryFetchInternalDocument(guid) {
  try {
    const listResp = await axios.get(
      `${BASE_URL}/Items/${encodeURIComponent(guid)}/internaldocuments`,
      { headers: { Authorization: `Bearer ${getAccessToken()}` } }
    );
    const docs = Array.isArray(listResp.data.value) ? listResp.data.value : listResp.data;
    const imgDoc = docs.find(d => d.documentType === 'Image');
    return imgDoc?.path ? await downloadAsDataUrl(imgDoc.path) : null;
  } catch (err) {
    if (![404,403].includes(err.response?.status)) console.warn('Erreur docs internes', err);
    return null;
  }
}

/**
 * Récupère l’image Data-URL d’un item à partir de son externalId.
 * @param {string} itemCode
 * @returns {Promise<string|null>}
 */
async function fetchItemImage(itemCode) {
  const guid = await resolveItemGuid(itemCode);
  if (!guid) { console.warn(`GUID non trouvé pour ${itemCode}`); return null; }
  return (await tryFetchThumbnail(guid)) || await tryFetchInternalDocument(guid);
}

/**
 * Récupère un item à partir de son ID technique.
 * @param {string} id - ID technique de l’item  
 * @returns {Promise<Object>} Objet item complet
 */
async function fetchItemById(id) {
  await ensureAuth();
  const { data } = await axios.get(`${BASE_URL}/Items/${id}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  return data;
}

/**
 * Récupère la meilleure description traduite disponible pour un item.
 * @param {string} id - ID technique de l’item
 * @returns {Promise<{translation:string, cultureCode:string, translationId:string|null}>}
 */
async function fetchItemDescriptionBest(id) {
  await ensureAuth();
  try {
    const { data } = await axios.get(
      `${BASE_URL}/Items/${id}/translations`,
      { headers: { Authorization: `Bearer ${getAccessToken()}` } }
    );

    // data = tableau [{ id, itemId, cultureCode, translation }, ...]
    const list = Array.isArray(data) ? data : [];

    const fr  = list.find(t => (t.cultureCode||'').toLowerCase() === 'fr-fr');
    const def = list.find(t => (t.cultureCode||'').toLowerCase() === 'default' || !t.cultureCode);
    const any = list[0];

    const pick = fr || def || any;
    if (!pick) return { translation: '', cultureCode: 'fr-FR', translationId: null };

    return {
      translation   : pick.translation || '',
      cultureCode   : pick.cultureCode || 'fr-FR',
      translationId : pick.id || null
    };
  } catch {
    return { translation: '', cultureCode: 'fr-FR', translationId: null };
  }
}

/**
 * Met à jour toutes les propriétés d’un item via PUT.
 * @param {string} id - ID de l’item
 * @param {object} payload - Corps de l’item (partiel ou complet)
 * @returns {Promise<Object>} Résultat de la requête
 */
async function updateItem(id, payload) {
  await ensureAuth();

  const url     = `${BASE_URL}/Items/${id}`;
  const token   = getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };

  // DEBUG pour suivi lors du dev
  console.group('[DEBUG][updateItem] Request');
  console.log('🆔 Item ID    →', id);
  console.log('URL          →', url);
  console.log('PAYLOAD      →', payload);
  console.groupEnd();

  const response = await axios.put(url, payload, { headers });
  return response;
}

/**
 * Supprime un item (article) à partir de son ID.
 * @param {string} itemId
 * @returns {Promise<Object>}
 */
async function deleteItem(itemId) {
  await ensureAuth();
  return axios.delete(`${BASE_URL}/Items/${itemId}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
}

/**
 * Crée ou met à jour une traduction (description) d’item pour une langue donnée.
 * @param {string} itemId
 * @param {string} cultureCode ex. "fr-FR"
 * @param {string} translation
 * @returns {Promise<string|null>} translationId ou null
 */
async function upsertItemDescription(itemId, cultureCode, translation) {
  if (!itemId) throw new Error('itemId manquant pour upsertItemDescription');
  if (!cultureCode) throw new Error('cultureCode manquant');
  if (translation == null) throw new Error('translation manquante');

  const token = getAccessToken();
  const h = { Authorization: `Bearer ${token}` };

  try {
    // 1. Chercher si une trad existe déjà pour cette langue
    const listUrl = `${BASE_URL}/Items/${itemId}/translations`;
    const listResp = await axios.get(listUrl, { headers: h });
    const existing = (listResp.data || []).find(t => t.cultureCode === cultureCode);

    if (existing?.id) {
      // PUT /ItemTranslations/{id}
      const putUrl = `${BASE_URL}/ItemTranslations/${existing.id}`;
      const body = {
        id: existing.id,
        version: existing.version,
        cultureCode,
        translation,
        itemId: itemId
      };
      await axios.put(putUrl, body, { headers: h });
      return existing.id;
    } else {
      // POST /ItemTranslations
      const postUrl = `${BASE_URL}/ItemTranslations`;
      const body = { itemId, cultureCode, translation };
      const r = await axios.post(postUrl, body, { headers: h });
      return r.headers?.location || null;
    }
  } catch (err) {
    console.error('[upsertItemDescription] ERROR', err.response?.data || err);
    throw err;
  }
}

/**
 * Ajoute ou remplace l’image d’un item via POST/PUT.
 * @param {string} itemId
 * @param {File|Blob} file
 * @param {boolean} replaceExisting
 */
async function setItemImage(itemId, file, replaceExisting = false) {
  if (!itemId || !file) throw new Error('itemId ou file manquant');
  if (!getAccessToken()) await fetchToken();

  const headers = { Authorization: `Bearer ${getAccessToken()}` };
  const url = `${BASE_URL}/Items/${itemId}/image`;

  // Prépare le form-data
  const fd = new FormData();
  fd.append('data', file, file.name);

  if (!replaceExisting) {
    // POST direct si on ne remplace pas
    return axios.post(url, fd, {
      headers: { ...headers, 'Content-Type': 'multipart/form-data' }
    });
  }

  // Essaye PUT, puis fallback POST si l’image n’existe pas encore
  try {
    return await axios.put(url, fd, {
      headers: { ...headers, 'Content-Type': 'multipart/form-data' }
    });
  } catch (err) {
    const apiErr = err.response?.data;
    const code   = apiErr?.errors?.content?.[0] || apiErr?.detail;
    if (code === 'ImageDocumentForItemDoesNotExist' || err.response?.status === 404) {
      // l’API refuse le PUT car aucune image n’existe encore → on crée avec POST
      return axios.post(url, fd, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' }
      });
    }
    throw err;
  }
}

/**
 * Ajoute un document interne (image ou autre) à un item.
 * @param {string} itemId
 * @param {object} doc : { title, referenceType, documentType, status, detail, showInSfi, file }
 */
async function createItemInternalDocument(itemId, doc) {
  await ensureAuth();
  const fd = new FormData();
  fd.append('Title',         doc.title);
  fd.append('DocumentType',  doc.documentType);
  fd.append('ReferenceType', doc.referenceType);
  fd.append('Status',        doc.status || 'Active');
  fd.append('Detail',        doc.detail || '');
  fd.append('ShowInSfi',     doc.showInSfi ? 'true' : 'false');
  fd.append('File',          doc.file);

  return axios.post(
    `${BASE_URL}/Items/${itemId}/internaldocuments`,
    fd,
    {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'multipart/form-data'
      }
    }
  );
}

/**
 * Récupère tous les documents internes d’un item (images, dessins, etc.)
 * @param {string} itemId
 */
async function fetchItemInternalDocuments(itemId) {
  await ensureAuth();
  try {
    const { data } = await axios.get(
      `${BASE_URL}/Items/${itemId}/internaldocuments`,
      { headers: { Authorization: `Bearer ${getAccessToken()}` } }
    );
    return Array.isArray(data) ? data : (data.items || []);
  } catch (e) {
    console.error('fetchItemInternalDocuments error', e.response?.data || e);
    throw e;
  }
}

/**
 * Convertit un Blob en DataURL (image en base64 pour affichage immédiat)
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Télécharge n’importe quelle URL en DataURL (pour images…)
 * @param {string} url
 * @returns {Promise<string>}
 */
async function downloadUrlAsDataUrl(url) {
  try {
    const res = await axios.get(url, { responseType: 'blob' });
    return blobToDataURL(res.data);
  } catch (err) {
    console.error('downloadUrlAsDataUrl error:', err.response?.status, err.response?.data || err);
    throw err;
  }
}

/**
 * Met à jour un document interne d’item.
 * @param {string} itemId
 * @param {string} docId
 * @param {object} payload
 */
async function updateItemInternalDocument(itemId, docId, payload) {
  await ensureAuth();
  // Ne PAS envoyer les champs readOnly (path, lastModified)
  const body = {
    id: docId,
    version: payload.version,          // obligatoire sinon 409/400
    name: payload.name,
    documentType: payload.documentType, // "Image", "Drawing", ...
    showOnSfi: payload.showOnSfi,
    itemId: itemId
  };
  const { data } = await axios.put(
      `${BASE_URL}/Items/${itemId}/internaldocuments/${docId}`,
      { headers: { Authorization: `Bearer ${getAccessToken()}` } }
    );
  return data;
}

/**
 * Crée un nouvel item (article) dans Cribwise.
 * @param {object} itemPayload
 * @returns {Promise<{id, data}>}
 */
async function createItem(itemPayload) {
  const url = `${BASE_URL}/Items`;
  try {
    const r = await axios.post(url, itemPayload, {
      headers: { Authorization: `Bearer ${getAccessToken()}` }
    });

    // Si 201 et corps vide, on extrait l’ID depuis le header Location
    let newId = r.data?.id || r.data?.itemId || r.data?.ItemId;
    if (r.status === 201 && !newId) {
      const loc = r.headers.location || r.headers.Location;
      if (loc) {
        const m = loc.match(/\/Items\/([^\/\?]+)/);
        if (m) newId = m[1];
      }
    }

    if (!newId) {
      console.warn('[createItem] Aucun ID trouvé après création');
    }
    return { id: newId, data: r.data };
  } catch (err) {
    // On remonte l’erreur pour affichage dans l’UI
    throw err.response?.data || err;
  }
}

/**
 * Récupère un item via son externalId.
 * @param {string} externalId
 * @returns {Promise<Object>}
 */
async function fetchItemByExternalId(externalId) {
  if (!getAccessToken()) await fetchToken();
  const url = `${BASE_URL}/Items?externalId=${encodeURIComponent(externalId)}`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  if (Array.isArray(resp.data) && resp.data.length) return resp.data[0];
  return resp.data;
}

// ============================================================================
//  DEVICES : Gestion des appareils connectés (CRUD, listing, etc.)
// ============================================================================
/**
 * Récupère tous les appareils connectés à la plateforme.
 * @returns {Promise<Array>} Liste d’objets Device
 */
async function fetchAllDevices() {
  await ensureAuth();
  const resp = await axios.get(`${BASE_URL}/Devices`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  return Array.isArray(resp.data.value)
    ? resp.data.value
    : (Array.isArray(resp.data) ? resp.data : []);
}

// ============================================================================
//  ITEMS PAGINATION : Listing paginé d’items (pour affichage, filtrage, etc.)
// ============================================================================
/**
 * Récupère tous les items, gère la pagination via tokens.
 * @returns {Promise<Array>} Tous les items (concaténés)
 */
async function fetchAllItems() {
  await ensureAuth();
  const items = [];
  let continuation = null;
  do {
    const headers = { Authorization: `Bearer ${getAccessToken()}` };
    if (continuation) headers['x-cribwise-continuation'] = continuation;
    const resp = await axios.get(`${BASE_URL}/Items`, { headers });
    const batch = Array.isArray(resp.data.value) ? resp.data.value : resp.data;
    items.push(...batch);
    continuation = resp.headers['x-cribwise-continuation'] || null;
  } while (continuation);
  return items;
}

/**
 * Récupère un batch d’items pour affichage page par page.
 * @param {string|null} continuation
 * @returns {Promise<{items:Array, nextContinuation:string|null}>}
 */
async function fetchItemsBatch(continuation = null) {
  await ensureAuth();
  const headers = { Authorization: `Bearer ${getAccessToken()}` };
  if (continuation) headers['x-cribwise-continuation'] = continuation;
  const resp = await axios.get(`${BASE_URL}/Items`, { headers });
  const items = Array.isArray(resp.data.value) ? resp.data.value : resp.data;
  const next = resp.headers['x-cribwise-continuation'] || null;
  return { items, nextContinuation: next };
}

// ============================================================================
//  CATEGORIES : Récupération de toutes les catégories d’articles
// ============================================================================
/**
 * Récupère toutes les catégories d’items (gère la pagination si besoin).
 * @returns {Promise<Array>} Tableau de catégories
 */
async function fetchAllCategories() {
  await ensureAuth();
  const categories = [];
  let continuation = null;
  do {
    const headers = { Authorization: `Bearer ${getAccessToken()}` };
    if (continuation) headers['x-cribwise-continuation'] = continuation;
    const resp = await axios.get(`${BASE_URL}/ItemCategories`, { headers });
    categories.push(...(Array.isArray(resp.data.value) ? resp.data.value : resp.data));
    continuation = resp.headers['x-cribwise-continuation'] || null;
  } while (continuation);
  return categories;
}

// ============================================================================
//  PURCHASE ORDERS : Commandes fournisseurs (listing, ajout, suppression, etc.)
// ============================================================================
/**
 * Récupère toutes les commandes avec enrichissement de chaque item (image, prix unitaire).
 * @returns {Promise<Array>} Tableau de commandes enrichies
 */
async function fetchAllOrders() {
  await ensureAuth();
  const resp = await axios.get(`${BASE_URL}/PurchaseOrders`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  const orders = Array.isArray(resp.data) ? resp.data : resp.data.value || [];
  // Pour chaque commande, récupère les items liés (avec image + prix)
  return Promise.all(orders.map(async order => {
    const itResp = await axios.get(`${BASE_URL}/PurchaseOrders/${order.id}/items`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` }
    });
    const raw = Array.isArray(itResp.data) ? itResp.data
      : (Array.isArray(itResp.data.value) ? itResp.data.value : []);
    const items = await Promise.all(raw.map(async it => ({
      ...it,
      imageUrl: await tryFetchThumbnail(it.itemId),
      unitPrice: it.pricePerPiece ?? 0, 
    })));
    return { ...order, items };
  }));
}

/**
 * Récupère tous les stocks (dépôts, emplacements, etc.)
 * @returns {Promise<Array>} Liste de stocks
 */
async function fetchAllStocks() {
  await ensureAuth();
  const resp = await axios.get(`${BASE_URL}/Stocks`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  return Array.isArray(resp.data.value)
    ? resp.data.value
    : (Array.isArray(resp.data) ? resp.data : []);
}

/**
 * Crée une nouvelle commande fournisseur (Purchase Order).
 * @param {Object} payload - vendorId, status, stockId, deviceId
 * @returns {Promise<string>} L’ID de la commande créée
 */
async function createPurchaseOrder(payload) {
  await ensureAuth();
  const resp = await axios.post(`${BASE_URL}/PurchaseOrders`, payload, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  const loc = resp.headers['location'] || '';
  const segments = loc.split('/');
  return segments[segments.length - 1] || null;
}

/**
 * Supprime une commande fournisseur par son ID.
 * @param {string} orderId
 * @returns {Promise<void>}
 */
async function deletePurchaseOrder(orderId) {
  await ensureAuth();
  await axios.delete(`${BASE_URL}/PurchaseOrders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
}

/**
 * Ajoute un item à une commande existante.
 * @param {string} orderId
 * @param {Object} item - { itemId, totalQuantity, stockId, deviceId }
 */
async function addItemToPurchaseOrder(orderId, item) {
  await ensureAuth();
  try {
    const resp = await axios.post(`${BASE_URL}/PurchaseOrderItems`, {
      orderId,
      itemId:        item.itemId,
      totalQuantity: item.totalQuantity,
      stockId:       item.stockId,
      deviceId:      item.deviceId,
    }, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
    return resp.data;
  } catch (e) {
    // Log detail d'erreur
    if (e.response) {
      console.error('Erreur API:', e.response.data);
      if (e.response.data.errors) {
        Object.entries(e.response.data.errors).forEach(([k,v]) =>
          console.error(`Erreur ${k}: ${v}`)
        );
      }
    } else console.error(e);
    throw e;
  }
}

/**
 * Supprime un item d'une commande (recherche de la ligne avant suppression).
 * @param {string} orderId
 * @param {string} itemId
 * @returns {Promise<void>}
 */
async function deleteItemFromPurchaseOrder(orderId, itemId) {
  await ensureAuth();
  // Récupère les lignes pour trouver l’ID de ligne correspondant
  const resp = await axios.get(`${BASE_URL}/PurchaseOrders/${encodeURIComponent(orderId)}/items`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  const lines = Array.isArray(resp.data.value) ? resp.data.value : resp.data;
  const line = lines.find(l => l.itemId === itemId);
  if (!line) throw new Error('Ligne non trouvée');
  // Suppression de la ligne d’item
  await axios.delete(`${BASE_URL}/PurchaseOrderItems/${encodeURIComponent(line.id)}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
}

// ============================================================================
//  EXPORTS : Toutes les fonctions utilisables par l’UI ou autres modules
// ============================================================================
module.exports = {
  BASE_URL,
  fetchAllUsers,
  fetchAllUserGroups,
  fetchAllUserKeys,
  prepareUsersDisplay,
  createUser,
  deleteUser,
  updateUser,
  fetchAllUserKeys,
  deleteUserKey,
  fetchAllVendors,
  fetchVendorById,
  fetchAllManufacturers,
  fetchManufacturerById,
  fetchAllItems,
  fetchItemsBatch,
  fetchAllCategories,
  resolveItemGuid,
  fetchItemImage,
  fetchItemById,
  fetchItemDescriptionBest,
  tryFetchThumbnail,
  updateItem,
  deleteItem,
  setItemImage,
  createItemInternalDocument,
  upsertItemDescription,
  fetchItemInternalDocuments,
  downloadUrlAsDataUrl,
  updateItemInternalDocument,
  createItem,
  fetchItemByExternalId,
  fetchAllDevices,
  fetchAllStocks,
  fetchAllOrders,
  createPurchaseOrder,
  deletePurchaseOrder,
  addItemToPurchaseOrder,
  deleteItemFromPurchaseOrder
};
