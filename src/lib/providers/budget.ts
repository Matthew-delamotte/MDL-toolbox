// The database client is imported lazily so metering stays a leaf concern of the provider
// layer: importing an adapter never opens a connection.
const database = async () => (await import("@/lib/db")).db;

// Every external provider runs on a free plan. A single automatic run can otherwise
// consume a whole monthly allowance, so each paid call is metered and capped here.
export type BudgetKey = "tavily.search" | "hunter.search" | "hunter.verify" | "openai.request";

type BudgetDefinition = { label: string; window: "day" | "month"; envVar: string; fallback: number; plan: string };

export const BUDGETS: Record<BudgetKey, BudgetDefinition> = {
  "tavily.search": { label: "Recherches Tavily", window: "month", envVar: "TAVILY_MONTHLY_LIMIT", fallback: 800, plan: "crédits de l’offre gratuite" },
  "hunter.search": { label: "Recherches de domaine Hunter", window: "month", envVar: "HUNTER_SEARCH_MONTHLY_LIMIT", fallback: 20, plan: "recherches de l’offre gratuite" },
  "hunter.verify": { label: "Vérifications d’email Hunter", window: "month", envVar: "HUNTER_VERIFY_MONTHLY_LIMIT", fallback: 40, plan: "vérifications de l’offre gratuite" },
  "openai.request": { label: "Requêtes OpenAI", window: "day", envVar: "OPENAI_DAILY_REQUEST_LIMIT", fallback: 150, plan: "crédits à la consommation" },
};

export class BudgetExhaustedError extends Error {
  constructor(readonly key: BudgetKey, readonly used: number, readonly limit: number) {
    const window = BUDGETS[key].window === "day" ? "aujourd’hui" : "ce mois-ci";
    super(`${BUDGETS[key].label} : ${used}/${limit} utilisés ${window}. Augmentez ${BUDGETS[key].envVar} ou attendez la période suivante.`);
    this.name = "BudgetExhaustedError";
  }
}
export function isBudgetError(error: unknown): error is BudgetExhaustedError {
  return error instanceof BudgetExhaustedError;
}

export function periodFor(window: "day" | "month", now = new Date()) {
  const iso = now.toISOString();
  return window === "day" ? iso.slice(0, 10) : iso.slice(0, 7);
}
export function limitFor(key: BudgetKey) {
  // An empty variable means "not configured", never a zero budget: Number("") is 0.
  const configured = process.env[BUDGETS[key].envVar]?.trim();
  if (!configured) return BUDGETS[key].fallback;
  const raw = Number(configured);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : BUDGETS[key].fallback;
}

/**
 * Reserves one unit of provider quota. The counter is incremented before the call so a
 * crashed or timed-out request still counts: providers bill the attempt, not the result.
 */
export async function consumeBudget(key: BudgetKey, now = new Date()) {
  const limit = limitFor(key);
  const period = periodFor(BUDGETS[key].window, now);
  if (limit <= 0) throw new BudgetExhaustedError(key, 0, 0);
  const db = await database();
  // The reservation itself decides: at the cap the counter stops moving, so "used" alone
  // could never distinguish the last allowed call from every refused one after it.
  const reservation = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401903)`;
    const current = await tx.providerUsage.findUnique({ where: { provider_period: { provider: key, period } } });
    const already = current?.count ?? 0;
    if (already >= limit) return { reserved: false, used: already };
    const updated = await tx.providerUsage.upsert({
      where: { provider_period: { provider: key, period } },
      create: { provider: key, period, count: 1 },
      update: { count: { increment: 1 } },
    });
    return { reserved: true, used: updated.count };
  });
  const used = reservation.used;
  if (!reservation.reserved) throw new BudgetExhaustedError(key, used, limit);
  if (used === limit) {
    await db.activityLog.create({
      data: { action: "PROVIDER_BUDGET_REACHED", level: "WARN", message: `${BUDGETS[key].label} : dernière unité du budget ${BUDGETS[key].window === "day" ? "quotidien" : "mensuel"} consommée (${used}/${limit}).`, metadata: { key, period, used, limit } },
    }).catch(() => {});
  }
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export type BudgetSnapshot = { key: BudgetKey; label: string; window: "day" | "month"; plan: string; used: number; limit: number; remaining: number; period: string };

export async function budgetSnapshot(now = new Date()): Promise<BudgetSnapshot[]> {
  const keys = Object.keys(BUDGETS) as BudgetKey[];
  const db = await database();
  const rows = await db.providerUsage.findMany({
    where: { OR: keys.map(key => ({ provider: key, period: periodFor(BUDGETS[key].window, now) })) },
  });
  return keys.map(key => {
    const definition = BUDGETS[key];
    const period = periodFor(definition.window, now);
    const used = rows.find(row => row.provider === key && row.period === period)?.count ?? 0;
    const limit = limitFor(key);
    return { key, label: definition.label, window: definition.window, plan: definition.plan, used, limit, remaining: Math.max(0, limit - used), period };
  });
}
