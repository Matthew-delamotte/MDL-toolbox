# Mise en production — MDL Lead Engine

Dernière mise à jour : 10 septembre 2026.

## Architecture

| Brique | Service | État |
| --- | --- | --- |
| Application Next.js | Vercel — projet `mdl-toolbox` | En ligne : https://mdl-toolbox.vercel.app |
| Code source | GitHub — `Matthew-delamotte/MDL-toolbox` (branche `main`) | Connecté à Vercel : chaque `push` déclenche un déploiement |
| Base de données | Supabase PostgreSQL (`eu-west-1`) | 3 migrations appliquées, RLS active, compte administrateur créé |
| Envoi d'emails | Resend, domaine `mdl-advisory.com` | Clé API configurée ; SPF, DKIM et DMARC en place |
| Ordonnanceur | Inngest | **Non raccordé** — clés absentes |
| Réception des réponses | Boîte aux lettres sur `mdl-advisory.com` | **Absente** — aucun enregistrement MX sur le domaine racine |

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

Manquantes : `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `RESEND_WEBHOOK_SECRET`.

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

## Ce qu'il reste avant les recherches automatiques

1. Raccorder Inngest et synchroniser l'application sur `/api/inngest`.
2. Créer une boîte aux lettres sur `mdl-advisory.com` et poser ses enregistrements MX.
3. Créer le webhook Resend vers `/api/webhooks/resend` et renseigner `RESEND_WEBHOOK_SECRET`.
4. Créer une campagne réelle : cible, pays, effectif, limite quotidienne.
5. Passer `DRY_RUN` à `false`, puis activer le pilote automatique par paliers.
