// ============================================================================
//  Fichier : auth.js
//  Projet  : SimpliDash (Electron, SECO/CRIBWISE)
//  Rôle    : Gestion centralisée de l’authentification OAuth2 client_credentials
//            pour obtenir et stocker le bearer token auprès de l’API Cribwise.
//  Dépendances : axios
//  Exporte : fetchToken (async, rafraîchit le token), getAccessToken (getter local)
// ============================================================================

const axios = require('axios');

// URL de l’endpoint d’authentification (Cribwise)
const AUTH_URL      = 'https://api_CRIBWISE_AUTHENTICATION_ENDPOINT';  // Remplacez par l’URL de l'API d'authentification de Cribwise
// Identifiants OAuth du client (fournis par SECO, à conserver confidentiel !)
const CLIENT_ID     = 'Confidential_ID_SECO_Dashboard';  // ID de la clé API générée sur le dashboard SECO
const CLIENT_SECRET = 'Confidential_API_Key_SECO_Dashboard';  // Clé API générée sur le dashboard SECO

// Token d’accès courant (en mémoire)
let accessToken = null;

/**
 * Récupère et stocke un nouvel access_token OAuth2 via le flow client_credentials.
 * @returns {Promise<string>} Le token d’accès fraîchement obtenu
 * 
 * Étapes :
 * 1. Prépare le form-urlencoded requis pour le flow client_credentials
 * 2. Appelle l’endpoint token (POST)
 * 3. Stocke localement le bearer token (accessToken)
 */
async function fetchToken() {
  const form = new URLSearchParams();
  form.append('grant_type', 'client_credentials');
  form.append('client_id', CLIENT_ID);
  form.append('client_secret', CLIENT_SECRET);
  form.append('scope', 'erp_api');

  const resp = await axios.post(AUTH_URL, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  accessToken = resp.data.access_token;
  return accessToken;
}

/**
 * Getter du token d’accès courant (non rafraîchi automatiquement)
 * @returns {string|null} Le token courant en mémoire, ou null si absent
 */
function getAccessToken() {
  return accessToken;
}

// Exporte les fonctions d’authentification
module.exports = { fetchToken, getAccessToken };
