"use client";
import { useState } from "react";
import { Ban, FileText, Send, Sparkles } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import {
  Badge,
  CompanyName,
  Modal,
  SafeLink,
  Score,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { date, money } from "@/lib/utils";
const tabNames: Record<string, string> = {
  overview: "Vue d’ensemble",
  research: "Recherche",
  offer: "Offre",
  conversation: "Conversation",
};
export function LeadDetail({ id, close }: { id: string; close: () => void }) {
  const { data, mutate, busy } = useWorkspace();
  const [tab, setTab] = useState("overview");
  const [reply, setReply] = useState("");
  const [humanReply, setHumanReply] = useState("");
  const lead = data.leads.find((l) => l.id === id);
  if (!lead) return null;
  const research = Array.isArray(lead.company.research)
    ? lead.company.research
    : [];
  return (
    <Modal title="Fiche du lead" close={close} wide>
      <div className="lead-identity">
        <CompanyName
          name={lead.company.name}
          detail={`${lead.company.country} · ${lead.company.industry}`}
        />
        <Score value={lead.totalScore} />
        <Badge value={lead.status} />
      </div>
      {lead.company.isDemo && (
        <div className="info-box">
          Exemple de démonstration · cette entreprise et ce contact sont fictifs et ne
          peuvent pas recevoir d’email réel.
        </div>
      )}
      <div className="lead-top-actions">
        <Button
          disabled={busy}
          onClick={() =>
            mutate(
              { action: "process-lead", leadId: id },
              "Recherche, scoring et offre adaptée terminés",
            )
          }
        >
          <Sparkles size={15} />
          Enrichir et qualifier
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            if (
              await mutate(
                { action: "generate-outreach", leadId: id },
                "Email personnalisé rédigé",
              )
            )
              setTab("conversation");
          }}
        >
          <FileText size={15} />
          Rédiger l’email
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() =>
            mutate(
              {
                action: "blacklist",
                leadId: id,
                reason: "Mise en liste noire depuis la fiche du lead",
              },
              "Lead en liste noire, relances arrêtées",
            )
          }
        >
          <Ban size={14} />
          Liste noire
        </Button>
      </div>
      <div className="tabs" role="tablist" aria-label="Détail du lead">
        {Object.entries(tabNames).map(([t, name]) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="lead-tab-content">
        {tab === "overview" && (
          <>
            <p className="lead-description">
              {lead.company.description ||
                "Enrichissez ce lead pour étudier son activité et évaluer la pertinence."}
            </p>
            <div className="detail-grid">
              <div>
                <span>Site web</span>
                <SafeLink href={lead.company.website}>
                  {lead.company.domain}
                </SafeLink>
              </div>
              <div>
                <span>Effectif estimé</span>
                <strong>{lead.company.employeeEstimate || "Inconnu"}</strong>
              </div>
              <div>
                <span>Contact</span>
                <strong>{lead.contact?.fullName || "Non trouvé"}</strong>
                <small>{lead.contact?.jobTitle}</small>
              </div>
              <div>
                <span>Email</span>
                <strong>
                  {lead.contact?.email || "Non trouvé — jamais deviné"}
                </strong>
                {lead.contact && <Badge value={lead.contact.emailStatus} />}
              </div>
              <div>
                <span>Provenance du contact</span>
                <strong>{lead.contact?.source || "Inconnue"}</strong>
              </div>
              <div>
                <span>Langue</span>
                <strong>
                  {lead.contact?.language === "fr" ? "Français" : "Anglais"}
                </strong>
              </div>
            </div>
            <h3 className="detail-heading">Détail du score</h3>
            <div className="score-breakdown">
              {[
                ["Pertinence", lead.fitScore, 30],
                ["Valeur", lead.valueScore, 25],
                ["Délivrabilité", lead.deliverabilityScore, 20],
                ["Qualité du client", lead.clientQualityScore, 15],
                ["Potentiel récurrent", lead.recurringPotentialScore, 10],
              ].map(([name, value, max]) => (
                <div key={name}>
                  <div>
                    <span>{name}</span>
                    <strong>
                      {value} / {max}
                    </strong>
                  </div>
                  <div className="conversion-track">
                    <i
                      style={{
                        width: `${(Number(value) / Number(max)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="recommendation">
              <strong>
                Évaluation · fiabilité {Math.round(lead.confidence * 100)} %
              </strong>
              <p>{lead.reasoning || "La qualification n’a pas encore été lancée."}</p>
            </div>
            <h3 className="detail-heading">Problèmes potentiels</h3>
            {lead.detectedProblems.length ? (
              <ul className="detail-list">
                {lead.detectedProblems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Aucun problème identifié pour l’instant.</p>
            )}
            <p className="muted">
              Séquence{" "}
              {lead.sequenceStopped
                ? "arrêtée"
                : lead.nextFollowupAt
                  ? `prochaine relance le ${date(lead.nextFollowupAt)}`
                  : "en attente du premier email"}
              .
            </p>
          </>
        )}
        {tab === "research" && (
          <>
            <h3>Preuves et provenance</h3>
            <p className="muted">
              Les faits vérifiés sont distingués des déductions. Ce qui reste inconnu
              est affiché comme tel.
            </p>
            {research.length ? (
              research.map((item, index) => {
                const row =
                  item && typeof item === "object"
                    ? (item as Record<string, unknown>)
                    : {};
                return (
                  <div className="research-item" key={index}>
                    <div className="inline-heading">
                      <strong>
                        {String(
                          row.field ||
                            row.claim ||
                            row.topic ||
                            "Observation de recherche",
                        )}
                      </strong>
                      <Badge
                        value={String(
                          row.status || row.verification || "UNKNOWN",
                        )}
                      />
                    </div>
                    <p>
                      {String(
                        row.value ||
                          row.observation ||
                          row.detail ||
                          row.claim ||
                          "",
                      )}
                    </p>
                    {typeof row.sourceUrl === "string" && (
                      <SafeLink href={row.sourceUrl}>Voir la preuve</SafeLink>
                    )}
                    {typeof row.source === "string" && (
                      <SafeLink href={row.source}>Source</SafeLink>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="empty">
                <h3>Aucune recherche pour l’instant</h3>
                <p>
                  Enrichissez et qualifiez ce lead pour rassembler des preuves
                  sourcées.
                </p>
              </div>
            )}
            <h3 className="detail-heading">Technologies identifiées</h3>
            <div className="tag-list">
              {lead.company.technologies.map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
              {!lead.company.technologies.length && (
                <span className="muted">Inconnues</span>
              )}
            </div>
            {lead.opportunity && (
              <div className="recommendation">
                <strong>{lead.opportunity.title}</strong>
                <p>{lead.opportunity.description}</p>
                <SafeLink href={lead.opportunity.sourceUrl}>
                  Opportunité d’origine
                </SafeLink>
              </div>
            )}
          </>
        )}
        {tab === "offer" && (
          <>
            {lead.offers.length ? (
              lead.offers.map((o) => (
                <article className="adaptive-offer" key={o.id}>
                  <Badge value="offer">
                    {data.offers.find((t) => t.id === o.offerTemplateId)
                      ?.name || "Offre adaptée"}
                  </Badge>
                  <h2>{o.title}</h2>
                  <div className="offer-estimate">
                    <strong>
                      {money(o.estimatedPriceMin)}–{money(o.estimatedPriceMax)}
                    </strong>
                    <span>{o.estimatedDuration}</span>
                  </div>
                  <p className="muted">
                    Estimation indicative. Le périmètre, le prix et les délais définitifs
                    se décident avec vous.
                  </p>
                  <h3>Problème potentiel</h3>
                  <p>{o.problem}</p>
                  <h3>Solution proposée</h3>
                  <p>{o.proposedSolution}</p>
                  <h3>Livrables</h3>
                  <ul className="detail-list">
                    {o.deliverables.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                  <div className="recommendation">
                    <strong>Pourquoi cette offre</strong>
                    <p>{o.rationale}</p>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty">
                <h3>Aucune offre générée</h3>
                <p>
                  Enrichissez et qualifiez le lead pour choisir une famille d’offre et
                  en adapter les livrables.
                </p>
              </div>
            )}
          </>
        )}
        {tab === "conversation" && (
          <>
            <div className="conversation-stack">
              {lead.messages.length ? (
                [...lead.messages]
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                  .map((m) => (
                    <article
                      className={`conversation-message ${m.direction === "INBOUND" ? "inbound" : ""}`}
                      key={m.id}
                    >
                      <div className="inline-heading">
                        <strong>
                          {m.direction === "INBOUND"
                            ? lead.contact?.fullName || "Prospect"
                            : data.settings.senderName || "Matthew"}
                        </strong>
                        <Badge value={m.aiClassification || m.status} />
                        <small>{date(m.createdAt)}</small>
                      </div>
                      <h3>{m.subject}</h3>
                      <p className="email-body">{m.body}</p>
                      {m.error && <p className="error-box">{m.error}</p>}
                      {["DRAFT", "APPROVED", "DEFERRED"].includes(m.status) &&
                        m.direction === "OUTBOUND" && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              mutate(
                                { action: "send-message", messageId: m.id },
                                data.settings.dryRun
                                  ? "Email simulé"
                                  : "Email traité",
                              )
                            }
                          >
                            <Send size={14} />
                            {data.settings.dryRun
                              ? "Simuler l’envoi"
                              : "Envoyer l’email"}
                          </Button>
                        )}
                    </article>
                  ))
              ) : (
                <p className="muted">
                  Aucun message pour l’instant. Rédigez un email pour démarrer.
                </p>
              )}
            </div>
            {lead.conversation && (
              <div className="recommendation">
                <strong>Analyse de la conversation</strong>
                <div className="tag-list">
                  <Badge value={lead.conversation.intent} />
                  <Badge value={lead.conversation.status} />
                  {lead.conversation.requiresHuman && <Badge value="HANDOFF" />}
                </div>
              </div>
            )}
            <form
              className="reply-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate(
                    { action: "compose-reply", leadId: id, body: humanReply },
                    "Votre brouillon de réponse est prêt à relire et envoyer",
                  )
                )
                  setHumanReply("");
              }}
            >
              <h3>Écrire une réponse</h3>
              <p className="muted">
                Reprenez la conversation. Enregistrez votre brouillon, puis utilisez
                son bouton d’envoi.
              </p>
              <label htmlFor="human-reply">Votre réponse</label>
              <Textarea
                id="human-reply"
                rows={4}
                value={humanReply}
                onChange={(e) => setHumanReply(e.target.value)}
                required
              />
              <Button disabled={busy || !humanReply.trim()}>
                Enregistrer le brouillon
              </Button>
            </form>
            {data.settings.dryRun && (
              <form
                className="reply-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await mutate(
                      { action: "simulate-reply", leadId: id, body: reply },
                      "Réponse classée et pipeline mis à jour",
                    )
                  )
                    setReply("");
                }}
              >
                <h3>Simuler une réponse entrante</h3>
                <p className="muted">
                  Testez la classification, l’arrêt des relances et la reprise en main.
                </p>
                <label className="sr-only" htmlFor="simulated-reply">
                  Réponse du prospect
                </label>
                <Textarea
                  id="simulated-reply"
                  rows={4}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Cela semble utile. Pouvons-nous en parler la semaine prochaine ?"
                  required
                />
                <Button variant="outline" disabled={busy || !reply.trim()}>
                  Traiter la réponse simulée
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
