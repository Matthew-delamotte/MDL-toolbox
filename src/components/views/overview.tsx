"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Mail,
  MessageSquare,
  Users,
  CalendarDays,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, CompanyName, Empty, SectionTitle } from "@/components/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { date, label, money } from "@/lib/utils";
const segments: Record<string, string> = {
  source: "Source",
  country: "Pays",
  campaign: "Campagne",
  offer: "Offre",
  industry: "Secteur",
};
export function Overview() {
  const { data, openLead, discover } = useWorkspace();
  const m = data.metrics;
  const attention = data.reviews.filter((r) =>
    ["PENDING", "HANDOFF"].includes(r.status),
  );
  return (
    <>
      <div className="metric-grid">
        {[
          {
            label: "Découverts aujourd’hui",
            value: m.discoveredToday,
            detail: `${m.leads} leads dans votre espace`,
            icon: Users,
          },
          {
            label: "Leads qualifiés",
            value: m.qualified,
            detail: `${m.qualifiedRate} % de qualification`,
            icon: CheckCircle2,
          },
          {
            label: "Emails envoyés",
            value: m.emailsSent,
            detail: data.settings.dryRun
              ? "Envois simulés inclus"
              : `${m.deliveryRate} % de délivrabilité`,
            icon: Mail,
          },
          {
            label: "Réponses reçues",
            value: m.replies,
            detail: `${m.responseRate} % de réponses`,
            icon: MessageSquare,
          },
        ].map((x) => (
          <Card className="metric" key={x.label}>
            <div className="metric-label">
              {x.label}
              <x.icon size={17} />
            </div>
            <strong className="metric-value">{x.value}</strong>
            <span className="metric-detail">{x.detail}</span>
          </Card>
        ))}
      </div>
      <div className="overview-grid">
        <Card>
          <CardHeader>
            <SectionTitle
              title="Activité de prospection"
              subtitle="Le mouvement quotidien des 7 derniers jours"
              action={
                <span className="chart-period">
                  7 derniers jours
                  <CalendarDays size={14} />
                </span>
              }
            />
          </CardHeader>
          <CardContent>
            <div className="chart-legend">
              <span>
                <i style={{ background: "#2666d1" }} />
                Leads découverts
              </span>
              <span>
                <i style={{ background: "#6ba697" }} />
                Emails envoyés
              </span>
              <span>
                <i style={{ background: "#c3a05b" }} />
                Réponses
              </span>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.trend}
                  margin={{ left: -24, right: 12, top: 15, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#2666d1"
                        stopOpacity={0.16}
                      />
                      <stop
                        offset="100%"
                        stopColor="#2666d1"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#edf0f4" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#7a8794", fontSize: 11 }}
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                      })
                    }
                    minTickGap={30}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#7a8794", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e4e9ef",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    name="Leads"
                    stroke="#2666d1"
                    strokeWidth={2}
                    fill="url(#leadFill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="sent"
                    name="Emails envoyés"
                    stroke="#6ba697"
                    strokeWidth={2}
                    fill="transparent"
                  />
                  <Area
                    type="monotone"
                    dataKey="replies"
                    name="Réponses"
                    stroke="#c3a05b"
                    strokeWidth={2}
                    fill="transparent"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card className="pipeline-summary">
          <CardHeader>
            <SectionTitle
              title="Valeur du pipeline"
              action={<ArrowUpRight size={17} />}
            />
          </CardHeader>
          <CardContent>
            <div className="pipeline-total">{money(m.estimatedPipeline)}</div>
            <p className="muted">Opportunités ouvertes estimées</p>
            <div className="pipeline-summary-bar">
              <i
                style={{
                  width: `${Math.max(3, Math.min(100, m.estimatedPipeline ? (m.weightedPipeline / m.estimatedPipeline) * 100 : 0))}%`,
                }}
              />
            </div>
            <div className="summary-line">
              <span>Pipeline pondéré</span>
              <strong>{money(m.weightedPipeline)}</strong>
            </div>
            <div className="summary-line">
              <span>Réponses positives</span>
              <strong>{m.positiveReplies}</strong>
            </div>
            <div className="summary-line">
              <span>Rendez-vous</span>
              <strong>{m.meetings}</strong>
            </div>
            <div className="summary-line">
              <span>Opportunités gagnées</span>
              <strong>{m.wins}</strong>
            </div>
            <div className="summary-line">
              <span>Taux de conversion</span>
              <strong>{m.conversionRate}%</strong>
            </div>
            <Link className="panel-link" href="/pipeline">
              Ouvrir le pipeline
              <ArrowRight size={15} />
            </Link>
          </CardContent>
        </Card>
      </div>
      <div className="overview-bottom">
        <Card>
          <CardHeader>
            <SectionTitle
              title="Ce qui demande votre attention"
              subtitle="Les conversations qui appellent votre jugement"
              action={
                <Badge value="review">{attention.length} en attente</Badge>
              }
            />
          </CardHeader>
          {attention.length ? (
            <div className="attention-list">
              {attention.slice(0, 4).map((r) => (
                <div className="attention-row" key={r.id}>
                  <div
                    className={`attention-icon ${r.type === "HANDOFF" ? "handoff" : ""}`}
                  >
                    <MessageSquare size={17} />
                  </div>
                  <div>
                    <button
                      className="text-link attention-title"
                      onClick={() => r.leadId && openLead(r.leadId)}
                    >
                      {r.title}
                    </button>
                    <p>
                      {r.lead?.company.name || "Espace"} · {r.description}
                    </p>
                  </div>
                  <Badge value={r.type === "HANDOFF" ? "HANDOFF" : "REVIEW"} />
                </div>
              ))}
              <Link className="panel-link list-footer" href="/review">
                Voir la file de validation
                <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <Empty
              title="Vous êtes à jour"
              description="Les éléments qui demandent une décision apparaîtront ici."
            />
          )}
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle
              title="Activité récente"
              action={
                <Link className="text-link" href="/activity">
                  Tout voir
                </Link>
              }
            />
          </CardHeader>
          <div className="activity-preview">
            {data.activities.slice(0, 5).map((a) => (
              <div key={a.id} className="activity-mini">
                <span className="timeline-dot" />
                <div>
                  <strong>{label(a.action)}</strong>
                  <p>{a.message}</p>
                  <small>{date(a.createdAt)}</small>
                </div>
              </div>
            ))}
            {!data.activities.length && (
              <Empty
                title="Prêt à démarrer"
                description="Trouvez vos premiers prospects pour lancer le moteur."
                action={
                  <Button onClick={discover}>Trouver des prospects</Button>
                }
              />
            )}
          </div>
        </Card>
      </div>
      <Card className="recent-leads">
        <CardHeader>
          <SectionTitle
            title="Vos leads les mieux notés"
            subtitle="Un point de départ clair pour votre prochaine conversation"
            action={
              <Link className="text-link" href="/leads">
                Voir tous les leads <ArrowRight size={14} />
              </Link>
            }
          />
        </CardHeader>
        <Table>
          <thead>
            <tr>
              <th>Entreprise</th>
              <th>Contact</th>
              <th>Offre recommandée</th>
              <th>Score</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {[...data.leads]
              .sort((a, b) => b.totalScore - a.totalScore)
              .slice(0, 4)
              .map((l) => (
                <tr key={l.id}>
                  <td>
                    <CompanyName
                      name={l.company.name}
                      detail={l.company.country}
                      onClick={() => openLead(l.id)}
                    />
                  </td>
                  <td>
                    {l.contact?.fullName || (
                      <span className="muted">Contact non trouvé</span>
                    )}
                  </td>
                  <td>
                    {l.recommendedOffer?.name || "En attente de qualification"}
                  </td>
                  <td>
                    <strong className="green-text">{l.totalScore}</strong>
                    <span className="muted"> /100</span>
                  </td>
                  <td>
                    <Badge value={l.status} />
                  </td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
export function Analytics() {
  const { data } = useWorkspace();
  const [group, setGroup] = useState<keyof typeof data.breakdowns>("source");
  const m = data.metrics;
  return (
    <>
      <div className="metric-grid">
        {[
          {
            label: "Chiffre d’affaires gagné",
            value: money(m.revenue),
            detail: `${m.wins} opportunités gagnées`,
          },
          {
            label: "Taux de réponse",
            value: `${m.responseRate}%`,
            detail: `${m.replies} réponses / ${m.emailsSent} emails`,
          },
          {
            label: "Conversion en rendez-vous",
            value: `${m.replyToMeeting}%`,
            detail: `${m.meetings} rendez-vous issus des réponses`,
          },
          {
            label: "CA / lead",
            value: money(m.revenuePerLead),
            detail: `${money(m.revenuePerEmail)} de CA / email`,
          },
        ].map((x) => (
          <Card className="metric" key={x.label}>
            <div className="metric-label">{x.label}</div>
            <strong className="metric-value">{x.value}</strong>
            <span className="metric-detail">{x.detail}</span>
          </Card>
        ))}
      </div>
      <div className="overview-grid">
        <Card>
          <CardHeader>
            <SectionTitle
              title="Performance par segment"
              subtitle="Comparez vos sources et vos ciblages"
              action={
                <select
                  aria-label="Regrouper les statistiques par"
                  value={group}
                  onChange={(e) => setGroup(e.target.value as typeof group)}
                >
                  {Object.entries(segments).map(([value, name]) => (
                    <option value={value} key={value}>
                      {name}
                    </option>
                  ))}
                </select>
              }
            />
          </CardHeader>
          <CardContent>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.breakdowns[group]}
                  margin={{ left: -20, right: 5, top: 10, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="#edf0f4" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Bar dataKey="leads" fill="#2666d1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="replies" fill="#77a99c" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="Santé de la conversion" />
          </CardHeader>
          <CardContent>
            {[
              ["Qualification", m.qualifiedRate],
              ["Délivrabilité", m.deliveryRate],
              ["Réponses positives", m.positiveResponseRate],
              ["Lead → réponse", m.leadToReply],
              ["Réponse → rendez-vous", m.replyToMeeting],
              ["Rendez-vous → signature", m.meetingToWin],
            ].map(([name, value]) => (
              <div className="conversion-row" key={name}>
                <div>
                  <span>{name}</span>
                  <strong>{value}%</strong>
                </div>
                <div className="conversion-track">
                  <i style={{ width: `${Math.min(100, Number(value))}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <SectionTitle
            title={`Détail par ${segments[group].toLowerCase()}`}
            subtitle={`${m.offers} offres générées · ${money(m.estimatedPipeline)} de pipeline estimé`}
          />
        </CardHeader>
        <Table>
          <thead>
            <tr>
              <th>Segment</th>
              <th>Leads</th>
              <th>Emails envoyés</th>
              <th>Réponses</th>
              <th>Signatures</th>
              <th>Chiffre d’affaires</th>
            </tr>
          </thead>
          <tbody>
            {data.breakdowns[group].map((row) => (
              <tr key={row.name}>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>{row.leads}</td>
                <td>{row.sent}</td>
                <td>{row.replies}</td>
                <td>{row.wins}</td>
                <td>{money(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="table-note">
          Les envois simulés ne comptent ni dans la délivrabilité ni dans le chiffre d’affaires.
        </p>
      </Card>
    </>
  );
}
