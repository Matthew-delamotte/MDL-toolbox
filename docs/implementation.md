# MDL Lead Engine — implementation contract

One Next.js application, PostgreSQL/Prisma, Auth.js credentials, Tailwind/shadcn primitives, Recharts. Local launcher provisions embedded PostgreSQL and a random local admin password; cloud uses DATABASE_URL. Dry run is the default and missing API credentials use explicitly labelled development fixtures only. Real contacts are never invented.

## Ownership and phases
1. Root: schema, local bootstrap, seed, auth, API, snapshot repository, documentation, integration verification.
2. Providers agent: src/lib/domain/**, src/lib/providers/**, tests/domain/**. Pure scoring, policy, classification, scheduling, offers; provider adapters and their tests.
3. Engine agent: src/lib/services/**, src/lib/jobs/**, /api/inngest, /api/webhooks/resend. Durable business pipeline, email safety, review resolution, reply processing.
4. UI agent: src/app except api, src/components/**, src/lib/utils.ts. Full authenticated app, all eleven views and interactive workflows.

## Shared conventions
- Prisma client: import { db } from '@/lib/db'. All status fields strings; see schema for defaults.
- Settings: import { getSettings } from '@/lib/settings'. Flat Settings object: dryRun, autopilotEnabled, minLeadScore, dailyEmailCap, dailyNewContactCap, autoReplyConfidence, companyName, senderName, signature, calendarUrl, fromEmail, replyTo, aiModel. API keys exclusively env. dryRun determined from env; persisted settings cannot override it.
- UI: GET /api/workspace returns WorkspaceSnapshot from src/lib/contracts.ts; POST /api/actions takes {action,...payload}, returns {ok:true,result} or {error}. All operations require auth and same-origin mutations.
- Engine exports from '@/lib/services/engine': discover({query,campaignId?}), processLead(leadId,campaignId?), generateOutreach(leadId,campaignId?), sendMessage(messageId,approved?), processReply({leadId,body,subject?,externalId?}), runFollowups(), resolveReview({id,decision,body?}), importCsv(csv), blacklistLead(leadId,reason).
- Providers agent publishes provider/domain contracts in src/lib/providers/index.ts and promptly informs engine. All AI outputs Zod validated; scores bounded, sum recomputed. Resend idempotency key stable per Message ID. Real sends require verified email, no suppression, no dry fixture, and credentials.
- Events: mdl/discover, mdl/lead.process, mdl/reply.process and cron. Inngest decomposes into checkpointed steps; UI synchronous processing supported for local dry run.

## Verification
Lint, strict TypeScript, domain and database integration tests, production build, migration deploy, browser login and end-to-end dry-run flow. No live email dispatched during development.

## Visual direction
Quiet B2B workspace: ink #172a36, blue #2666d1, slate #657587, pale background #f5f7fa, white surfaces. System sans typography, measured spacing, dense readable tables, discreet status badges. Sidebar, meaningful page actions, attention list, pipeline with drag/drop and accessible stage controls.
