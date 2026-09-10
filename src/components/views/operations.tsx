"use client";
import { useState } from "react";
import {
  Ban,
  Check,
  Edit3,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  UserRound,
  X,
} from "lucide-react";
import type {
  ReviewView,
  WorkspaceAction,
  WorkspaceSnapshot,
} from "@/lib/contracts";
import { useWorkspace } from "@/components/workspace-context";
import {
  Badge,
  CompanyName,
  Empty,
  Modal,
  Score,
  SectionTitle,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { date, label, money } from "@/lib/utils";
const decisionMessages: Record<string, string> = {
  approve: "Message approuvé",
  reject: "Élément refusé",
  handoff: "Conversation reprise en main",
  blacklist: "Contact mis en liste noire",
  edit: "Message mis à jour",
};
export function InboxView() {
  const { data, openLead, mutate, busy } = useWorkspace();
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const messages = data.messages.filter(
    (m) =>
      filter === "ALL" ||
      (filter === "DRAFT"
        ? m.status === "DRAFT"
        : filter === "INBOUND"
          ? m.direction === "INBOUND"
          : m.direction === "OUTBOUND"),
  );
  const message = messages.find((m) => m.id === selected) || messages[0];
  return (
    <Card>
      <div className="tabs" role="tablist" aria-label="Filtre des messages">
        {[
          ["ALL", "Tous les messages"],
          ["INBOUND", "Reçus"],
          ["OUTBOUND", "Envoyés"],
          ["DRAFT", "Brouillons"],
        ].map(([key, name]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            className={filter === key ? "selected" : ""}
            onClick={() => {
              setFilter(key);
              setSelected(null);
            }}
          >
            {name}
            <span>
              {
                data.messages.filter(
                  (m) =>
                    key === "ALL" ||
                    (key === "DRAFT"
                      ? m.status === "DRAFT"
                      : m.direction === key),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      {message ? (
        <div className="inbox-layout">
          <div className="message-list">
            {messages.map((m) => (
              <button
                key={m.id}
                className={`message-list-item ${m.id === message.id ? "selected" : ""}`}
                onClick={() => setSelected(m.id)}
              >
                <div>
                  <strong>{m.lead.company.name}</strong>
                  <small>{date(m.createdAt).split(",")[0]}</small>
                </div>
                <h3>{m.subject}</h3>
                <p>{m.body.substring(0, 85)}</p>
                <Badge value={m.aiClassification || m.status} />
              </button>
            ))}
          </div>
          <article className="message-detail">
            <div className="message-header">
              <CompanyName
                name={message.lead.company.name}
                detail={message.lead.contact?.email || "Aucun email vérifié"}
                onClick={() => openLead(message.leadId)}
              />
              <Badge value={message.status} />
            </div>
            <h2>{message.subject}</h2>
            <div className="message-meta">
              <span>
                {label(message.direction)} ·{" "}
                {date(
                  message.sentAt || message.receivedAt || message.createdAt,
                )}
              </span>
              {message.aiConfidence != null && (
                <span>
                  Classification fiable à {Math.round(message.aiConfidence * 100)} %
                </span>
              )}
            </div>
            {message.dryRun && message.direction === "OUTBOUND" && (
              <div className="info-box">
Message en mode simulation · aucun email réel envoyé
              </div>
            )}
            <div className="email-body">{message.body}</div>
            {message.error && <div className="error-box">{message.error}</div>}
            <div className="message-actions">
              <Button
                variant="outline"
                onClick={() => openLead(message.leadId)}
              >
                Ouvrir la conversation
              </Button>
              {["DRAFT", "APPROVED", "DEFERRED"].includes(message.status) && (
                <>
                  <Button variant="outline" onClick={() => setEdit(true)}>
                    <Edit3 size={15} />
                    Modifier le brouillon
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        { action: "send-message", messageId: message.id },
                        data.settings.dryRun
                          ? "Email simulé"
                          : "Email traité",
                      )
                    }
                  >
                    <Send size={15} />
                    {data.settings.dryRun ? "Simuler l’envoi" : "Envoyer l’email"}
                  </Button>
                </>
              )}
            </div>
          </article>
        </div>
      ) : (
        <Empty
          title="Aucun message pour l’instant"
          description="Ouvrez un lead qualifié et générez un email personnalisé pour démarrer une conversation."
        />
      )}
      {edit && message && (
        <Modal title="Modifier le brouillon" close={() => setEdit(false)} wide>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  {
                    action: "update-message",
                    id: message.id,
                    subject: String(f.get("subject")),
                    body: String(f.get("body")),
                  },
                  "Brouillon mis à jour",
                )
              )
                setEdit(false);
            }}
          >
            <label>
              Objet
              <Input name="subject" defaultValue={message.subject} required />
            </label>
            <label>
              Message
              <Textarea
                name="body"
                defaultValue={message.body}
                rows={12}
                required
              />
            </label>
            <div className="modal-actions">
              <Button disabled={busy}>Enregistrer le brouillon</Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
type Campaign = WorkspaceSnapshot["campaigns"][number];
export function Campaigns() {
  const { data, mutate, busy } = useWorkspace();
  const [create, setCreate] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  return (
    <>
      <div className="section-toolbar">
        <span>
          {data.campaigns.length} campagne(s) ·{" "}
          {data.campaigns.filter((c) => c.status === "ACTIVE").length} active(s)
        </span>
        <Button onClick={() => setCreate(true)}>
          <Plus size={16} />
          Créer une campagne
        </Button>
      </div>
      <div className="campaign-grid">
        {data.campaigns.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <SectionTitle
                title={c.name}
                action={<Badge value={c.status} />}
              />
              <p className="muted">
                {c.target} · {c.country} · {c.employeesMin}–{c.employeesMax}{" "}
                salariés
              </p>
            </CardHeader>
            <CardContent>
              <div className="campaign-numbers">
                <div>
                  <strong>{c._count.leads}</strong>
                  <span>Leads</span>
                </div>
                <div>
                  <strong>{c._count.messages}</strong>
                  <span>Messages</span>
                </div>
                <div>
                  <strong>{c.minLeadScore}+</strong>
                  <span>Score min.</span>
                </div>
              </div>
              <div className="campaign-rule">
                <span>Choix dynamique de l’offre</span>
                <Badge value={c.autopilotEnabled ? "AUTOPILOT" : "REVIEW"}>
                  {c.autopilotEnabled ? "Automatique" : "À valider"}
                </Badge>
              </div>
              <div className="sequence-steps">
                {c.sequences.map((s) => (
                  <div key={s.id}>
                    <span className="sequence-point" />
                    <strong>Jour {Math.round(s.delayHours / 24)}</strong>
                    <small>
                      {s.stepNumber === 0
                        ? "Premier email"
                        : `Relance ${s.stepNumber}`}
                    </small>
                  </div>
                ))}
              </div>
              <div className="campaign-rule">
                <span>{c.dailyLimit} nouveaux contacts / jour</span>
                <button className="text-link" onClick={() => setEditing(c)}>
                  Modifier les réglages
                </button>
              </div>
              <div className="campaign-actions">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      {
                        action: "update-campaign",
                        id: c.id,
                        status: c.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                      },
                      "Statut de la campagne mis à jour",
                    )
                  }
                >
                  {c.status === "ACTIVE" ? (
                    <Pause size={14} />
                  ) : (
                    <Play size={14} />
                  )}{" "}
                  {c.status === "ACTIVE" ? "Mettre en pause" : "Activer"}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      {
                        action: "discover",
                        query: `${c.target} ${c.country}`,
                        campaignId: c.id,
                      },
                      "Recherche de la campagne terminée",
                    )
                  }
                >
                  <Search size={14} />
                  Lancer la recherche
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!data.campaigns.length && (
        <Card>
          <Empty
            title="Créez votre première campagne"
            description="Définissez un marché et un rythme quotidien. Le moteur adapte une offre à chaque prospect."
            action={
              <Button onClick={() => setCreate(true)}>Créer une campagne</Button>
            }
          />
        </Card>
      )}
      {create && (
        <Modal title="Créer une campagne" close={() => setCreate(false)} wide>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  {
                    action: "create-campaign",
                    name: String(f.get("name")),
                    target: String(f.get("target")),
                    country: String(f.get("country")),
                    employeesMin: Number(f.get("employeesMin")),
                    employeesMax: Number(f.get("employeesMax")),
                    minLeadScore: Number(f.get("minLeadScore")),
                    dailyLimit: Number(f.get("dailyLimit")),
                    autopilotEnabled: f.get("autopilot") === "on",
                  },
                  "Campagne créée",
                )
              )
                setCreate(false);
            }}
          >
            <label>
              Nom de la campagne
              <Input
                name="name"
                placeholder="Marques Shopify Royaume-Uni"
                required
              />
            </label>
            <label>
              Entreprises ciblées
              <Input
                name="target"
                placeholder="marque de skincare indépendante boutique en ligne"
                required
              />
            </label>
            <div className="form-grid">
              <label>
                Pays
                <select name="country">
                  {["US", "UK", "CA", "FR", "BE", "NL", "DE", "LU", "CH"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Score minimum
                <Input
                  name="minLeadScore"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={75}
                  required
                />
              </label>
              <label>
                Effectif minimum
                <Input
                  name="employeesMin"
                  type="number"
                  min={1}
                  defaultValue={5}
                  required
                />
              </label>
              <label>
                Effectif maximum
                <Input
                  name="employeesMax"
                  type="number"
                  min={1}
                  defaultValue={200}
                  required
                />
              </label>
              <label>
                Nouveaux contacts / jour
                <Input
                  name="dailyLimit"
                  type="number"
                  min={1}
                  max={1000}
                  defaultValue={10}
                  required
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input name="autopilot" type="checkbox" />
              Activer le pilote automatique pour cette campagne
            </label>
            <p className="muted">
              Les règles de sécurité et les plafonds quotidiens s’appliquent toujours.
              Une séquence jour 0, 3 et 7 est incluse.
            </p>
            <div className="modal-actions">
              <Button disabled={busy}>Créer la campagne</Button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={`Modifier ${editing.name}`}
          close={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  {
                    action: "update-campaign",
                    id: editing.id,
                    dailyLimit: Number(f.get("dailyLimit")),
                    autopilotEnabled: f.get("autopilot") === "on",
                  },
                  "Réglages de la campagne mis à jour",
                )
              )
                setEditing(null);
            }}
          >
            <label>
              Nouveaux contacts par jour
              <Input
                name="dailyLimit"
                type="number"
                min={1}
                max={1000}
                defaultValue={editing.dailyLimit}
                required
              />
            </label>
            <label className="checkbox-label">
              <input
                name="autopilot"
                type="checkbox"
                defaultChecked={editing.autopilotEnabled}
              />
              Activer le pilote automatique
            </label>
            <div className="modal-actions">
              <Button disabled={busy}>Enregistrer</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function ReviewQueue() {
  const { data, openLead, mutate, busy } = useWorkspace();
  const [filter, setFilter] = useState("PENDING");
  const [editing, setEditing] = useState<ReviewView | null>(null);
  const rows = data.reviews.filter(
    (r) => filter === "ALL" || r.status === filter,
  );
  const decision = async (
    r: ReviewView,
    value: Extract<WorkspaceAction, { action: "review" }>["decision"],
  ) =>
    mutate(
      { action: "review", id: r.id, decision: value },
      decisionMessages[value],
    );
  return (
    <>
      <div
        className="tabs standalone"
        role="tablist"
        aria-label="Statut de validation"
      >
        {["PENDING", "HANDOFF", "ALL"].map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={filter === s}
            className={s === filter ? "selected" : ""}
            onClick={() => setFilter(s)}
          >
            {s === "ALL" ? "Tout" : label(s)}
            <span>
              {data.reviews.filter((r) => s === "ALL" || r.status === s).length}
            </span>
          </button>
        ))}
      </div>
      <div className="review-list">
        {rows.map((r) => (
          <Card key={r.id} className="review-card">
            <CardHeader>
              <div className="review-heading">
                <CompanyName
                  name={r.lead?.company.name || "Validation de l’espace"}
                  detail={r.lead?.contact?.fullName || "Aucun contact"}
                  onClick={r.leadId ? () => openLead(r.leadId!) : undefined}
                />
                <div className="inline-heading">
                  {r.lead && <Score value={r.lead.totalScore} />}
                  <Badge value={r.status} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <h3>{r.title}</h3>
              <p className="review-reason">{r.description}</p>
              <div className="recommendation">
                <strong>Action recommandée</strong>
                <p>{r.proposedAction}</p>
              </div>
              {r.message && (
                <details className="review-conversation">
                  <summary>Voir le message proposé</summary>
                  <strong>{r.message.subject}</strong>
                  <p className="email-body">{r.message.body}</p>
                </details>
              )}
              {r.lead?.messages.some((m) => m.direction === "INBOUND") && (
                <div className="review-reply">
                  <span>Dernière réponse du prospect</span>
                  <p>
                    {
                      [...r.lead.messages]
                        .reverse()
                        .find((m) => m.direction === "INBOUND")?.body
                    }
                  </p>
                </div>
              )}
              <div className="review-actions">
                {["PENDING", "HANDOFF"].includes(r.status) && (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => decision(r, "approve")}
                    >
                      <Check size={15} />
                      Approuver
                    </Button>
                    {r.message && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setEditing(r)}
                      >
                        <Edit3 size={14} />
                        Modifier
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => decision(r, "reject")}
                    >
                      <X size={14} />
                      Refuser
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || r.status === "HANDOFF"}
                      onClick={() => decision(r, "handoff")}
                    >
                      <UserRound size={14} />
                      Reprendre en main
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => decision(r, "blacklist")}
                    >
                      <Ban size={14} />
                      Liste noire
                    </Button>
                  </>
                )}
                <span className="review-date">{date(r.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!rows.length && (
        <Card>
          <Empty
            title="Rien à valider"
            description="Les messages et décisions qui demandent votre jugement apparaîtront ici."
          />
        </Card>
      )}
      {editing && (
        <Modal
          title="Modifier le message proposé"
          close={() => setEditing(null)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  {
                    action: "review",
                    id: editing.id,
                    decision: "edit",
                    body: String(f.get("body")),
                  },
                  "Message mis à jour",
                )
              )
                setEditing(null);
            }}
          >
            <label>
              Message
              <Textarea
                name="body"
                rows={12}
                defaultValue={editing.message?.body || ""}
                required
              />
            </label>
            <p className="muted">
              L’enregistrement conserve le message en validation jusqu’à votre approbation.
            </p>
            <div className="modal-actions">
              <Button disabled={busy}>Enregistrer les modifications</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export const stages = [
  "DISCOVERED",
  "QUALIFIED",
  "CONTACTED",
  "REPLIED",
  "INTERESTED",
  "MEETING",
  "PROPOSAL",
  "WON",
  "LOST",
];
export function Pipeline() {
  const { data, openLead, mutate, busy } = useWorkspace();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const editDeal = data.deals.find((d) => d.id === editing);
  return (
    <>
      <div className="pipeline-toolbar">
        <div>
          <strong>{money(data.metrics.estimatedPipeline)}</strong>
          <span>de pipeline ouvert</span>
          <span className="separator" />
          <strong>{data.deals.length}</strong>
          <span>opportunités</span>
        </div>
        <span className="muted">
          Glissez les opportunités d’une étape à l’autre, ou utilisez le menu déroulant.
        </span>
      </div>
      <div className="kanban">
        {stages.map((stage) => {
          const deals = data.deals.filter((d) => d.stage === stage);
          return (
            <section
              key={stage}
              className={`kanban-column ${over === stage ? "drop-target" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = drag || e.dataTransfer.getData("text/plain");
                if (data.deals.some((d) => d.id === id))
                  void mutate(
                    { action: "move-deal", id, stage },
                    `Opportunité déplacée vers « ${label(stage)} »`,
                  );
                setDrag(null);
                setOver(null);
              }}
            >
              <header>
                <div>
                  <span className={`stage-dot stage-${stage.toLowerCase()}`} />
                  <h2>{label(stage)}</h2>
                  <span className="stage-count">{deals.length}</span>
                </div>
                <span>
                  {money(deals.reduce((sum, d) => sum + d.estimatedValue, 0))}
                </span>
              </header>
              <div className="kanban-cards">
                {deals.map((d) => (
                  <article
                    key={d.id}
                    className="deal-card"
                    draggable={!busy}
                    onDragStart={(e) => {
                      setDrag(d.id);
                      e.dataTransfer.setData("text/plain", d.id);
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setOver(null);
                    }}
                  >
                    <CompanyName
                      name={d.lead.company.name}
                      onClick={() => openLead(d.leadId)}
                    />
                    <p>
                      {d.lead.recommendedOffer?.name ||
                        "Offre à qualifier"}
                    </p>
                    <div className="deal-value">
                      <strong>{money(d.estimatedValue)}</strong>
                      <span>{d.probability} % de probabilité</span>
                    </div>
                    <div className="deal-next">
                      <span>Prochaine action</span>
                      {d.nextAction}
                    </div>
                    <label className="sr-only" htmlFor={`stage-${d.id}`}>
                      Étape pour {d.lead.company.name}
                    </label>
                    <select
                      id={`stage-${d.id}`}
                      disabled={busy}
                      value={stage}
                      onChange={(e) =>
                        mutate(
                          {
                            action: "move-deal",
                            id: d.id,
                            stage: e.target.value,
                          },
                          "Étape mise à jour",
                        )
                      }
                    >
                      {stages.map((s) => (
                        <option value={s} key={s}>
                          {label(s)}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(d.id)}
                    >
                      Modifier la valeur et l’action
                    </Button>
                  </article>
                ))}
                {!deals.length && (
                  <div className="kanban-empty">Aucune opportunité ici</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {editDeal && (
        <Modal
          title={`Modifier l’opportunité · ${editDeal.lead.company.name}`}
          close={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  {
                    action: "move-deal",
                    id: editDeal.id,
                    stage: editDeal.stage,
                    estimatedValue: Number(f.get("value")),
                    nextAction: String(f.get("nextAction")),
                  },
                  "Opportunité mise à jour",
                )
              )
                setEditing(null);
            }}
          >
            <label>
              Valeur de l’opportunité (EUR)
              <Input
                name="value"
                type="number"
                min="0"
                max="10000000"
                step="0.01"
                defaultValue={editDeal.estimatedValue}
                required
              />
            </label>
            <label>
              Prochaine action
              <Textarea
                name="nextAction"
                defaultValue={editDeal.nextAction}
                maxLength={1000}
              />
            </label>
            <p className="muted">
              Une fois marquée « Gagné », cette valeur alimente le chiffre d’affaires.
            </p>
            <div className="modal-actions">
              <Button disabled={busy}>Enregistrer</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
