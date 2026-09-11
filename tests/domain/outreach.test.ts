import { describe, expect, it } from "vitest";
import { assembleOutreach, diagnosisIssues, draftFaults, fallbackOutreach, greeting, mergeSplitSentences, missingClosingAsk, outreachInstruction, outreachIssues, revisionNote, styleIssues, teamVoiceIssues, tidyOutreach } from "../../src/lib/providers/outreach";
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
    expect(revisionNote(["Vous expédiez pour des marques.", "Comment suivez-vous ça aujourd'hui ?", "Je travaille seul, je code moi-même. Dites-moi comment ça se passe chez vous."], 0)).toBeNull();
  });
  it("asks for a rewrite when the draft runs long", () => {
    const long = [Array.from({ length: 150 }, () => "mot").join(" "), "Et vous, comment faites-vous ?", "Fin."];
    expect(revisionNote(long, 0)).toContain("over the 110-word limit");
  });
});

describe("solo voice", () => {
  // Matthew works alone: writing for a team is both untrue and the giveaway of a mailshot.
  it("catches anything written on behalf of a company", () => {
    expect(teamVoiceIssues("Nous construisons des outils internes.")).not.toHaveLength(0);
    expect(teamVoiceIssues("Chez MDL Advisory, on conçoit des outils sur mesure.")).not.toHaveLength(0);
    expect(teamVoiceIssues("Notre équipe peut vous aider.")).not.toHaveLength(0);
    expect(teamVoiceIssues("We build small internal tools.")).not.toHaveLength(0);
  });
  it("leaves the first person singular and the shared \"on\" alone", () => {
    expect(teamVoiceIssues("Je conçois et je code moi-même de petits outils internes.")).toEqual([]);
    expect(teamVoiceIssues("Si le sujet vous parle, on en parle quand vous voulez.")).toEqual([]);
    expect(teamVoiceIssues("On regarde ensemble votre façon de faire.")).toEqual([]);
  });
  it("quotes the company voice back for a rewrite", () => {
    const note = revisionNote(["Une observation.", "Et chez vous ?", "Nous construisons des outils internes."], 0);
    expect(note).toContain("works alone");
    expect(note).toContain("Nous");
  });
});

describe("no diagnosis", () => {
  // Asserting a problem nobody described is what makes a template read as a guess.
  it("catches a claim about difficulties the prospect never described", () => {
    expect(diagnosisIssues("Quand le volume augmente, le suivi devient vite complexe.")).not.toHaveLength(0);
    expect(diagnosisIssues("Suivre toutes les commandes dans un seul outil n'est pas simple.")).not.toHaveLength(0);
    expect(diagnosisIssues("Vous perdez du temps sur les ressaisies.")).not.toHaveLength(0);
  });
  it("leaves a plain observation and a question alone", () => {
    expect(diagnosisIssues("Vous préparez et expédiez les commandes de vos clients e-commerce.")).toEqual([]);
    expect(diagnosisIssues("Comment suivez-vous les anomalies aujourd'hui : dans le WMS, ou dans un fichier à côté ?")).toEqual([]);
  });
  it("requires a question before the closing paragraph", () => {
    const asserted = ["Vous expédiez pour des marques.", "Un tableau de bord regrouperait vos données.", "Je travaille seul."];
    expect(revisionNote(asserted, 0)).toContain("must be a real question");
    const asked = ["Vous expédiez pour des marques.", "Comment suivez-vous ça aujourd'hui ?", "Je travaille seul, je code moi-même. Dites-moi comment ça se passe chez vous."];
    expect(revisionNote(asked, 0)).toBeNull();
  });
  it("scores a draft so a rewrite is kept only when it moves closer", () => {
    const bad = ["Vous expédiez.", "Quand le volume augmente, ça devient complexe.", "Nous construisons des outils."];
    const good = ["Vous expédiez.", "Comment suivez-vous ça aujourd'hui ?", "Je travaille seul, je code moi-même. Dites-moi comment ça se passe chez vous."];
    expect(draftFaults(good, 0)).toBeLessThan(draftFaults(bad, 0));
    expect(draftFaults(good, 0)).toBe(0);
  });
});

describe("template fallback", () => {
  it("asks rather than asserts, and speaks for one person", () => {
    const draft = fallbackOutreach(context, settings, 0);
    expect(draft.body).toContain("?");
    expect(draft.body).toContain("Je travaille seul");
    expect(teamVoiceIssues(draft.body.split("Matthew de Lamotte")[0])).toEqual([]);
    expect(diagnosisIssues(draft.body)).toEqual([]);
  });
});

describe("message shape", () => {
  // Observed on a real draft: the model broke a sentence across two paragraphs and it arrived split.
  it("rejoins a sentence the model split across paragraphs", () => {
    expect(mergeSplitSentences(["Je travaille seul, je conçois et code moi-même", "de petits outils internes."]))
      .toEqual(["Je travaille seul, je conçois et code moi-même de petits outils internes."]);
    expect(mergeSplitSentences(["Vous expédiez pour des marques.", "Comment faites-vous ?"]))
      .toEqual(["Vous expédiez pour des marques.", "Comment faites-vous ?"]);
  });
  // Observed on a real draft: the closing invitation was dropped to fit the word limit.
  it("catches an email that ends on what the sender does", () => {
    expect(missingClosingAsk(["Je travaille seul, je construis ce qui manque."])).toBe(true);
    expect(missingClosingAsk(["Dites-moi comment ça se passe chez vous."])).toBe(false);
    expect(missingClosingAsk(["Si le sujet vous parle, on en parle quand vous voulez."])).toBe(false);
  });
  it("asks for the closing line back", () => {
    const note = revisionNote(["Vous expédiez.", "Comment suivez-vous ça ?", "Je travaille seul et je construis ce qui manque."], 0);
    expect(note).toContain("nothing for the reader to answer");
  });
});
