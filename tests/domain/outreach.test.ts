import { describe, expect, it } from "vitest";
import { assembleOutreach, greeting, outreachInstruction, outreachIssues, revisionNote, styleIssues, tidyOutreach } from "../../src/lib/providers/outreach";
import type { DraftSettings, LeadContext } from "../../src/lib/providers/types";

const settings: DraftSettings = {
  senderName: "Matthew de Lamotte",
  companyName: "MDL Advisory",
  signature: "Matthew de Lamotte\nMDL Advisory — outils internes et automatisations sur mesure\nmatthew.delamotte@mdl-advisory.com\nmdl-advisory.com",
};

const context = {
  company: { name: "H2K", domain: "h2k.fr", website: "https://h2k.fr", country: "France", industry: "logistique", description: "Prestataire logistique", technologies: [] },
  contact: { fullName: "Robert Lemonnier", firstName: "Robert", jobTitle: "Gérant", email: "r.lemonnier@h2k.fr", emailStatus: "UNKNOWN", language: "fr" },
} as unknown as LeadContext;

describe("outreach guardrails", () => {
  it("rejects anything that commits MDL to a price, a date or a guarantee", () => {
    expect(outreachIssues("Comptez environ 900 € pour ce périmètre.")).toContain("montant chiffré");
    expect(outreachIssues("Le budget tourne autour de 1 200 euros.")).toContain("montant chiffré");
    expect(outreachIssues("Nous garantissons le résultat.")).toContain("garantie");
    expect(outreachIssues("Livré sous 5 jours.")).toContain("délai chiffré");
    expect(outreachIssues("Voir https://mdl-advisory.com pour le détail.")).toContain("lien");
  });
  it("accepts a message that stays qualitative", () => {
    expect(outreachIssues("Si le suivi des expéditions vit encore dans un tableur, on peut le remplacer par un écran unique alimenté par vos codes-barres.")).toEqual([]);
  });
  it("counts the 3 in a business name as a name, not as money", () => {
    expect(outreachIssues("Vos équipes pilotent 3 entrepôts.")).toEqual([]);
  });
});

describe("outreach assembly", () => {
  it("keeps the opt-out line and the signature out of the model's hands", () => {
    const body = assembleOutreach(context, settings, "fr", ["Premier paragraphe.", "Second paragraphe."]);
    expect(body.startsWith("Bonjour Robert,")).toBe(true);
    expect(body).toContain("matthew.delamotte@mdl-advisory.com");
    expect(body.trimEnd().endsWith("je ne vous recontacterai plus.")).toBe(true);
  });
  it("greets without a name rather than inventing one", () => {
    expect(greeting({ ...context, contact: null } as unknown as LeadContext, "fr")).toBe("Bonjour,");
  });
  it("strips the tics that give an automated message away", () => {
    expect(tidyOutreach("Excellent choix !! 🚀")).toBe("Excellent choix.");
    // French typography keeps its space before a colon.
    expect(tidyOutreach("Une piste : un écran unique.")).toBe("Une piste : un écran unique.");
  });
});

describe("outreach instruction", () => {
  it("states the word limit before the style advice, so it does not get diluted", () => {
    const first = outreachInstruction("fr", 0);
    expect(first).toContain("exactly three paragraphs");
    expect(first).toContain("110 words maximum");
    expect(first.indexOf("HARD LIMITS")).toBeLessThan(first.indexOf("Register:"));
    expect(first).toContain("Write one cold email in French");
  });
  it("forbids a follow-up framing and shortens each later step", () => {
    expect(outreachInstruction("fr", 1)).toContain("Never say you are following up");
    expect(outreachInstruction("fr", 1)).toContain("70 words maximum");
    expect(outreachInstruction("en", 2)).toContain("45 words maximum");
    expect(outreachInstruction("en", 2)).toContain("last message");
  });
});

describe("register enforcement", () => {
  // The prompt bans these; the model still slips a few in, so the written copy is read back.
  it("catches the consulting tics the prompt alone does not remove", () => {
    expect(styleIssues("Ce type de flux produit des données dispersées.")).toHaveLength(1);
    expect(styleIssues("On envisagerait un tableau de bord.")).toHaveLength(1);
    expect(styleIssues("Cela permettrait de gagner du temps.")).toHaveLength(1);
    expect(styleIssues("N'hésitez pas à me dire.")).toHaveLength(1);
    expect(styleIssues("Notre expertise au sein de votre problématique.")).not.toHaveLength(0);
  });
  it("leaves a plainly written message alone", () => {
    expect(styleIssues("Quand le volume monte, le suivi des anomalies finit dans un tableur. On peut le remplacer par un écran unique.")).toEqual([]);
  });
  it("asks for a rewrite that quotes the offending wording back", () => {
    const note = revisionNote(["Ce type de flux produit des données dispersées."], 0);
    expect(note).toContain("Ce type de");
    expect(revisionNote(["Quand le volume monte, le suivi finit dans un tableur."], 0)).toBeNull();
  });
  it("asks for a rewrite when the draft runs long", () => {
    const long = [Array.from({ length: 150 }, () => "mot").join(" ")];
    expect(revisionNote(long, 0)).toContain("over the 110-word limit");
  });
});
