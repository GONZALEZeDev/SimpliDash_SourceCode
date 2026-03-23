========================================================================================================================
        SimpliDash (Simplified Dashboard) : Le dashboard personnalisé AMGM pour la gestion des stocks d'outils          
========================================================================================================================

=== TECHNOLOGIES UTILISÉES ===

• Electron.js
• HTML / CSS
• Axios




=== DESCRIPTION ===

Ce logiciel est une interface ayant pour but de simplifier la gestion des stocks d'outils.
Elle comporte seulement les fonctionnalités nécessaires à la gestion personnelle de la société de mécanique générale AMGM.
Cette interface est conçue pour répondre à la fois aux besoins utilisateur et pour s'adapter à leur niveau de compréhension de l'informatique.
Son but n'est pas de recréer le dashboard par défaut proposé par SECO, mais de n'en garder que l'essentiel et l'adapter aux utilisateurs d'AMGM.




=== FONCTIONNALITÉS DES ONGLETS ===

Onglet Accueil :
• Affichage des 5 dernières transactions de l'armoire modèle AC300 (Seul appareil en service chez AMGM au 25/08/2025).
• Affichage des outils ayant atteint leur quantité critique et devant être réapprovisionnés.

Onglet Outils :
• Affichage des fiches outils répertoriées dans le système (Pagination par 50 fiches).
• Filtrage pour recherche plus précise.
• Option de recherche de fiche par la référence/le nom/le code barre de l'outil.
• Création/Modification/Suppression de fiche outil. (Création et modification avec seulement les informations nécessaires à la composition d'une fiche + informations utilisées par AMGM).

Onglet Commandes : 
• Liste des commandes existantes.
• Création/Modification/Suppression de fiche outil (la logique de modification proposée entraîne une création d'une nouvelle commande à partir des informations de la commande modifiée, obligé d'opérer ainsi pour permettre une modification des prix unitaires ET garder sa commande au complet sans la regénérer).
• Export PDF (Ajout de la date de livraison et des remises par article au moment de l'export par saisie de l'utilisateur).

Onglet Utilisateurs :
• Affichage des utilisateurs enregistrés dans le système.
• Création/Modification/Suppression d'utilisateurs.
• Révocation de badge.

Onglet Appareil :
• Affiche les appareils connectés au système.




=== STRUCTURE DU PROJET ===
La structure se situe principalement dans le dossier "renderer" !

Dossier "js/API" : C'est dans ce dossier que vont se situer les fonctions dans lesquelles on fait appel aux APIs de CRIBWISE. Ces fonctions sont classées dans le dossier dont le nom réfère à l'API utilisée.

Dossier "js/ui" : Ce dossier sert à gérer les fonctions servant à construire l'interface utilisateur.

"auth.js" : Il s'agit du fichier d'authentification au système de gestion de stock. C'est dans ce fichier qu'on retrouve la clé API spécifique au système personnel d'AMGM.

"index.js" : C'est dans ce dossier que le logiciel va fonctionner, c'est ici qu'elle démarre et fait les appels dans les autres fichiers en fonction des actions de l'utilisateur.

Dossier "style" : C'est ici qu'on retrouve "style.css" qui est le fichier regroupant les informations sur la construction esthétique du logiciel

"index.html" : C'est dans ce fichier que nous structurons les éléments affichés à l'écran. Il utilise "style.css" pour ensuite donner une direction artistique plus lisible.




=== INSTALLATION & CONFIGURATION ===

Installer dépendances :
npm install

(Optionnel) Ouvrir/Fermer au lancement du logiciel :
Dans le fichier "main.js" à la racine du projet, commenter/décommenter la ligne "win.webContents.openDevTools();".

Démarrer le logiciel :
npm start

Créer un build :
npm run dist (Une fois prêt, le .zip généré avec le logiciel se trouve à la racine du projet dans le dossier "dist").

Le dossier logiciel doit être téléversé sur un poste pour être utilisable, vous ne pouvez pas le démarrer depuis le CISA !




=== API CRIBWISE UTILISÉES ===

Lien de chaque API :
• Authentication : https://api.developer.cribwise.com/api-details#api=authentication
• Integration : https://api.developer.cribwise.com/api-details#api=integration
• Batch Job : https://api.developer.cribwise.com/api-details#api=batch
• Reporting : https://api.developer.cribwise.com/api-details#api=reporting-v1

========================================================================================================================
========================================================================================================================
