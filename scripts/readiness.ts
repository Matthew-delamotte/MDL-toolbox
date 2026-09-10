import "dotenv/config";
import { db } from "../src/lib/db";
import { getSettings } from "../src/lib/settings";
import { budgetSnapshot } from "../src/lib/providers/budget";

async function main() {
  const settings = await getSettings();
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  const keys = ["OPENAI_API_KEY", "TAVILY_API_KEY", "HUNTER_API_KEY", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"];
  const [companies, demoCompanies, campaigns, sources, usage, pending, uncertain, migrations] = await Promise.all([
    db.company.count(), db.company.count({ where: { isDemo: true } }),
    db.campaign.findMany({ select: { id: true, name: true, status: true, target: true, country: true, autopilotEnabled: true, dailyLimit: true, _count: { select: { leads: true } } } }),
    db.sourceConfig.findMany({ select: { name: true, enabled: true, lastRunAt: true } }), budgetSnapshot(),
    db.reviewItem.count({ where: { status: "PENDING" } }), db.message.count({ where: { status: { in: ["SENDING", "SEND_UNCERTAIN"] } } }),
    db.$queryRaw`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name`,
  ]);
  console.log(JSON.stringify({
    providers: Object.fromEntries(keys.map(key => [key, Boolean(process.env[key]?.trim())])),
    environment: { dryRun: settings.dryRun, seedDemo: process.env.SEED_DEMO, localDatabase: ["localhost", "127.0.0.1"].includes(databaseUrl.hostname), appUrl: process.env.APP_URL, authSecretConfigured: Boolean(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET) },
    settings: { autopilotEnabled: settings.autopilotEnabled, minLeadScore: settings.minLeadScore, dailyNewContactCap: settings.dailyNewContactCap, dailyEmailCap: settings.dailyEmailCap, fromEmailConfigured: Boolean(settings.fromEmail), replyToConfigured: Boolean(settings.replyTo), model: settings.aiModel },
    data: { companies, demoCompanies, realCompanies: companies - demoCompanies, pendingReviews: pending, uncertainSends: uncertain },
    realCompanies: await db.company.findMany({where:{isDemo:false},select:{id:true,name:true,domain:true,country:true,employeeEstimate:true,leads:{select:{id:true,totalScore:true,status:true}}}}),
    campaigns, sources, usage, migrations,
  }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL]") : "Readiness check failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
