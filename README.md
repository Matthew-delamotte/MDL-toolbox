# MDL Lead Engine

Application interne de prospection B2B pour MDL Advisory : découverte, contacts, recherche documentée, scoring, offres adaptatives, séquences email, analyse des réponses et passage à Matthew. Interface et analyses entièrement en français ; les emails envoyés aux prospects suivent la langue du destinataire (français pour la France et la Belgique francophone, anglais sinon).

## Démarrage local

Prérequis : Node.js 22.12+ ou 24, npm, Windows x64/macOS/Linux compatible avec `embedded-postgres`. Pas de Docker requis. Sous Linux, lancer en utilisateur normal : PostgreSQL refuse de fonctionner en root.

```sh
npm install
npm run dev
```

Ouvrir [l’application](http://localhost:3000). Au premier lancement, si `DATABASE_URL` est absent, le lanceur crée `.env`, un secret Auth.js et un mot de passe administrateur aléatoires. Se connecter avec **ADMIN_EMAIL** et **ADMIN_PASSWORD** dans ce fichier. Le mot de passe n’est pas affiché dans les logs. Le lanceur démarre PostgreSQL sur `127.0.0.1:54329`, applique la migration puis lance le seed et Next.js.

Les données restent dans `.local/postgres` après arrêt. `.env` et `.local` sont ignorés par Git. Ctrl+C arrête les processus démarrés par le lanceur. Un nouveau lancement conserve les comptes et les données existantes. Ne pas supprimer `.local` pour une simple relance.

Pour utiliser une base existante, copier `.env.example` vers `.env`, renseigner `DATABASE_URL`, `NEXTAUTH_SECRET`, `ADMIN_EMAIL` et un `ADMIN_PASSWORD` d’au moins 12 caractères. `LOCAL_DATABASE` doit rester absent ou `false`. Le compte n’est créé que par le seed ; pas d’inscription publique ni de mot de passe universel.

## Parcours de vérification

1. Se connecter et consulter les dix entreprises fictives initiales.
2. Dans **Campagnes**, créer une campagne, puis l’activer avec **Activer**.
3. Lancer **Trouver des prospects** ou **Lancer la recherche**. Sans Tavily, trois entreprises explicitement marquées `[Demo]` sont retournées ; relancer la même requête ne les duplique pas.
4. Ouvrir un lead, puis **Enrichir et qualifier** : recherche, contact si disponible, scoring et, à partir de 65, offre et brouillon.
5. Consulter les onglets **Recherche**, **Offre** et **Conversation**. Le bouton **Rédiger l’email** prépare un brouillon à relire.
6. Dans la conversation ou la **Messagerie**, **Simuler l’envoi**. Le message passe en « Simulé », aucun envoi réel n’est effectué.
7. Simuler une réponse, par exemple « Pouvons-nous convenir d’un rendez-vous ? » ou « Désabonnez-moi ». Vérifier le **Pipeline**, la file **À valider** et l’**Activité**.
8. Pour reprendre une conversation, utiliser **Écrire une réponse**, enregistrer le brouillon puis son bouton d’envoi.

## Architecture

```text
src/app                     Pages App Router, Auth.js, API et webhook signé
src/components              Interface, tableaux, graphique Recharts, Kanban
src/lib/domain              Règles pures, Zod, scoring, risques, langues
src/lib/providers           AIService, EmailProvider, Tavily, Hunter, CSV/alertes
src/lib/services            Acquisition, composition, envoi, réponses, maintenance
src/lib/repositories        Lecture du workspace et calcul des métriques
src/lib/jobs                13 fonctions Inngest et événements chaînés
prisma                      Schéma, migration SQL et seed idempotent
scripts                     Démarrage local et contrôles d’intégration
```

TypeScript strict ; PostgreSQL et Prisma ; Auth.js avec credentials et JWT de huit heures ; Tailwind CSS avec primitives shadcn/ui ; Zod ; OpenAI ; Resend ; Inngest ; Recharts. Les routes métier exigent une session et les mutations JSON contrôlent l’origine. Les secrets restent exclusivement dans les variables serveur. Settings montre leur présence sans jamais retourner leurs valeurs.

Les recherches et messages externes sont des données non fiables. Les faits sont `verified`, `inferred` ou `unknown`. La recherche OpenAI ne conserve `verified` que si l’extrait existe dans une source récupérée par Tavily. La proposition commerciale formule les besoins non confirmés comme hypothèses.

## Variables d’environnement

| Variable | Usage |
|---|---|
| `DATABASE_URL` | PostgreSQL ; URL TLS de Neon ou de votre hébergeur en production |
| `NEXTAUTH_SECRET` | Secret aléatoire de session, au moins 32 octets |
| `NEXTAUTH_URL`, `APP_URL` | URL exacte de l’application, HTTPS en production |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Création initiale du compte par le seed |
| `DRY_RUN` | `true` par défaut ; seul `false` autorise les envois réels |
| `SEED_DEMO` | `true` crée les données fictives ; `false` en production |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Recherche/scoring/offres/réponses ; modèle initial `gpt-4.1-mini` |
| `TAVILY_API_KEY` | Recherche web et preuves de recherche |
| `HUNTER_API_KEY` | Recherche de contacts et vérification d’email |
| `RESEND_API_KEY` | Envoi et récupération des messages reçus |
| `RESEND_FROM_EMAIL` | Expéditeur appartenant à un domaine vérifié |
| `RESEND_REPLY_TO` | Adresse de réception des réponses |
| `RESEND_WEBHOOK_SECRET` | Secret `whsec_...` du webhook Resend/Svix |
| `RESEND_ALERT_EMAIL` | Adresse distincte, facultative, pour les alertes transférées |
| `ALERT_ALLOWED_SENDERS` | Expéditeurs autorisés pour les alertes, séparés par des virgules |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Émission et validation des jobs Inngest |
| `LOCAL_DATABASE` | Réservé au lanceur local ; ne jamais activer sur Vercel |

Les réglages Identité, Pilote automatique et Email sont persistés en base. Une valeur d’expéditeur enregistrée dans les Réglages prévaut sur son défaut d’environnement. `DRY_RUN` ne peut pas être désactivé depuis le navigateur.

Sans OpenAI : heuristiques et textes déterministes marqués développement. Sans Tavily : fixtures explicites pour discovery, aucune vérification indépendante de recherche. Sans Hunter : aucun email réel inventé ; un contact sans adresse reste non contactable. Une erreur d’un fournisseur configuré est remontée ; elle ne se transforme pas silencieusement en résultat fictif. Sans Resend, les simulations fonctionnent ; un envoi réel est bloqué.

## Base, migrations et seed

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
```

`prisma/migrations/20260909000000_init/migration.sql` contient la migration versionnée complète. En développement, `npm run dev` applique les migrations automatiquement. En production, les appliquer explicitement avant de démarrer la nouvelle version. Utiliser une connexion PostgreSQL directe pour les migrations si le pooler du fournisseur ne supporte pas les opérations nécessaires.

Le seed ajoute les familles Workflow Rescue (600–1 200 €), Internal Tool Sprint (1 500–3 000 €), Ops & Data Cleanup (800–1 800 €), les sources et le compte administrateur. Avec `SEED_DEMO=true` et DRY_RUN, il ajoute dix sociétés, dix contacts, dix leads, une campagne et des conversations. Les fixtures sont marquées et ne peuvent pas recevoir d’emails réels. Le seed préserve les données existantes ; il ne réinitialise pas le mot de passe.

## Jobs Inngest

Dans un second terminal, pendant que Next.js tourne :

```sh
npm run inngest:dev
```

Ouvrir la console locale Inngest sur le port 8288 et vérifier l’application synchronisée avec `http://localhost:3000/api/inngest`. Les actions manuelles de l’interface fonctionnent sans daemon Inngest ; les tâches planifiées nécessitent ce daemon local ou le service Inngest en production.

| Fonction | Déclencheur |
|---|---|
| discover-opportunities | `mdl/opportunity.discover` pour une alerte email |
| discover-companies | `mdl/discover` ou lundi–vendredi à 07:00 UTC |
| enrich-company | `mdl/lead.process` |
| find-contacts | `mdl/contact.find` |
| research-lead | `mdl/lead.research` |
| score-lead | `mdl/lead.score` |
| generate-offer | `mdl/offer.generate` |
| generate-outreach | `mdl/outreach.generate` |
| send-outreach | `mdl/outreach.send` |
| process-reply | `mdl/reply.process` |
| send-followups | Chaque heure à :15 ou `mdl/followups.run` |
| daily-metrics | Chaque jour à 23:50 UTC |
| cleanup-bounces | Toutes les 30 minutes |

La découverte planifiée sélectionne les campagnes ACTIVE ayant leur autopilot activé et exige aussi le master switch. Les étapes émettent l’événement suivant avec des checkpoints et retries. Exemple depuis la console Inngest :

```json
{"name":"mdl/discover","data":{"query":"Shopify agencies United States","campaignId":"ID_DE_LA_CAMPAGNE"}}
```

Pour une alerte : `mdl/opportunity.discover` avec `subject`, `body` et éventuellement `sourceUrl`, `campaignId`. L’identité de l’employeur doit être vérifiée depuis la review queue ; aucun scraping d’Upwork n’est implémenté.

## Emails et webhooks Resend

Dans Resend, créer un webhook HTTPS vers **`/api/webhooks/resend`**, renseigner son secret dans `RESEND_WEBHOOK_SECRET`, et activer au minimum :

- `email.received`
- `email.delivered`
- `email.bounced`
- `email.complained`
- `email.suppressed`
- `email.failed` et `email.delivery_delayed`

La signature Svix est validée sur le corps brut. Le webhook déduplique par `svix-id`, et l’inbound par l’identifiant du message reçu. Un webhook `email.received` ne contient pas le corps : le service le récupère via l’API Receiving de Resend, rapproche l’expéditeur et le fil, puis arrête la séquence avant de déléguer l’analyse IA. Les messages ambigus ou dont l’authenticité n’est pas suffisante vont en revue. Les erreurs renvoient 503 pour permettre un retry Resend.

Une réponse stoppe les relances. Un désabonnement ou refus explicite supprime immédiatement le destinataire, avant tout appel IA. Bounce et complaint bloquent les prochains envois. Une absence avec date de retour identifiable permet une reprise après cette date, sinon revue. Aucun pixel de tracking n’est injecté.

L’adaptateur utilise une clé d’idempotence Resend stable par message. Une réservation transactionnelle PostgreSQL protège les plafonds et les doublons, y compris lors d’appels concurrents. Une issue d’envoi incertaine devient `SEND_UNCERTAIN` : vérifier le fournisseur manuellement, sans renvoi automatique risquant un doublon.

## Configuration DNS

1. Ajouter votre domaine ou sous-domaine d’envoi dans Resend.
2. Copier **les valeurs DNS affichées par Resend** pour SPF/DKIM ; attendre le statut Verified.
3. Configurer DMARC sur le domaine selon votre politique email et surveiller les rapports.
4. Pour recevoir les réponses, activer Receiving et ajouter les enregistrements MX fournis par Resend sur un sous-domaine dédié si la messagerie principale existe déjà. Ne pas remplacer les MX de votre messagerie courante par défaut.
5. Régler `fromEmail` et `replyTo` dans Settings. Le reply-to doit correspondre à l’adresse de réception configurée.
6. Pour les alertes transférées, utiliser une autre adresse `RESEND_ALERT_EMAIL` et renseigner `ALERT_ALLOWED_SENDERS`.

Documentation fournisseurs : [domaine Resend](https://resend.com/docs/dashboard/domains/introduction), [Receiving](https://resend.com/docs/dashboard/receiving/introduction), [Inngest Next.js](https://www.inngest.com/docs/getting-started/nextjs-quick-start).

## Déploiement Vercel + PostgreSQL Neon

1. Créer un projet PostgreSQL Neon et conserver sa chaîne de connexion TLS. Utiliser une base distincte de la base locale et activer ses sauvegardes.
2. Importer ce repository dans Vercel ; framework Next.js ; Node.js 22 ou 24 ; installation `npm ci` ; build `npm run build`.
3. Renseigner les variables serveur : URL PostgreSQL, secret Auth.js, URLs HTTPS, clés des fournisseurs. `SEED_DEMO=false`, `LOCAL_DATABASE=false`, **`DRY_RUN=true` pour la validation initiale**.
4. Depuis un environnement sécurisé connecté à la base cible : `npm run db:migrate`, puis `npm run db:seed` avec les identifiants initiaux. Ne pas exécuter le seed de démonstration sur la base de production.
5. Déployer l’application, se connecter, configurer Settings et le webhook Resend.
6. Dans Inngest, ajouter l’application déployée avec `https://votre-domaine/api/inngest` et vérifier les treize fonctions et les secrets de signature.
7. Exécuter le parcours complet en DRY_RUN. Les fonctions longues utilisent un `maxDuration` adapté ; choisir un plan Vercel compatible avec vos volumes et la durée maximale configurée.

Le build ne lance pas de migration sur une base distante et ne crée pas de compte de production. Aucun déploiement public ni configuration DNS n’est effectué automatiquement par ce projet.

## Activer les envois réels et AUTOPILOT

1. Configurer et vérifier Resend, l’expéditeur, la réception des réponses, le webhook signé et Inngest.
2. Renseigner OpenAI/Tavily/Hunter pour remplacer les fallbacks. Vérifier un vrai contact, les preuves de recherche et un brouillon adapté.
3. Passer `DRY_RUN=false` dans les variables serveur, puis redéployer/redémarrer. Les fixtures et adresses non vérifiées restent bloquées même en approbation manuelle.
4. Envoyer d’abord un message explicitement approuvé à un contact autorisé et vérifier l’événement de livraison et la réception d’une réponse.
5. Activer l’interrupteur principal dans les Réglages, puis le pilote automatique de la campagne active. Plafonds initiaux : 20 nouveaux contacts/jour au total, 40 emails/jour relances comprises, 10 nouveaux contacts/jour pour une nouvelle campagne. Les journées et cron utilisent UTC.
6. Les réponses automatiques exigent une confiance supérieure au seuil configuré (au moins 0,85), un sujet simple et aucun signal risqué. Contrats, négociation, engagement de délai, architecture complexe, sécurité et réglementation nécessitent Matthew.

## Plans gratuits et budgets fournisseurs

Les trois fournisseurs externes tournent sur des offres gratuites et OpenAI sur un compte sans crédits achetés. Chaque appel facturable est donc compté en base (`ProviderUsage`) et refusé une fois le plafond atteint, avant de partir chez le fournisseur. Les compteurs sont visibles dans **Réglages → Budgets fournisseurs**.

| Budget | Défaut | Fenêtre | Variable |
| --- | --- | --- | --- |
| Recherches Tavily | 800 | mois | `TAVILY_MONTHLY_LIMIT` |
| Recherches de domaine Hunter | 20 | mois | `HUNTER_SEARCH_MONTHLY_LIMIT` |
| Vérifications d’email Hunter | 40 | mois | `HUNTER_VERIFY_MONTHLY_LIMIT` |
| Requêtes OpenAI | 150 | jour | `OPENAI_DAILY_REQUEST_LIMIT` |

Une variable vide vaut « non configuré » et conserve le défaut ; elle ne met jamais le plafond à zéro. Le compteur est incrémenté **avant** l’appel : un timeout reste facturé par le fournisseur, il doit donc rester décompté.

Coût mesuré sur un vrai prospect qualifié de bout en bout : 1 crédit Tavily pour la découverte (partagé par toutes les entreprises trouvées), puis par lead 1 à 2 crédits Tavily de recherche, 1 recherche Hunter, au plus 1 vérification Hunter et 4 requêtes OpenAI. **Hunter est le facteur limitant** : environ 20 leads enrichis par mois sur l’offre gratuite.

### Écrire une requête de découverte

La recherche web répond aux requêtes du type « best Shopify agencies » par des articles de classement, pas par des entreprises. Le moteur écarte donc les listicles, les pages datées, les rubriques blog/guide/actualités et les annuaires connus (LinkedIn, Clutch, G2, Trustpilot…), et refuse la recherche avec un message explicite si tous les résultats sont de ce type. Décrivez les entreprises elles-mêmes :

- ✅ `independent skincare brand London online store operations`
- ✅ `third-party logistics companies Netherlands 20 employees`
- ❌ `best Shopify agencies UK` · ❌ `top automation tools 2026`

Le pays est déduit du domaine national quand il existe (`.co.uk`, `.fr`, `.de`) ; un `.com` reste inconnu jusqu’à ce que la recherche l’établisse. Les faits établis par la recherche (pays, secteur, effectif, outils) sont reportés sur la fiche entreprise, car c’est elle que lit le scoring : sans cela un vrai prospect reste bloqué sous le seuil de qualification.

Comportement au plafond, sans jamais interrompre le moteur :

- **Tavily épuisé** : la découverte renvoie une erreur explicite dans l’interface. La recherche par lead bascule sur l’heuristique de développement, clairement étiquetée.
- **Hunter épuisé** : aucun contact n’est retourné, le lead part en revue. Une vérification indisponible laisse l’adresse en `UNKNOWN`, jamais en `VERIFIED` : elle ne sera donc pas contactée automatiquement.
- **OpenAI épuisé, sans crédits ou clé invalide** : `insufficient_quota`, 401 et 429 déclenchent le repli sur l’heuristique locale, tracé dans Activity sous `AI_DEGRADED`. L’application continue de fonctionner, avec un scoring et une rédaction moins fins.

Si l’API OpenAI répond `insufficient_quota`, c’est que le compte n’a pas de crédits : créditez le projet, ou vérifiez dans le tableau de bord OpenAI l’option de partage des données qui ouvre un quota quotidien gratuit sur certains modèles. Tant que ce n’est pas fait, le moteur tourne en repli local.

## Tests et maintenance

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm audit
```

Les tests métier couvrent scoring, déduplication, règles autopilot, classification bilingue, relances, blacklist, validation des offres et adaptateurs simulés. Les tests d’intégration nécessitent PostgreSQL disponible (`npm run dev` ou `npm run db:local`). Ils créent un schéma temporaire dédié, y appliquent la vraie migration, exercent les services et effacent uniquement ce schéma. Toutes les clés externes sont neutralisées et DRY_RUN forcé pour ces tests.

Activity conserve les événements métier en DB ; l’écran affiche les 250 plus récents. Les sommes et taux du dashboard sont calculés sur les données persistées, avec simulations identifiées. Le taux de livraison ne compte que les événements réels. Le revenu correspond à la valeur renseignée des deals WON, pas à une comptabilité de paiements encaissés.

## Limites actuelles

- Un seul workspace, sans inscription publique, multi-tenancy ni facturation SaaS.
- La découverte web retourne des candidats et des estimations, pas une garantie de besoin commercial ou d’effectif. Les alertes non structurées requièrent une vérification de l’employeur et du contact.
- Les envois et réponses réels demandent les comptes fournisseurs, les DNS et les clés ; les tests locaux ne prouvent pas la délivrabilité de votre domaine.
- La prise de rendez-vous passe à Matthew et utilise son URL de calendrier ; le système ne réserve pas un créneau sans accord et sans intégration calendrier.
- Les plafonds et horaires sont en UTC. Les relances sont J+3/J+7 puis arrêt, même si le job se réveille plus tard.
- L’interface charge les données du workspace en une lecture ; elle convient à un MVP interne. Pour un très gros volume, ajouter pagination serveur et agrégations SQL.
