"use client";
import { useState } from "react";
import { ArrowUpRight, Filter, Search, Sparkles } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import {
  Badge,
  CompanyName,
  Empty,
  SafeLink,
  Score,
} from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { date, label, money } from "@/lib/utils";
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search-input">
      <Search size={16} />
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Leads() {
  const { data, openLead, mutate, busy, discover } = useWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("score");
  const leads = data.leads
    .filter(
      (l) =>
        (status === "ALL" || l.status === status) &&
        `${l.company.name} ${l.contact?.fullName} ${l.contact?.email} ${l.company.country}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "score"
        ? b.totalScore - a.totalScore
        : b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <Card>
      <div className="table-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Rechercher une entreprise, un contact, un pays…"
        />
        <div className="filter-group">
          <Filter size={15} />
          <select
            aria-label="Statut du lead"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ALL">Tous les statuts</option>
            {[...new Set(data.leads.map((l) => l.status))].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Trier les leads"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="score">Meilleur score</option>
            <option value="recent">Découverts récemment</option>
          </select>
        </div>
      </div>
      <Table>
        <thead>
          <tr>
            <th>Entreprise</th>
            <th>Contact</th>
            <th>Score</th>
            <th>Famille d’offre</th>
            <th>Statut</th>
            <th>Source</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id}>
              <td>
                <CompanyName
                  name={l.company.name}
                  detail={`${l.company.country} · ${l.company.industry}`}
                  onClick={() => openLead(l.id)}
                />
              </td>
              <td>
                {l.contact ? (
                  <>
                    <span className="cell-main">{l.contact.fullName}</span>
                    <small className="cell-sub">
                      {l.contact.jobTitle ||
                        l.contact.email ||
                        "Email introuvable"}
                    </small>
                  </>
                ) : (
                  <span className="muted">En attente d’enrichissement</span>
                )}
              </td>
              <td>
                <Score value={l.totalScore} />
              </td>
              <td>
                {l.recommendedOffer?.name || (
                  <span className="muted">Non évaluée</span>
                )}
              </td>
              <td>
                <Badge value={l.status} />
              </td>
              <td>
                <span className="cell-main">{label(l.source)}</span>
                {l.company.isDemo && (
                  <small className="fixture-label">Development fixture</small>
                )}
              </td>
              <td>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openLead(l.id)}
                  aria-label={`Ouvrir ${l.company.name}`}
                >
                  <ArrowUpRight size={17} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      { action: "process-lead", leadId: l.id },
                      "Lead enrichi, scoré et offre générée",
                    )
                  }
                  aria-label={`Enrichir et scorer ${l.company.name}`}
                >
                  <Sparkles size={16} />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!leads.length && (
        <Empty
          title="Aucun lead ne correspond"
          description="Modifiez votre recherche, ou trouvez des entreprises sur votre marché cible."
          action={<Button onClick={discover}>Trouver des prospects</Button>}
        />
      )}
      <div className="table-footer">
        <span>
          {leads.length} lead(s) sur {data.leads.length}
        </span>
        <span>
          Le score combine pertinence, valeur, délivrabilité, qualité du client et
          potentiel récurrent.
        </span>
      </div>
    </Card>
  );
}
export function Companies() {
  const { data, openLead, mutate, busy } = useWorkspace();
  const [query, setQuery] = useState("");
  const rows = data.companies.filter((c) =>
    `${c.name} ${c.country} ${c.industry}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Card>
      <div className="table-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Rechercher une entreprise…"
        />
        <span className="muted">{rows.length} entreprise(s)</span>
      </div>
      <Table>
        <thead>
          <tr>
            <th>Entreprise</th>
            <th>Secteur</th>
            <th>Effectif</th>
            <th>Technologies</th>
            <th>Contacts</th>
            <th>Statut</th>
            <th>Recherche</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <CompanyName
                  name={c.name}
                  detail={c.country}
                  onClick={
                    c.leads[0] ? () => openLead(c.leads[0].id) : undefined
                  }
                />
                <div className="company-website">
                  <SafeLink href={c.website}>{c.domain}</SafeLink>
                  {c.isDemo && (
                    <small className="fixture-label">Exemple de démonstration</small>
                  )}
                </div>
              </td>
              <td>{c.industry}</td>
              <td>{c.employeeEstimate || "Inconnu"}</td>
              <td>
                <div className="tag-list">
                  {c.technologies.slice(0, 3).map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                  {!c.technologies.length && (
                    <span className="muted">Non vérifiées</span>
                  )}
                </div>
              </td>
              <td>{c.contacts.length} trouvé(s)</td>
              <td>
                <Badge value={c.status} />
              </td>
              <td>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !c.leads.length}
                  onClick={() =>
                    mutate(
                      { action: "process-lead", leadId: c.leads[0].id },
                      "Entreprise étudiée et lead qualifié",
                    )
                  }
                >
                  <Sparkles size={14} />
                  Enrichir
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!rows.length && (
        <Empty
          title="Aucune entreprise"
          description="Lancez une recherche ou importez un CSV pour constituer votre annuaire."
        />
      )}
    </Card>
  );
}
export function Opportunities() {
  const { data, openLead } = useWorkspace();
  const [query, setQuery] = useState("");
  const rows = data.opportunities.filter((o) =>
    `${o.title} ${o.company?.name} ${o.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Card>
      <div className="table-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Rechercher une opportunité…"
        />
        <span className="muted">{rows.length} opportunité(s)</span>
      </div>
      <div className="opportunity-list">
        {rows.map((o) => (
          <article key={o.id} className="opportunity-row">
            <div>
              <div className="inline-heading">
                <h3>{o.title}</h3>
                <Badge value={o.status} />
              </div>
              <p>{o.description}</p>
              <div className="opportunity-meta">
                <span>{o.company?.name || "Entreprise non identifiée"}</span>
                <span>{o.location || "Lieu inconnu"}</span>
                <span>{label(o.source)}</span>
                <SafeLink href={o.sourceUrl}>
                  Voir la source <ArrowUpRight size={13} />
                </SafeLink>
              </div>
            </div>
            <div className="opportunity-value">
              <strong>
                {o.budgetMin != null
                  ? `${money(o.budgetMin, o.currency)}–${money(o.budgetMax || o.budgetMin, o.currency)}`
                  : "Budget non communiqué"}
              </strong>
              <small>{date(o.postedAt || o.createdAt)}</small>
              {data.leads.find((l) => l.opportunityId === o.id) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openLead(
                      data.leads.find((l) => l.opportunityId === o.id)!.id,
                    )
                  }
                >
                  Ouvrir le lead
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!rows.length && (
        <Empty
          title="Aucune opportunité"
          description="Trouvez des entreprises ou importez des opportunités depuis vos alertes email."
        />
      )}
    </Card>
  );
}
export function ActivityView() {
  const { data } = useWorkspace();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("ALL");
  const rows = data.activities.filter(
    (a) =>
      (level === "ALL" || a.level === level) &&
      `${a.message} ${a.action} ${a.entityId}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <Card>
      <div className="table-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Rechercher dans le journal…"
        />
        <select
          aria-label="Niveau"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="ALL">Tous les niveaux</option>
          {["INFO", "WARN", "ERROR"].map((x) => (
            <option key={x} value={x}>
              {label(x)}
            </option>
          ))}
        </select>
      </div>
      <Table>
        <thead>
          <tr>
            <th>Heure</th>
            <th>Action</th>
            <th>Détail</th>
            <th>Niveau</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="nowrap muted">{date(a.createdAt)}</td>
              <td>
                <strong>{label(a.action)}</strong>
                <small className="cell-sub">{a.entityType || "Système"}</small>
              </td>
              <td>
                <span className="activity-message">{a.message}</span>
                {a.metadata && Object.keys(a.metadata).length > 0 && (
                  <details className="audit-details">
                    <summary>Détail technique</summary>
                    <pre>{JSON.stringify(a.metadata, null, 2)}</pre>
                  </details>
                )}
              </td>
              <td>
                <Badge value={a.level} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!rows.length && (
        <Empty
          title="Aucune activité correspondante"
          description="Ajustez vos filtres pour explorer l’historique des actions."
        />
      )}
      <div className="table-footer">
        {rows.length} événement(s) récent(s) · Chaque action automatique est tracée.
      </div>
    </Card>
  );
}
