// =============================================================================
// Fichier : reporting.js
// Rôle    : Module API pour accéder aux endpoints Reporting de CRIBWISE
// Projet  : SimpliDash (Electron, armoire intelligente SECO)
// Ce fichier contient les fonctions asynchrones pour requêter les transactions,
// niveaux d’alerte, emplacements de stock, etc. depuis l’API REST de CRIBWISE.
// Utilisation : Toutes les fonctions exportées ici retournent une Promise.
// Dépendance : axios (requêtes HTTP), getAccessToken/fetchToken (auth locale)
//
// NB : Les fonctions vérifient et rafraîchissent l’access token avant chaque appel.
// =============================================================================

const axios = require('axios');
const { getAccessToken, fetchToken } = require('../auth');


// Base URL commune à toutes les requêtes Reporting API
const BASE_URL = 'https://api_CRIBWISE_REPORTINGV1_ENDPOINT';  // Remplacez par l’URL de base de l'API Reporting V1 de Cribwise


/**
 * Récupère les transactions brutes de l’armoire via l’API Reporting
 * 
 * @returns {Promise<Array>} Liste des 5 dernières transactions (objet complet)
 * 
 * Étapes :
 * 1. Vérifie la présence d’un accessToken valide, sinon le rafraîchit.
 * 2. Appelle l’endpoint RawTransactions, trié du plus récent au plus ancien, limité à 5.
 * 3. Retourne le tableau de transactions (resp.data.value).
 */
async function fetchRawTransactions() {
  if (!getAccessToken()) await fetchToken(); // Rafraîchit le token si besoin
  const url = `${BASE_URL}/RawTransactions`
            + '?$orderby=CreatedOn%20desc'
            + '&$top=5';
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  // On pourrait ici filtrer avec $select pour n’avoir que les champs utiles
  return resp.data.value || [];
}

/**
 * Récupère la liste des articles dont le stock est à un niveau critique
 * (IsAtOrderPoint = true dans l’API)
 * 
 * @returns {Promise<Array>} Liste d’objets { ItemId, ItemName, Quantity, OrderPoint }
 * 
 * Étapes :
 * 1. Vérifie/rafraîchit l’accessToken.
 * 2. Appelle l’endpoint ItemLevels avec un filtre IsAtOrderPoint.
 * 3. Retourne les données utiles (stock au seuil de commande).
 */
async function fetchCriticalItemLevels() {
  if (!getAccessToken()) await fetchToken();
  const url =
    `${BASE_URL}/ItemLevels` +
    '?$filter=IsAtOrderPoint eq true' +
    '&$select=ItemId,ItemName,Quantity,OrderPoint';
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  return resp.data.value || [];
}

/**
 * Récupère tous les emplacements de stock connus par l’API
 * (utilisé pour afficher l’inventaire global ou localisé)
 * 
 * @returns {Promise<Array>} Liste d’objets StockLocation (contenant au moins ItemId)
 * 
 * Étapes :
 * 1. Vérifie/rafraîchit l’accessToken.
 * 2. Récupère tous les emplacements via l’endpoint StockLocations.
 * 3. Retourne la liste des emplacements.
 */
async function fetchAllStockLocations() {
  if (!getAccessToken()) await fetchToken();
  const url = `${BASE_URL}/StockLocations`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  // Réponse OData : les objets sont dans .value
  return resp.data.value || []; 
}

/**
 * Récupère les niveaux de stock pour tous les items
 * (utile pour le suivi des commandes ou du stock général)
 * 
 * @returns {Promise<Array>} Liste d’objets { ItemId, Quantity }
 * 
 * Étapes :
 * 1. Vérifie/rafraîchit l’accessToken.
 * 2. Appelle l’endpoint ItemLevels (récupère juste ItemId + Quantity pour optimisation).
 * 3. Retourne le tableau d’objets { ItemId, Quantity }.
 */
async function fetchItemLevels() {
  if (!getAccessToken()) await fetchToken();
  const url = `${BASE_URL}/ItemLevels?$select=ItemId,Quantity`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${getAccessToken()}` }
  });
  return resp.data.value || [];
}

/**
 * Export des fonctions API reporting pour utilisation dans les modules SimpliDash
 */
module.exports = {
  fetchRawTransactions,
  fetchCriticalItemLevels,
  fetchAllStockLocations,
  fetchItemLevels
};
