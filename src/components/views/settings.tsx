"use client";
import {
  Bot,
  CheckCircle2,
  Mail,
  Search,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, SectionTitle } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Settings } from "@/lib/contracts";
const sourceNames: Record<string, string> = {
  "CSV import": "Import CSV",
  "Email alerts": "Alertes email",
  "Hunter contacts": "Contacts Hunter",
  "Tavily web discovery": "Recherche web Tavily",
};
export function SettingsView() {
  const { data, mutate, busy } = useWorkspace();
  const s = data.settings;
  const providers = [
    {
      key: "openai" as const,
      name: "OpenAI",
      description: "Recherche, scoring et rédaction personnalisée",
      env: "OPENAI_API_KEY",
      icon: Bot,
    },
    {
      key: "resend" as const,
      name: "Resend",
      description: "Envoi des emails",
      env: "RESEND_API_KEY",
      icon: Mail,
    },
    {
      key: "tavily" as const,
      name: "Tavily",
      description: "Recherche d’entreprises sur le web",
      env: "TAVILY_API_KEY",
      icon: Search,
    },
    {
      key: "hunter" as const,
      name: "Hunter",
      description: "Recherche et vérification des contacts",
      env: "HUNTER_API_KEY",
      icon: Users,
    },
    {
      key: "inngest" as const,
      name: "Inngest",
      description: "Tâches de fond et relances programmées",
      env: "INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY",
      icon: Zap,
    },
    {
      key: "webhook" as const,
      name: "Webhooks email",
      description: "Réception signée des emails et des événements de livraison",
      env: "RESEND_WEBHOOK_SECRET",
      icon: ShieldCheck,
    },
  ];
  return (
    <div className="settings-layout">
      <form
        key={JSON.stringify(s)}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const settings: Partial<Omit<Settings, "dryRun">> = {};
          for (const key of [
            "companyName",
            "senderName",
            "signature",
            "calendarUrl",
            "fromEmail",
            "replyTo",
            "aiModel",
          ] as const)
            settings[key] = String(f.get(key) || "");
          for (const key of [
            "minLeadScore",
            "dailyEmailCap",
            "dailyNewContactCap",
            "autoReplyConfidence",
          ] as const)
            settings[key] = Number(f.get(key));
          settings.autopilotEnabled = f.get("autopilotEnabled") === "on";
          await mutate(
            { action: "save-settings", settings },
            "Réglages enregistrés",
          );
        }}
      >
        <Card>
          <CardHeader>
            <SectionTitle
              title="Identité de l’entreprise"
              subtitle="L’expéditeur et le contexte utilisés dans chaque conversation"
            />
          </CardHeader>
          <CardContent>
            <div className="form-grid">
              <label>
                Nom de l’entreprise
                <Input
                  name="companyName"
                  defaultValue={s.companyName}
                  required
                />
              </label>
              <label>
                Nom de l’expéditeur
                <Input name="senderName" defaultValue={s.senderName} required />
              </label>
            </div>
            <label>
              Signature
              <Textarea
                name="signature"
                defaultValue={s.signature}
                rows={3}
                required
              />
            </label>
            <label>
              Lien de prise de rendez-vous
              <Input
                name="calendarUrl"
                type="url"
                defaultValue={s.calendarUrl}
                placeholder="https://cal.com/votre-agenda"
              />
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle
              title="Email et IA"
              subtitle="Paramètres d’envoi et de génération"
            />
          </CardHeader>
          <CardContent>
            <div className="form-grid">
              <label>
                Email expéditeur
                <Input
                  name="fromEmail"
                  type="email"
                  defaultValue={s.fromEmail}
                  placeholder="matthew@votredomaine.com"
                />
              </label>
              <label>
                Adresse de réponse
                <Input name="replyTo" type="email" defaultValue={s.replyTo} />
              </label>
            </div>
            <label>
              Modèle OpenAI
              <Input name="aiModel" defaultValue={s.aiModel} required />
            </label>
            <p className="muted">
              Utilisez un expéditeur sur votre domaine vérifié chez Resend. Les adresses
              sont trouvées et vérifiées, jamais devinées.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle
              title="Pilote automatique"
              subtitle="Votre rythme quotidien et le seuil des actions autonomes"
              action={
                <Badge value={s.autopilotEnabled ? "AUTOPILOT" : "PAUSED"}>
                  {s.autopilotEnabled ? "Actif" : "En pause"}
                </Badge>
              }
            />
          </CardHeader>
          <CardContent>
            <label className="switch-row">
              <div>
                <strong>Activer le pilote automatique</strong>
                <p>
                  Autorise les approches éligibles et les réponses simples, dans le
                  respect des règles de sécurité.
                </p>
              </div>
              <input
                className="switch"
                type="checkbox"
                name="autopilotEnabled"
                defaultChecked={s.autopilotEnabled}
              />
            </label>
            <div className="form-grid">
              <label>
                Score minimum
                <Input
                  name="minLeadScore"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={s.minLeadScore}
                  required
                />
              </label>
              <label>
                Plafond d’emails par jour
                <Input
                  name="dailyEmailCap"
                  type="number"
                  min={1}
                  max={1000}
                  defaultValue={s.dailyEmailCap}
                  required
                />
              </label>
              <label>
                Nouveaux contacts / jour
                <Input
                  name="dailyNewContactCap"
                  type="number"
                  min={1}
                  max={1000}
                  defaultValue={s.dailyNewContactCap}
                  required
                />
              </label>
              <label>
                Confiance pour répondre seul
                <Input
                  name="autoReplyConfidence"
                  type="number"
                  min={0.85}
                  max={1}
                  step={0.01}
                  defaultValue={s.autoReplyConfidence}
                  required
                />
              </label>
            </div>
            <div className="info-box">
              Négociation, engagement ferme, question technique complexe et demande
              sensible passent toujours par vous.
            </div>
          </CardContent>
        </Card>
        <div className="settings-save">
          <span>Les changements s’appliquent aux prochaines actions.</span>
          <Button disabled={busy}>
            <CheckCircle2 size={16} />
            Enregistrer les réglages
          </Button>
        </div>
      </form>
      <aside>
        <Card>
          <CardHeader>
            <SectionTitle
              title="Services connectés"
              subtitle="Les clés restent sur le serveur"
            />
          </CardHeader>
          <CardContent>
            <div className="provider-list">
              {providers.map((p) => (
                <div key={p.key} className="provider-item">
                  <div className="provider-heading">
                    <p.icon size={19} />
                    <strong>{p.name}</strong>
                    <Badge
                      value={
                        data.providers[p.key] ? "CONNECTED" : "NOT_CONNECTED"
                      }
                    >
                      {data.providers[p.key] ? "Connecté" : "Non connecté"}
                    </Badge>
                  </div>
                  <p>{p.description}</p>
                  <code>{p.env}</code>
                </div>
              ))}
            </div>
            <p className="provider-guidance">
              Ajoutez ces variables dans votre fichier .env ou chez votre hébergeur,
              puis redémarrez ou redéployez. Les clés ne sont jamais affichées ici.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle
              title="Budgets fournisseurs"
              subtitle="Offres gratuites : chaque appel facturable est compté et plafonné"
            />
          </CardHeader>
          <CardContent>
            <div className="budget-list">
              {data.budgets.map((b) => {
                const percent = b.limit
                  ? Math.min(100, Math.round((b.used / b.limit) * 100))
                  : 100;
                return (
                  <div className="budget-item" key={b.key}>
                    <div className="budget-heading">
                      <strong>{b.label}</strong>
                      <span
                        className={
                          b.remaining === 0
                            ? "budget-count exhausted"
                            : "budget-count"
                        }
                      >
                        {b.used} / {b.limit}
                      </span>
                    </div>
                    <div
                      className="budget-track"
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${b.label} : consommation ${b.window === "day" ? "du jour" : "du mois"}`}
                    >
                      <span
                        className={
                          percent >= 100 ? "budget-fill full" : "budget-fill"
                        }
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <small>
                      {b.remaining} restant{b.remaining > 1 ? "s" : ""}{" "}
                      {b.window === "day" ? "aujourd’hui" : "ce mois-ci"} · {b.plan}
                    </small>
                  </div>
                );
              })}
            </div>
            <p className="provider-guidance">
              Au plafond, l’appel est refusé ici plutôt que chez le fournisseur, et le
              moteur bascule sur un résultat de démonstration clairement identifié.
              Ajustez avec TAVILY_MONTHLY_LIMIT, HUNTER_SEARCH_MONTHLY_LIMIT,
              HUNTER_VERIFY_MONTHLY_LIMIT et OPENAI_DAILY_REQUEST_LIMIT.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="Sources de prospection" />
          </CardHeader>
          <CardContent>
            {data.sources.map((source) => (
              <label className="switch-row source-toggle" key={source.id}>
                <span>{sourceNames[source.name] ?? source.name}</span>
                <input
                  className="switch"
                  type="checkbox"
                  checked={source.enabled}
                  disabled={busy}
                  onChange={(e) =>
                    mutate(
                      {
                        action: "update-source",
                        id: source.id,
                        enabled: e.target.checked,
                      },
                      "Source mise à jour",
                    )
                  }
                />
              </label>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle
              title="Mode d’envoi"
              action={
                <Badge value={s.dryRun ? "DRY_RUN" : "LIVE"}>
                  {s.dryRun ? "Simulation" : "Envois réels"}
                </Badge>
              }
            />
          </CardHeader>
          <CardContent>
            <p className="muted">
              {s.dryRun
                ? "Les envois réels sont désactivés. Passez DRY_RUN=false sur le serveur une fois vos fournisseurs, votre domaine d’envoi vérifié et vos webhooks entrants prêts."
                : "Les envois réels sont actifs. Plafonds quotidiens, vérification, blocages et règles de validation s’appliquent à chaque envoi."}
            </p>
            <p className="muted">
              {data.suppressions.length} adresse(s) bloquée(s). Désinscriptions, rejets
              et plaintes pour spam arrêtent tout envoi futur.
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
