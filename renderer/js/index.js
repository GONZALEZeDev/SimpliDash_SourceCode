// ============================================================================
//  Point d'entrée principal de l’application Electron (SimpliDash)
//  Gestion des onglets, initialisation des interfaces, affichage & actions UI.
//  Ce fichier importe toutes les fonctions utilitaires nécessaires et définit
//  la logique de chaque onglet du dashboard (home, users, tools, orders, devices)
// ============================================================================

// --- IMPORTS DES MODULES ET FONCTIONS ---
const {
  withLoader, makeHardRefresher, getPriceForItem, updateItemUnitPrice,
  customAlert, customConfirm, exportOrderAsPdf,
  showCreateOrderModal, showOrderDetail, wait,
  showDeliveryDateModal, showCreateUserModal, showEditUserModal,
  showDiscountModal, showToolEditModal, showToolCreateModal 
} = require('./js/ui/helpers');

const { initTabs, showTab } = require('./js/ui/tabs');
const { displayRawTransactions, displayCriticalItems, displayUsers,
        displayTools, displayOrders, displayDevices } = require('./js/ui/tables');
const { fetchRawTransactions, fetchCriticalItemLevels, fetchAllStockLocations } = require('./js/api/reporting');
const {
  fetchAllUsers, fetchAllUserGroups, fetchAllUserKeys,
  prepareUsersDisplay, fetchItemImage, fetchAllDevices,
  fetchAllCategories, fetchItemsBatch, tryFetchThumbnail,
  fetchVendorById, fetchAllOrders, createPurchaseOrder,
  deletePurchaseOrder, addItemToPurchaseOrder, fetchAllVendors,
  fetchAllItems, fetchAllStocks, createUser,
  deleteUser, updateUser, deleteUserKey,
  upsertItemDescription, setItemImage, fetchAllManufacturers,
  updateItem, fetchItemById, fetchItemDescriptionBest, fetchItemInternalDocuments,
  downloadUrlAsDataUrl, createItem, createItemInternalDocument,
  deleteItem 
} = require('./js/api/integration');
const { fetchToken } = require('./js/auth');


// ============================================================================
//      INITIALISATION PRINCIPALE AU CHARGEMENT DE LA PAGE (window.onload)
// ============================================================================
window.onload = async () => {
  // Définition de tous les onglets de l’application (clé : nom, valeur : async function)
  const tabs = {
    // ==========================================================================
    // Onglet d'accueil : Transactions brutes + outils critiques
    // ==========================================================================
    home: async () => {
      showTab('home');
      // --- Affichage des transactions brutes ---
      const txContainer = document.getElementById('raw-transactions-container');
      const btnTx = document.getElementById('refresh-raw-transactions');
      btnTx.onclick = () => withLoader({
        btn: btnTx,
        container: txContainer,
        // Récupère et affiche les transactions
        fetchFn: async () => { await fetchToken(); return fetchRawTransactions(); },
        displayFn: displayRawTransactions,
        errorMessage: 'Erreur de récupération des transactions.'
      });
      btnTx.click();

      // --- Affichage des outils critiques (stock faible, etc) ---
      const toolsContainer = document.getElementById('tools-table-container');
      const btnTools = document.getElementById('refresh-tools');
      btnTools.onclick = () => withLoader({
        btn: btnTools,
        container: toolsContainer,
        // Récupération + enrichissement (image) des outils critiques
        fetchFn: async () => {
          const basics = await fetchCriticalItemLevels();
          return Promise.all(basics.map(async it => ({
            ...it,
            imageUrl: await fetchItemImage(it.ItemId)
          })));
        },
        displayFn: displayCriticalItems,
        errorMessage: 'Erreur de récupération des outils critiques.'
      });
      btnTools.click();
    },

    // ==========================================================================
    // Onglet utilisateurs : CRUD utilisateurs, gestion badges, etc
    // ==========================================================================
    users: async () => {
      showTab('users');
      const usersContainer = document.getElementById('users-table-container');
      const btnUsers       = document.getElementById('refresh-users');
      let currentUsers = [];
      let currentKeys = [];
    
      btnUsers.onclick = () => withLoader({
        btn: btnUsers,
        container: usersContainer,
        // Récupère users, groupes et badges
        fetchFn: async () => {
          const [users, groups, keys] = await Promise.all([
            fetchAllUsers(),
            fetchAllUserGroups(),
            fetchAllUserKeys()
          ]);
          currentUsers = users;
          currentKeys  = keys;   
          return prepareUsersDisplay(users, groups, keys);
        },
        // Affiche le tableau + bind les boutons action (delete, edit, revoke badge)
        displayFn: (container, usersDisplay) => {
          displayUsers(container, usersDisplay);
          const table = container.querySelector('table');
          if (!table) return;

          // --- Suppression utilisateur ---
          table.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.onclick = () => {
              const userId = btn.dataset.userId;
              const u = currentUsers.find(u => u.id === userId);
              customConfirm(
                `Voulez-vous vraiment supprimer l’utilisateur "${u.userSurname} ${u.userName}" ?`,
                async () => {
                  await deleteUser(userId);
                  customAlert('Utilisateur supprimé !');
                  tabs.users();
                },
                () => {}
              );
            };
          });
          
          // --- Modification utilisateur ---
          table.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.onclick = async () => {
              const userId = btn.dataset.userId;
              const u = currentUsers.find(u => u.id === userId);
              const groups = await fetchAllUserGroups();
              showEditUserModal({
                user: u,
                groups,
                onSave: async updatedData => {
                  await updateUser(userId, { id: userId, ...updatedData });
                  customAlert('Utilisateur modifié !');
                  tabs.users();
                },
                onCancel: () => {}
              });
            };
          });

          // --- Révocation badge (clé RFID) ---
          table.querySelectorAll('.revoke-badge-btn').forEach(btn => {
            btn.onclick = () => {
              const userId = btn.dataset.userId;
              const u = currentUsers.find(u => u.id === userId);
              customConfirm(
                `Révoquer le badge RFID de ${u.userSurname} ${u.userName} ?`,
                // On retrouve d'abord la clé RFID liée à cet utilisateur
                async () => {
                  const badgeKey = currentKeys.find(k =>
                    k.userId === userId && k.type === 'RFID'
                  );
                  if (!badgeKey) {
                    customAlert('Aucun badge RFID trouvé pour cet utilisateur.');
                    return;
                  }
                  // Puis on supprime la clé, en passant son vrai ID
                  await deleteUserKey(badgeKey.id);
                  customAlert('Badge révoqué !');
                  tabs.users(); // recharge la liste
                },
                () => {}
              );
            };
          });
        },
        errorMessage: 'Erreur de récupération des utilisateurs.'
      });
    
      // Chargement initial
      btnUsers.click();
    
      // --- Bouton "Créer un utilisateur" ---
      const btnCreateUser = document.getElementById('create-user-btn');
      btnCreateUser.onclick = async () => {
        const groups = await fetchAllUserGroups();
        showCreateUserModal({
          groups,
          onCreate: async userData => {
            try {
              await createUser(userData);
              customAlert('Utilisateur créé avec succès !');
              tabs.users();
            } catch (e) {
              customAlert('Erreur lors de la création de l’utilisateur.');
              console.error(e);
            }
          },
          onCancel: () => {}
        });
      };
    },

    // ==========================================================================
    // Onglet outils : CRUD outils, filtres, pagination, images, etc
    // ==========================================================================
    tools: async () => {
      showTab('tools');

      const container   = document.getElementById('alltools-table-container');
      const btn         = document.getElementById('refresh-tools-all');
      const createToolB = document.getElementById('create-tool-btn');

      // --- Fonction de récupération des données (multi-calls, batching) ---
      const fetchFn = async () => {
        const [devices, allStockLocs, categories, vendors, manufacturers] = await Promise.all([
          fetchAllDevices(),
          fetchAllStockLocations(),
          fetchAllCategories(),
          fetchAllVendors(),
          fetchAllManufacturers()
        ]);
        // Récupérer tous les items par lots (gestion de la pagination API)
        const allItems = [];
        let continuation = null;
        do {
          const { items, nextContinuation } = await fetchItemsBatch(continuation);
          allItems.push(...items);
          continuation = nextContinuation;
        } while (continuation);

        // Construction du mapping fournisseurs (pour affichage nom)
        const vendorIds = Array.from(new Set(
          allItems.map(it => it.vendorItem?.vendorId).filter(Boolean)
        ));
        const vendorMap = {};
        await Promise.all(vendorIds.map(async id => {
          try {
            const v = await fetchVendorById(id);
            vendorMap[id] = v.name;
          } catch {
            vendorMap[id] = id;
          }
        }));

        return { devices, allStockLocs, categories, allItems, vendorMap, vendors, manufacturers };
      };

      let hardRefresh = null; // fonction de reload fort (sera créée plus bas)

      // --- Affichage / UI / logiques du tableau des outils ---
      const displayFn = (container, { devices, allStockLocs, categories, allItems, vendorMap, vendors, manufacturers }) => {
        // Réactive le bouton "Créer un outil"
        createToolB.disabled = false;

        // Stockage listes partagées pour les modales (edit/create)
        const sharedLists = { vendors, manufacturers, categories };
        container._allItems    = allItems;
        container._sharedLists = sharedLists;

        // --- Préparation UI : filtres, recherche, select, etc ---
        const selectDevice   = document.getElementById('device-select');
        const filterCategory = document.getElementById('filter-category');
        const filterSupplier = document.getElementById('filter-supplier');
        const filterInStock  = document.getElementById('filter-in-stock');
        const searchInput    = document.getElementById('search-tool-input');
        const suggestionsBox = document.getElementById('search-tool-suggestions');

        // Remplit le select appareils
        selectDevice.innerHTML = devices.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

        // Helper chemin catégorie
        const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
        const getCatPath = id => {
          const path = [];
          let cid = id;
          while (cid) {
            const c = catMap[cid];
            if (!c) break;
            path.unshift(c.name);
            cid = c.parentId;
          }
          return path.join(' > ') || '—';
        };

        // Remplit les filtres
        filterSupplier.innerHTML = ['<option value="all">Tous</option>']
          .concat(Object.entries(vendorMap).map(([id,name]) => `<option value="${id}">${name}</option>`))
          .join('');
        filterCategory.innerHTML = ['<option value="all">Toutes</option>']
          .concat(categories.map(c => `<option value="${c.id}">${getCatPath(c.id)}</option>`))
          .join('');

        // Pré-calcule des ancêtres de chaque item (pour filtre caté)
        allItems.forEach(it => {
          const ancestors = [];
          let cid = it.categoryId;
          while (cid) {
            ancestors.unshift(cid);
            cid = catMap[cid]?.parentId;
          }
          it.categoryAncestors = ancestors;
        });

        // --- Recherche live outils ---
        let searchTerm = '';
        searchInput.oninput = e => {
          searchTerm = e.target.value.trim().toLowerCase();
          if (!searchTerm) {
            suggestionsBox.style.display = 'none';
            loadPage(1);
            return;
          }
          const hits = allItems.filter(it =>
            (it.name       && it.name.toLowerCase().includes(searchTerm)) ||
            (it.externalId && it.externalId.toLowerCase().includes(searchTerm)) ||
            (it.barCode    && it.barCode.toString().toLowerCase().includes(searchTerm))
          ).slice(0, 10);

          suggestionsBox.innerHTML = hits.map(it => `
            <div class="suggestion" data-id="${it.id}">
              ${it.name} (${it.externalId||''}${it.barCode? ' • ' + it.barCode : ''})
            </div>
          `).join('');
          suggestionsBox.style.display = hits.length ? 'block' : 'none';

          suggestionsBox.querySelectorAll('.suggestion').forEach(el => {
            el.onclick = () => {
              const sel = hits.find(h => h.id === el.dataset.id);
              searchInput.value = sel.name;
              searchTerm = sel.name.toLowerCase();
              suggestionsBox.style.display = 'none';
              loadPage(1);
            };
          });
        };

        // --- Bouton création d’outil (ouvre modale) ---
        createToolB.onclick = () => {
          showToolCreateModal(sharedLists, async ({ itemPayload, translationPayload, imageFilePayload }) => {
            try {
              // 1. Création item
              const created = await createItem(itemPayload);
              const newId = created.id;
              if (!newId) throw new Error('Impossible de déterminer l’ID de l’item créé');
              // 2. Description
              if (translationPayload?.translation?.trim()) {
                await upsertItemDescription(newId, translationPayload.cultureCode, translationPayload.translation);
              }
              // 3. Image
              if (imageFilePayload?.file) {
                await setItemImage(newId, imageFilePayload.file, false);
              }
              customAlert('Outil créé.');
              await hardRefresh();
            } catch (err) {
              console.error('API ERROR:', err);
              if (err?.errors) console.table(err.errors);
              customAlert('Erreur lors de la création de l’outil.');
            }
          });
        };

        // --- Pagination (chargement page par page avec filtres) ---
        const pageSize = 50;
        let currentPage = 1;
        const getFiltered = () =>
          allItems.map(it => ({
            ...it,
            categoryPath: getCatPath(it.categoryId),
            inStock: new Set(
              allStockLocs
                .filter(l => l.DeviceId === selectDevice.value)
                .map(l => l.ItemId)
            ).has(it.externalId)
          }))
          .filter(it =>
            (filterCategory.value === 'all' || it.categoryAncestors.includes(filterCategory.value)) &&
            (filterSupplier.value === 'all' || it.vendorItem?.vendorId === filterSupplier.value) &&
            (!filterInStock.checked || it.inStock) &&
            (!searchTerm ||
              (it.name       && it.name.toLowerCase().includes(searchTerm)) ||
              (it.externalId && it.externalId.toLowerCase().includes(searchTerm)) ||
              (it.barCode    && it.barCode.toLowerCase().includes(searchTerm)))
          );

        // --- Fonction de chargement d'une page d'outils ---
        const loadPage = async pageNumber => {
          currentPage = pageNumber;
          const filtered   = getFiltered();
          const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
          const start      = (pageNumber - 1) * pageSize;
          const pageItems  = filtered.slice(start, start + pageSize);

          // Enrichissement images + noms fournisseurs
          const enriched = await Promise.all(
            pageItems.map(async it => ({
              ...it,
              imageUrl: await tryFetchThumbnail(it.id),
              supplierName: vendorMap[it.vendorItem?.vendorId] || '—'
            }))
          );

          displayTools(container, enriched, pageNumber, totalPages);

          // Pagination boutons
          document.getElementById('prev-page').disabled = pageNumber === 1;
          document.getElementById('next-page').disabled = pageNumber >= totalPages;
          document.getElementById('prev-page').onclick = () => pageNumber > 1 && loadPage(pageNumber - 1);
          document.getElementById('next-page').onclick = () => pageNumber < totalPages && loadPage(pageNumber + 1);
        };

        // --- Edition / suppression d’un outil (boutons du tableau) ---
        const handleTableClick = async e => {
          const btnEl = e.target.closest('button.tool-action');
          if (!btnEl) return;

          const allItems = container._allItems;
          const lists    = container._sharedLists;
          const { action, id } = btnEl.dataset;
          const tool = allItems.find(t => t.id === id);
          if (!tool) return;

          if (action === 'edit') {
            // Edition : recharge item, enrichit desc + image, ouvre la modale d’édition
            const freshItem = await fetchItemById(id);
            const descInfo  = await fetchItemDescriptionBest(id);
            freshItem.description        = descInfo.translation;
            freshItem.descriptionCulture = descInfo.cultureCode;
            freshItem.translationId      = descInfo.translationId;
            const docs   = await fetchItemInternalDocuments(id);
            const imgDoc = docs.find(d => (d.documentType||'').toLowerCase()==='image');
            if (imgDoc) {
              freshItem.imageMeta = {
                id:           imgDoc.id,
                version:      imgDoc.version,
                title:        imgDoc.name||'',
                documentType: imgDoc.documentType,
                showInSfi:    !!imgDoc.showOnSfi
              };
              for (const url of [ imgDoc.path, imgDoc.path.replace('/download','/file') ].filter(Boolean)) {
                try { 
                  freshItem.imagePreview = await downloadUrlAsDataUrl(url);
                  break;
                } catch{} 
              }
            }
            if (!freshItem.imagePreview) {
              try { freshItem.imagePreview = await tryFetchThumbnail(id); }
              catch{}
            }
            showToolEditModal(freshItem, lists, async ({ itemPayload, translationPayload, imageFilePayload }) => {
              try {
                await updateItem(id, itemPayload);
                customAlert('Outil modifié.');
                if (translationPayload) {
                  await upsertItemDescription(id,
                                              translationPayload.cultureCode,
                                              translationPayload.translation);
                }
                if (imageFilePayload) {
                  await setItemImage(id, imageFilePayload.file, true);
                }
                await hardRefresh();
              } catch (err) {
                console.error('API ERROR:', err.response?.data || err);
                customAlert('Erreur lors de la mise à jour de l’outil.');
              }
            });
          }

          if (action === 'delete') {
            customConfirm(
              `Supprimer « ${tool.name} » ?`,
              async () => {
                await deleteItem(tool.id);
                customAlert('Outil supprimé.');
                await hardRefresh();
              },
              () => {}
            );
          }
        };

        // (Re)bind propre du click handler pour la table
        if (container._clickHandler) {
          container.removeEventListener('click', container._clickHandler);
        }
        container._clickHandler = handleTableClick;
        container.addEventListener('click', container._clickHandler);

        // Filtres UI
        selectDevice.onchange   = () => loadPage(1);
        filterCategory.onchange = () => loadPage(1);
        filterSupplier.onchange = () => loadPage(1);
        filterInStock.onchange  = () => loadPage(1);

        // Premier chargement
        loadPage(1);
      };

      // --- HARD REFRESH (reload + désactive le bouton "Créer" si erreur/loading) ---
      hardRefresh = makeHardRefresher({
        btn,
        container,
        fetchFn,
        displayFn,
        loadingMessage: 'Chargement des outils…',
        errorMessage:   'Erreur de chargement des outils.',
        onError:        () => { createToolB.disabled = false; }
      });

      // Désactive le bouton "Créer" tant que le chargement initial n’est pas fait
      createToolB.disabled = true;
      btn.onclick = async () => {
        createToolB.disabled = true;
        await hardRefresh();
      };
      btn.click();
    },

    // ==========================================================================
    // Onglet commandes : création, édition, suppression, export PDF
    // ==========================================================================
    orders: async () => {
      showTab('orders');
      const container = document.getElementById('orders-table-container');
      const btn = document.getElementById('refresh-orders');
      const sortDate = document.getElementById('sort-date');
      const btnCreateOrder = document.getElementById('create-order-btn');

      // --- Création de commande ---
      btnCreateOrder.onclick = async () => {
        container.innerHTML = `<div class="spinner-container"><div class="spinner"></div><p>Chargement des données…</p></div>`;
        btnCreateOrder.disabled = true;
        const [vendors, stocks, items, allDevices, stockLocations] = await Promise.all([
          fetchAllVendors(),
          fetchAllStocks(),
          fetchAllItems(),
          fetchAllDevices(),
          fetchAllStockLocations() 
          ]);
        btnCreateOrder.disabled = false;
        showCreateOrderModal({
          vendors,
          stocks,
          items,
          devices: allDevices,
          stockLocations,
          onCreate: async (commande) => {
            const allDevices = await fetchAllDevices();
            const device = allDevices.find(d => d.stockId === commande.stockId);
            if (!device) {
              customAlert("Aucun appareil trouvé pour ce stock, impossible de créer la commande.");
              return;
            }
            const deviceId = device.id;
            // Création de la commande "suggested"
            const payload = { vendorId: commande.vendorId, status: "Suggested", stockId: commande.stockId, deviceId };
            await createPurchaseOrder(payload);
            let newOrder = null;
            for (let tries = 0; tries < 10; tries++) {
              const allOrders = await fetchAllOrders();
              newOrder = allOrders.find(o =>
                (o.vendorId === commande.vendorId) &&
                (o.stockId === commande.stockId) &&
                (o.status === "Suggested") &&
                (!o.items || o.items.length === 0)
              );
              if (newOrder) break;
              await wait(1000);
            }
            if (!newOrder) {
              customAlert("Commande créée mais impossible de la retrouver (rafraîchis manuellement).");
              return;
            }
            // Ajout des items
            for (const it of (commande.items||[])) {
              let currentPrice;
              try { currentPrice = await getPriceForItem(it.itemId); } catch { currentPrice = null; }
              if (typeof it.unitPrice === "number" && currentPrice!==null && Math.abs(it.unitPrice-currentPrice)>0.001) {
                try { await updateItemUnitPrice(it.itemId, it.unitPrice); } catch(e) {
                  customAlert(`Erreur lors de la mise à jour du prix pour l’outil ${it.itemName}`);
                  continue;
                }
              }
              await addItemToPurchaseOrder(newOrder.id||newOrder.orderId, { itemId: it.itemId, totalQuantity: it.totalQuantity, stockId: commande.stockId, deviceId });
            }
            customAlert("Commande créée avec succès !");
            tabs.orders();
          },
          onCancel: () => tabs.orders()
        });
      };

      // --- Affichage commandes, tri et actions ---
      let currentOrders = [];
      const loadOrders = () => withLoader({
        btn,
        container,
        fetchFn: async () => { currentOrders = await fetchAllOrders(); return currentOrders; },
        // Trie et affiche, puis bind actions (export PDF, edit, delete)
        displayFn: (container, orders) => {
          const sorted = orders.sort((a,b)=>{
            const da=new Date(a.orderCreatedDate||a.creationDate);
            const db=new Date(b.orderCreatedDate||b.creationDate);
            return sortDate.value==='asc'?da-db:db-da;
          });
          displayOrders(container, sorted);

          // --- Export PDF ---
          container.querySelectorAll('.export-order-btn').forEach(el=>{
            el.onclick = async () => {
              const order = currentOrders.find(o => (o.orderId||o.id).toString() === el.dataset.orderId);
              if (!order) return;
              const deliveryDate = await showDeliveryDateModal();
              if (!deliveryDate) return;
              order.shippingDate = new Date(deliveryDate).toLocaleDateString('fr-FR');
              const itemsForDiscount = await Promise.all(order.items.map(async it => {
                let pu = it.unitPrice ?? 0;
                if (pu === 0) {
                  try { pu = await getPriceForItem(it.itemId); }
                  catch { pu = 0; }
                }
                return { ...it, unitPrice: pu };
              }));
              const discounts = await showDiscountModal(itemsForDiscount);
              if (discounts === null) return;
              order.discounts = discounts;
              await exportOrderAsPdf(order);
            };
          });
          // --- Edition commande ---
          container.querySelectorAll('.edit-order-btn').forEach(el=>{
            el.onclick = async () => {
              container.innerHTML=`<div class="spinner-container"><div class="spinner"></div><p>Chargement du détail de la commande…</p></div>`;
              const order=currentOrders.find(o=>(o.orderId||o.id).toString()===el.dataset.orderId);
              const allItems = await fetchAllItems();
              showOrderDetail(
                order,
                allItems,
                () => tabs.orders(),
                () => tabs.orders()
              );
            };
          });
          // --- Suppression commande ---
          container.querySelectorAll('.delete-order-btn').forEach(el=>{
            el.onclick = async () => {
              const order=currentOrders.find(o=>(o.orderId||o.id).toString()===el.dataset.orderId);
              customConfirm(
                `Voulez-vous vraiment supprimer la commande "${order.orderId||order.id}" ?`,
                async()=>{ await deletePurchaseOrder(order.id||order.orderId); customAlert("Commande supprimée !"); tabs.orders(); },
                ()=>{}
              );
            };
          });
        },
        loadingMessage: 'Chargement des commandes…',
        errorMessage: 'Erreur de récupération des commandes.'
      });
      btn.onclick = loadOrders;
      sortDate.onchange = loadOrders;
      btn.click();
    },

    // ==========================================================================
    // Onglet appareils : affichage, refresh
    // ==========================================================================
    devices: async () => { 
      showTab('devices');
      const container = document.getElementById('devices-table-container');
      const btn = document.getElementById('refresh-devices');
      const sortDate = document.getElementById('sort-date');
      const loadDevices = async () => {
        container.innerHTML = '<p>Chargement des appareils…</p>';
        const devices = await fetchAllDevices();
        displayDevices(container, devices);
      };
      btn.onclick = loadDevices;
      sortDate.onchange = loadDevices;
      btn.click();
    }
  };  

  // ==========================================================================
  // Initialisation de la gestion des onglets et affichage onglet home par défaut
  // ==========================================================================
  initTabs(tabs);
  tabs.home();
};
