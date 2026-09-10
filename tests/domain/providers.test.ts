import { afterEach, describe, expect, it, vi } from "vitest";
// Quota metering is persisted; the adapter contract is verified without a database here.
vi.mock("../../src/lib/providers/budget", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/lib/providers/budget")>();
  return { ...actual, consumeBudget: vi.fn(async () => ({ used: 1, limit: 10, remaining: 9 })) };
});
import { parseEmailAlert, parseManualCsv, TavilyLeadSourceAdapter, findContact, looksLikeDirectory } from "../../src/lib/providers/sources";
import { ResendEmailProvider } from "../../src/lib/providers/email";
import { BudgetExhaustedError, consumeBudget, limitFor, periodFor } from "../../src/lib/providers/budget";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.mocked(consumeBudget).mockClear(); });
describe("provider adapters", () => {
  it("dry-run send performs no external call", async () => { const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const result = await new ResendEmailProvider(true).send({ id: "message-123", to: "demo@example.com", from: "Matthew <hello@mdl.com>", subject: "Test", body: "Hello" }); expect(result).toEqual({ id: "dry-run:message-123", dryRun: true }); expect(fetcher).not.toHaveBeenCalled(); });
  it("live email cannot silently fall back without a key", async () => { vi.stubEnv("RESEND_API_KEY", ""); await expect(new ResendEmailProvider(false).send({ id: "one", to: "person@realbusiness.com", from: "me@sender.com", subject: "Test", body: "Test" })).rejects.toThrow("RESEND_API_KEY"); });
  it("Tavily missing-key fixtures are deterministic and clearly marked", async () => { vi.stubEnv("TAVILY_API_KEY", ""); const source = new TavilyLeadSourceAdapter(); const a = await source.discover("automation agencies USA"), b = await source.discover("automation agencies USA"); expect(a).toEqual(b); expect(a).toHaveLength(3); expect(a.every(row => row.company.isDemo && row.source === "DEVELOPMENT_FIXTURE" && row.company.domain.endsWith(".example.com"))).toBe(true); });
  it("Hunter missing key never invents an address", async () => { vi.stubEnv("HUNTER_API_KEY", ""); expect(await findContact("realcompany.com")).toBeNull(); });
  it("Hunter verifies search results rather than trusting confidence", async () => { vi.stubEnv("HUNTER_API_KEY", "test-secret"); const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { emails: [{ value: "founder@business.com", first_name: "Sam", last_name: "Lee", position: "Founder", confidence: 99, verification: { status: "unknown" }, sources: [{ uri: "https://business.com/team" }] }] } }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "valid" } }), { status: 200 })); vi.stubGlobal("fetch", fetcher); const contact = await findContact("business.com", 12); expect(contact?.emailStatus).toBe("VERIFIED"); expect(contact?.source).toContain("https://business.com/team"); expect(contact?.source).not.toContain("test-secret"); expect(fetcher).toHaveBeenCalledTimes(2); });
  it("CSV supports quoted commas and keeps emails unverified", () => { const rows = parseManualCsv('company,website,contact,email,job_title,opportunity\n"Example, Inc",https://www.business.com,Jane,jane@business.com,Founder,"CRM, cleanup"'); expect(rows[0].company.name).toBe("Example, Inc"); expect(rows[0].company.domain).toBe("business.com"); expect(rows[0].contact?.emailStatus).toBe("UNKNOWN"); });
  it("CSV rejects malformed addresses", () => { expect(() => parseManualCsv("company,website,email\nExample,https://business.com,not-an-email")).toThrow(); });
  it("forwarded alerts keep stable source IDs and flag unverified identity", () => { const a = parseEmailAlert({ subject: "New opportunity", body: "A project is available at https://marketplace.com/jobs/123" }); expect(a[0].source).toBe("EMAIL_ALERT"); expect(a[0].rawPayload?.identityUnverified).toBe(true); expect(a[0].contact).toBeUndefined(); expect(a[0].externalId).toBe(parseEmailAlert({ subject: "New opportunity", body: "A project is available at https://marketplace.com/jobs/123" })[0].externalId); });
});

describe("discovery keeps companies and drops publishers", () => {
  const tavilyResponse = (results: unknown[]) => new Response(JSON.stringify({ results }), { status: 200 });
  it("recognises rankings, articles and dated paths", () => {
    expect(looksLikeDirectory("https://example.com/", "Top 15 Shopify Agency UK for Ecommerce Growth")).toBe(true);
    expect(looksLikeDirectory("https://example.com/", "The 20 best Shopify agencies in the UK")).toBe(true);
    expect(looksLikeDirectory("https://example.com/blog/shopify-tips", "Shopify tips")).toBe(true);
    expect(looksLikeDirectory("https://example.com/2026/agencies", "Agencies")).toBe(true);
    expect(looksLikeDirectory("https://beautyindependent.com/indie-beauty-london", "Where To Discover Indie Beauty And Wellness Brands In London")).toBe(true);
    expect(looksLikeDirectory("https://example.com/", "How to automate your Shopify reporting")).toBe(true);
    expect(looksLikeDirectory("https://madebyextreme.com/", "Made By Extreme")).toBe(false);
    expect(looksLikeDirectory("https://harbourgoods.co.uk/pages/about", "Harbour Goods - Skincare")).toBe(false);
  });
  it("keeps only real companies and cleans markup out of their name", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tavilyResponse([
      { title: "Top 50+ Shopify Stores in the UK (2026)<!-- -->", url: "https://publisher.com/guides/shopify", content: "A ranking of stores" },
      { title: "Made By Extreme <b>Ltd</b> - Shopify Agency", url: "https://madebyextreme.com/", content: "An independent studio" },
      { title: "Shopify partners", url: "https://linkedin.com/company/example", content: "Profile" },
    ])));
    const found = await new TavilyLeadSourceAdapter().discover("small Shopify brands United Kingdom");
    expect(found).toHaveLength(1);
    expect(found[0].company.domain).toBe("madebyextreme.com");
    expect(found[0].company.name).toBe("Made By Extreme Ltd");
    expect(found[0].company.isDemo).toBe(false);
  });
  it("explains an unusable query instead of importing articles", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tavilyResponse([
      { title: "Best 10 Shopify agencies", url: "https://publisher.com/blog/best", content: "A ranking" },
    ])));
    await expect(new TavilyLeadSourceAdapter().discover("best shopify agencies")).rejects.toThrow(/articles, classements ou annuaires/);
  });
});

describe("free-plan provider budgets", () => {
  it("windows are calendar based so a month rolls over predictably", () => {
    expect(periodFor("month", new Date("2026-09-10T23:59:59Z"))).toBe("2026-09");
    expect(periodFor("month", new Date("2026-10-01T00:00:00Z"))).toBe("2026-10");
    expect(periodFor("day", new Date("2026-09-10T23:59:59Z"))).toBe("2026-09-10");
  });
  it("limits come from the environment and fall back to conservative free-plan defaults", () => {
    vi.stubEnv("HUNTER_SEARCH_MONTHLY_LIMIT", "");
    expect(limitFor("hunter.search")).toBe(20);
    vi.stubEnv("HUNTER_SEARCH_MONTHLY_LIMIT", "7");
    expect(limitFor("hunter.search")).toBe(7);
    vi.stubEnv("HUNTER_SEARCH_MONTHLY_LIMIT", "not-a-number");
    expect(limitFor("hunter.search")).toBe(20);
  });
  it("a domain search is metered before Hunter is called", async () => {
    vi.stubEnv("HUNTER_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { emails: [] } }), { status: 200 })));
    await findContact("business.com", 12);
    expect(vi.mocked(consumeBudget)).toHaveBeenCalledWith("hunter.search");
  });
  it("an exhausted verification budget returns UNKNOWN instead of a trusted address", async () => {
    vi.stubEnv("HUNTER_API_KEY", "test-secret");
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { emails: [{ value: "founder@business.com", first_name: "Sam", last_name: "Lee", position: "Founder", confidence: 99, verification: { status: "unknown" } }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(consumeBudget).mockImplementationOnce(async () => ({ used: 1, limit: 10, remaining: 9 })).mockImplementationOnce(async () => { throw new BudgetExhaustedError("hunter.verify", 40, 40); });
    const contact = await findContact("business.com", 12);
    expect(contact?.emailStatus).toBe("UNKNOWN");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("an exhausted search budget stops the call rather than degrading silently", async () => {
    vi.stubEnv("HUNTER_API_KEY", "test-secret");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(consumeBudget).mockImplementationOnce(async () => { throw new BudgetExhaustedError("hunter.search", 20, 20); });
    await expect(findContact("business.com", 12)).rejects.toThrow(BudgetExhaustedError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
