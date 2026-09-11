import { describe, expect, it } from "vitest";
import { assembleOutreach, casualIssues, closingAngle, diagnosisIssues, draftFaults, fallbackOutreach, greeting, isUnsendable, mergeSplitSentences, missingClosingAsk, outreachInstruction, outreachIssues, revisionNote, soloClaims, styleIssues, teamVoiceIssues, tidyOutreach } from "../../src/lib/providers/outreach";
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
    expect(revisionNote(["Vous expédiez pour des marques.", "Comment suivez-vous ça aujourd'hui ?", "Je conçois des outils internes sur mesure. Si vous avez des points de friction, je peux construire avec vous l'outil qui les règle."], 0)).toBeNull();
  });
  it("asks for a rewrite when the draft runs long", () => {
    const long = [Array.from({ length: 150 }, () => "mot").join(" "), "Et vous, comment faites-vous ?", "Fin."];
    expect(revisionNote(long, 0)).toContain("over the 110-word limit");
  });
});

describe("first person voice", () => {
  // Writing for a team is both untrue and the clearest giveaway of a mailshot.
  it("catches anything written on behalf of a company", () => {
    expect(teamVoiceIssues("Nous construisons des outils internes.")).not.toHaveLength(0);
    expect(teamVoiceIssues("Chez MDL Advisory, on conçoit des outils sur mesure.")).not.toHaveLength(0);
    expect(teamVoiceIssues("Notre équipe peut vous aider.")).not.toHaveLength(0);
    expect(teamVoiceIssues("We build small internal tools.")).not.toHaveLength(0);
  });
  it("leaves the first person singular and the shared \"on\" alone", () => {
    expect(teamVoiceIssues("Je conçois et je développe des outils internes sur mesure.")).toEqual([]);
    expect(teamVoiceIssues("Si le sujet vous parle, on en parle quand vous voulez.")).toEqual([]);
    expect(teamVoiceIssues("On regarde ensemble votre façon de faire.")).toEqual([]);
  });
  it("quotes the company voice back for a rewrite", () => {
    const note = revisionNote(["Une observation.", "Et chez vous ?", "Nous construisons des outils internes."], 0);
    expect(note).toContain("writes in his own name");
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
    const asserted = ["Vous expédiez pour des marques.", "Un tableau de bord regrouperait vos données.", "Je conçois des outils internes sur mesure."];
    expect(revisionNote(asserted, 0)).toContain("must be a real question");
    const asked = ["Vous expédiez pour des marques.", "Comment suivez-vous ça aujourd'hui ?", "Je conçois des outils internes sur mesure. Si vous avez des points de friction, je peux construire avec vous l'outil qui les règle."];
    expect(revisionNote(asked, 0)).toBeNull();
  });
  it("scores a draft so a rewrite is kept only when it moves closer", () => {
    const bad = ["Vous expédiez.", "Quand le volume augmente, ça devient complexe.", "Nous construisons des outils."];
    const good = ["Vous expédiez.", "Comment suivez-vous ça aujourd'hui ?", "Je conçois des outils internes sur mesure. Si vous avez des points de friction, je peux construire avec vous l'outil qui les règle."];
    expect(draftFaults(good, 0)).toBeLessThan(draftFaults(bad, 0));
    expect(draftFaults(good, 0)).toBe(0);
  });
});

const offer = {
  offerTemplateId: "workflow-rescue",
  title: "H2K — Workflow Rescue",
  problem: "Suivi à confirmer.",
  proposedSolution: "Un workflow automatisé avec reporting et alertes d’erreur",
  deliverables: ["Cartographie du besoin", "Implémentation", "Documentation"],
  estimatedPriceMin: 600,
  estimatedPriceMax: 1200,
  estimatedDuration: "2–5 days",
  rationale: "Repli local.",
} as unknown as Parameters<typeof fallbackOutreach>[1];

describe("template fallback", () => {
  it("asks rather than asserts, and speaks in the first person", () => {
    const draft = fallbackOutreach(context, offer, settings, 0);
    expect(draft.body).toContain("?");
    expect(draft.body).toContain("sur mesure");
    expect(soloClaims(draft.body)).toEqual([]);
    expect(casualIssues(draft.body)).toEqual([]);
    expect(teamVoiceIssues(draft.body.split("Matthew de Lamotte")[0])).toEqual([]);
    expect(diagnosisIssues(draft.body)).toEqual([]);
  });
  it("anchors the closing on the offer chosen for this lead and still leaves it open", () => {
    const draft = fallbackOutreach(context, offer, settings, 0);
    expect(draft.body).toContain("workflow automatisé");
    expect(draft.body).toContain("si votre besoin est ailleurs".slice(3));
    // The commercial promise is days, never a number of days and never a price.
    expect(draft.body).toContain("quelques jours");
    expect(outreachIssues(draft.body.split("Matthew de Lamotte")[0])).toEqual([]);
  });
});

describe("message shape", () => {
  // Observed on a real draft: the model broke a sentence across two paragraphs and it arrived split.
  it("rejoins a sentence the model split across paragraphs", () => {
    expect(mergeSplitSentences(["Je conçois et je développe moi-même", "des outils internes sur mesure."]))
      .toEqual(["Je conçois et je développe moi-même des outils internes sur mesure."]);
    expect(mergeSplitSentences(["Vous expédiez pour des marques.", "Comment faites-vous ?"]))
      .toEqual(["Vous expédiez pour des marques.", "Comment faites-vous ?"]);
  });
  // Observed on a real draft: the closing invitation was dropped to fit the word limit.
  it("catches an email that ends on what the sender does", () => {
    expect(missingClosingAsk(["Je conçois des outils internes sur mesure."])).toBe(true);
    expect(missingClosingAsk(["Dites-moi comment ça se passe chez vous."])).toBe(false);
    expect(missingClosingAsk(["Si le sujet vous parle, on en parle quand vous voulez."])).toBe(false);
  });
  it("asks for the closing line back", () => {
    const note = revisionNote(["Vous expédiez.", "Comment suivez-vous ça ?", "Je conçois des outils internes sur mesure."], 0);
    expect(note).toContain("nothing for the reader to answer");
  });
});

describe("tone and positioning", () => {
  // Matthew asked for the solo framing to be dropped: what he sells is the bespoke tool, not his size.
  it("catches any mention of working by himself", () => {
    expect(soloClaims("Je travaille seul, je code moi-même.")).not.toHaveLength(0);
    expect(soloClaims("Je suis indépendant.")).not.toHaveLength(0);
    expect(soloClaims("I work on my own.")).not.toHaveLength(0);
    expect(soloClaims("Je conçois et développe des outils internes sur mesure.")).toEqual([]);
  });
  it("catches wording too familiar for a first message", () => {
    expect(casualIssues("Je vous dirai s'il y a un truc à fabriquer.")).not.toHaveLength(0);
    expect(casualIssues("Un mot suffit.")).not.toHaveLength(0);
    expect(casualIssues("Du coup, dites-moi.")).not.toHaveLength(0);
    expect(casualIssues("Dites-moi comment vous procédez aujourd'hui.")).toEqual([]);
  });
  it("asks for both back in one rewrite note", () => {
    const note = revisionNote(["J'ai vu que vous expédiez.", "Comment faites-vous ?", "Je travaille seul. Dites-moi s'il y a un truc à fabriquer."], 0);
    expect(note).toContain("works by himself");
    expect(note).toContain("too familiar");
  });
});

describe("closing", () => {
  // The promise is fixed, the wording is not: an identical last sentence on every email is a tell.
  it("varies the angle between companies and holds it steady for one", () => {
    expect(closingAngle("h2k.fr")).toBe(closingAngle("h2k.fr"));
    const angles = new Set(["h2k.fr", "ebsesperance.fr", "atelier-colis.fr", "corlet.fr", "madebyextreme.com", "harbourgoods.co.uk", "klarwerk.de"].map(closingAngle));
    expect(angles.size).toBeGreaterThan(1);
  });
  it("carries the angle into the instruction", () => {
    const instruction = outreachInstruction("fr", 0, "h2k.fr");
    expect(instruction).toContain("Wording of that closing line:");
    expect(instruction).toContain(closingAngle("h2k.fr"));
  });
  it("requires the intervention and the open door, never a price or a product name", () => {
    const instruction = outreachInstruction("fr", 0, "h2k.fr");
    expect(instruction).toContain("leave the door open to a scope built around something else");
    expect(instruction).toContain("never a number of days, and never a price");
    expect(instruction).toContain("Never use a product or offer name");
  });
  it("accepts every closing angle as a genuine invitation", () => {
    const closings = [
      "Sur ce suivi, j'interviens sur quelques jours pour automatiser la saisie. Est-ce le bon angle, ou la friction est ailleurs ?",
      "Je peux vous décrire ce que couvrirait une intervention de ce genre, ou la cadrer autrement selon votre situation.",
      "Si la friction est là, je construis l'écran qui rassemble les alertes ; si elle est ailleurs, je construis autour de ça.",
      "Deux options : l'intervention que j'ai en tête, ou un périmètre défini avec vous autour de votre façon de faire. Laquelle est la plus proche de votre situation ?",
      "Dites-moi où se situe vraiment la friction et je vous dirai ce que je ferais.",
    ];
    for (const closing of closings) expect(missingClosingAsk([closing])).toBe(false);
  });
});

describe("unsendable drafts fall back", () => {
  const clean = [
    "J'ai vu que vous expédiez pour des marques e-commerce.",
    "Comment suivez-vous les anomalies : dans le WMS, ou dans un fichier à côté ?",
    "Je conçois des outils internes sur mesure. Sur ce suivi j'interviens sur quelques jours, et si la friction est ailleurs on part sur autre chose.",
  ];
  it("accepts a draft that meets the shape", () => {
    expect(isUnsendable(clean, 0)).toBe(false);
    expect(revisionNote(clean, 0)).toBeNull();
  });
  it("rejects the faults Matthew objected to", () => {
    expect(isUnsendable([clean[0], clean[1], "Nous construisons des outils internes. Dites-moi."], 0)).toBe(true);
    expect(isUnsendable([clean[0], clean[1], "Je travaille seul. Dites-moi."], 0)).toBe(true);
    expect(isUnsendable([clean[0], "Quand le volume augmente, ça devient complexe.", clean[2]], 0)).toBe(true);
    expect(isUnsendable([clean[0], "Un tableau de bord regrouperait vos données.", clean[2]], 0)).toBe(true);
    expect(isUnsendable([clean[0], clean[1], "Je conçois des outils internes sur mesure."], 0)).toBe(true);
  });
  // Observed on a real draft: four paragraphs and 170 words, well past the limit.
  it("rejects a rambling draft", () => {
    expect(isUnsendable([...clean, "Et un quatrième paragraphe. Dites-moi."], 0)).toBe(true);
    const long = [clean[0], clean[1], Array.from({ length: 160 }, () => "mot").join(" ") + " Dites-moi."];
    expect(isUnsendable(long, 0)).toBe(true);
  });
  it("tolerates a residual consulting tic rather than losing the personalisation", () => {
    const withTic = [clean[0], clean[1], "Je conçois ce type d'outil sur mesure. Dites-moi comment vous faites."];
    expect(revisionNote(withTic, 0)).toContain("ce type d");
    expect(isUnsendable(withTic, 0)).toBe(false);
  });
});

describe("template fallback stays readable", () => {
  // Observed on a real fallback: the description was cut mid-word and the internal offer
  // write-up was pasted whole, three sentences of jargon inside a cold email.
  const longOffer = {
    offerTemplateId: "internal-tool-sprint",
    title: "Sprint",
    problem: "À confirmer.",
    proposedSolution: "Développer un outil interne ciblé, tel qu'un tableau de bord interactif ou un portail personnalisé, qui centralise la visualisation et le suivi des commandes clients, stocks en temps réel et expéditions. Cet outil permettra d'améliorer la prise de décision, de réduire les erreurs manuelles, et d'accroître la transparence pour les équipes.",
    deliverables: ["Cadrage", "Implémentation"],
    estimatedPriceMin: 1500,
    estimatedPriceMax: 3000,
    estimatedDuration: "5–10 days",
    rationale: "Repli.",
  } as unknown as Parameters<typeof fallbackOutreach>[1];
  const wordy = {
    ...context,
    company: { ...context.company, name: "Ebsesperance", description: "e-commerçants, sous-traitez votre préparation de commande web : stockage, conditionnement, copacking, étiquetage, expédition, livraison et gestion des stocks en temps réel" },
  } as unknown as LeadContext;

  it("never cuts a word in half", () => {
    const draft = fallbackOutreach(wordy, longOffer, settings, 0);
    for (const word of draft.body.split(/\s+/)) expect(word).not.toBe("expédi");
    expect(draft.body).not.toContain("expédi ");
  });
  it("keeps the intervention to one clause instead of the whole internal write-up", () => {
    const draft = fallbackOutreach(wordy, longOffer, settings, 0);
    expect(draft.body).not.toContain("accroître la transparence");
    expect(draft.body).toContain("quelques jours");
  });
  it("says nothing rather than quoting a marketing fragment that ends on a colon", () => {
    const fragment = { ...context, company: { ...context.company, description: "Nos services :" } } as unknown as LeadContext;
    const draft = fallbackOutreach(fragment, longOffer, settings, 0);
    expect(draft.body).not.toContain("Nos services");
  });
  it("stays inside the shape it enforces on the model", () => {
    const draft = fallbackOutreach(wordy, longOffer, settings, 0);
    const paragraphs = draft.body.split("\n\n").slice(1, 4);
    expect(isUnsendable(paragraphs, 0)).toBe(false);
  });
});
