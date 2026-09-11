# Mise en production — MDL Lead Engine

Dernière mise à jour : 10 septembre 2026.

## Architecture

| Brique | Service | État |
| --- | --- | --- |
| Application Next.js | Vercel — projet `mdl-toolbox` | En ligne : https://mdl-toolbox.vercel.app |
| Code source | GitHub — `Matthew-delamotte/MDL-toolbox` (branche `main`) | Connecté à Vercel : chaque `push` déclenche un déploiement |
| Base de données | Supabase PostgreSQL (`eu-west-1`) | 3 migrations appliquées, RLS active, compte administrateur créé |
| Envoi d'emails | Resend, domaine `mdl-advisory.com` | Clé API configurée ; SPF, DKIM et DMARC en place |
| Ordonnanceur | Inngest (Marketplace Vercel) | Raccordé — 13 fonctions synchronisées |
| Réception des réponses | Hostinger Mail | MX, SPF et DKIM posés ; boîte à confirmer côté Hostinger |

## Connexion à l'outil

- Adresse : https://mdl-toolbox.vercel.app
- Identifiant : `matthew.delamotte@mdl-advisory.com`
- Mot de passe : généré lors de la mise en production, à conserver dans un gestionnaire de mots de passe.

Pour changer le mot de passe : modifier `ADMIN_PASSWORD` dans Vercel, puis relancer le seed avec les URL Supabase
(`npx tsx prisma/seed.ts` avec `DATABASE_URL`/`DIRECT_URL` pointant sur Supabase). Le seed met à jour le compte
existant sans toucher aux données.

## Variables d'environnement

Les variables du projet Vercel sont de type « Sensitive » : leur valeur n'est plus lisible après création,
y compris par `vercel env pull`. Pour corriger une valeur, il faut la remplacer :

```
vercel env rm NOM --yes
printf '%s' "valeur" | vercel env add NOM production
```

Configurées : `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `APP_URL`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_DAILY_REQUEST_LIMIT`, `TAVILY_API_KEY`,
`TAVILY_MONTHLY_LIMIT`, `HUNTER_API_KEY`, `HUNTER_SEARCH_MONTHLY_LIMIT`, `HUNTER_VERIFY_MONTHLY_LIMIT`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`, `RESEND_ALERT_EMAIL`, `ALERT_ALLOWED_SENDERS`,
`DRY_RUN=true`, `SEED_DEMO=false`, `LOCAL_DATABASE=false`.

Toutes configurées. `INNGEST_EVENT_KEY` et `INNGEST_SIGNING_KEY` sont posées par l’intégration
Marketplace ; `RESEND_WEBHOOK_SECRET` a été ajoutée manuellement.

## Base de données

`prisma/schema.prisma` utilise deux URL Supabase :

- `DATABASE_URL` — pooler transactionnel, port 6543, `?pgbouncer=true`. Utilisé par l'application.
- `DIRECT_URL` — pooler de session, port 5432. Utilisé par les migrations.

Appliquer une migration en production :

```
npx prisma migrate deploy
```

avec les deux URL Supabase dans l'environnement. Le fichier `.env` local pointe sur PostgreSQL local ;
il ne faut pas le confondre avec la production.

## DNS de mdl-advisory.com

Enregistrements en place dans Vercel :

- `resend._domainkey` TXT — signature DKIM.
- `send` TXT — `v=spf1 include:amazonses.com ~all`.
- `send` MX — `feedback-smtp.eu-west-1.amazonses.com`.
- `_dmarc` TXT — `v=DMARC1; p=none; fo=1; adkim=r; aspf=r` (mode observation).

Manquant : les enregistrements MX du domaine racine. Sans eux, `matthew.delamotte@mdl-advisory.com`
ne peut pas recevoir de réponse. Resend gère l'envoi, pas la réception.

## Vérification du déploiement — 10 septembre 2026

17 contrôles HTTP exécutés sur https://mdl-toolbox.vercel.app : refus des requêtes non authentifiées,
connexion administrateur, `DRY_RUN` actif, onze pages rendues, rejet des mutations inter-origine et
des actions inconnues. Aucun échec. Fournisseurs détectés comme configurés : OpenAI, Resend, Tavily,
Hunter. Non configurés : Inngest, webhook Resend.

## Ordonnanceur

L'intégration Inngest de la Marketplace Vercel fournit les clés et l'application est synchronisée
sur `/api/inngest`. Les tâches planifiées tournent :

| Fonction | Rythme |
| --- | --- |
| `discover-companies` | 07:00 UTC, du lundi au vendredi |
| `send-followups` | toutes les heures |
| `cleanup-bounces` | toutes les 30 minutes |
| `daily-metrics` | 23:50 UTC |

La découverte planifiée ne fait rien tant que le pilote automatique global est désactivé.

## Le pilote automatique est un seul interrupteur

La découverte planifiée exige `autopilotEnabled` au niveau du réglage global **et** de la campagne.
Le même couple autorise l'envoi automatique : il n'existe pas de réglage « chercher sans envoyer ».

En mode simulation (`DRY_RUN=true`), un message traité par le pilote automatique est marqué
`SIMULATED` et le prospect passe en `CONTACTED` sans qu'aucun email ne parte. Activer le pilote
automatique en simulation consomme donc des prospects réels pour rien. La séquence correcte est :

1. Lancer des recherches manuelles, relire les brouillons dans la file de validation.
2. Quand les brouillons conviennent, passer `DRY_RUN` à `false`.
3. Activer le pilote automatique global, puis sur une seule campagne, à 5 envois par jour.
4. Monter progressivement si la délivrabilité tient.

## Qualité de la découverte — mesures du 10 septembre 2026

Quatre requêtes réelles sondées sur Tavily ont renvoyé 19 résultats, dont 9 n'étaient pas des
entreprises : sites gouvernementaux, PDF, classements « Les 39 meilleurs sites », sites d'offres
d'emploi. Les filtres ont été étendus en conséquence et ramènent le bruit à environ un résultat
sur dix.

Le nom d'entreprise ne provient plus du titre de la page quand celui-ci se lit comme une phrase :
`h2k.fr` donne « H2K » et non « Entreprise de logistique et stockage de marchandises, préparation
de commandes et expéditions pour professionnels », qui se retrouvait dans l'objet de chaque message.

Le levier principal reste la formulation du ciblage. Décrire les entreprises — « PME logistique
e-commerce préparation de commandes » — ramène des entreprises ; décrire leur problème ramène des
articles sur ce problème. Le ciblage est modifiable depuis la fiche campagne.

## Rédaction des messages

Le corps de l'email était un gabarit figé dans le code : l'IA ne remplissait qu'un bout de phrase et
tous les prospects recevaient les quatre mêmes phrases. C'est exactement ce qui fait reconnaître un
envoi automatique. Le modèle rédige maintenant l'objet et les paragraphes à partir des faits relevés
sur l'entreprise.

Ce qui reste déterministe, donc indépendant du modèle : l'accueil, la signature et la ligne de
désinscription. La conformité ne dépend jamais d'une sortie probabiliste.

Trois contrôles s'appliquent au texte écrit, dans `src/lib/providers/outreach.ts` :

| Contrôle | Effet |
| --- | --- |
| `outreachIssues` | Un prix, un délai chiffré, une garantie ou un lien fait basculer sur le gabarit de repli. |
| `styleIssues` | Les tics de registre conseil — « ce type de », « permettrait de », « n'hésitez pas » — sont cités au modèle pour une réécriture. |
| `revisionNote` | Un brouillon trop long déclenche la même passe unique de réécriture, conservée seulement si elle améliore le texte. |

Longueurs visées : 110 mots au premier contact, 70 à la relance, 45 au dernier message. La séquence
est jour 0, jour 3 et jour 7 ; chaque message doit se tenir seul et apporter un angle nouveau.

Pas d'images ni de HTML : dans un premier message froid, une image est un signal de campagne, pèse
sur la délivrabilité et se voit immédiatement. La mise en forme passe par des paragraphes courts et
une signature propre.

## Ce qu'il reste avant les recherches automatiques

1. Raccorder Inngest et synchroniser l'application sur `/api/inngest`.
2. Confirmer que la boîte `matthew.delamotte@mdl-advisory.com` existe bien dans Hostinger.
3. Passer `DRY_RUN` à `false` une fois les brouillons validés.
4. Activer une ou deux campagnes parmi les sept brouillons créés (France, Belgique, Suisse, Luxembourg, Royaume-Uni, Irlande, États-Unis).
5. Passer `DRY_RUN` à `false`, puis activer le pilote automatique par paliers.

## Plafond de débit

Le moteur est limité par le quota Hunter de l’offre gratuite : 20 recherches de domaine et
40 vérifications d’email par mois. Cela plafonne la prospection à une vingtaine de nouvelles
entreprises enrichies par mois, quelles que soient les campagnes activées. Tavily (800 recherches
par mois) et OpenAI (150 requêtes par jour) ne sont pas limitants. Pour dépasser ce plafond,
il faut passer Hunter sur une offre payante et relever `HUNTER_SEARCH_MONTHLY_LIMIT` et
`HUNTER_VERIFY_MONTHLY_LIMIT`.
