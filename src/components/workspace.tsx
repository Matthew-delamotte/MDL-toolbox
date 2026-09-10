"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronDown,
  Compass,
  Download,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SquareKanban,
  Target,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { WorkspaceAction, WorkspaceSnapshot } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { WorkspaceContext } from "@/components/workspace-context";
import { Modal } from "@/components/shared";
import { longDate } from "@/lib/utils";
import { Overview, Analytics } from "@/components/views/overview";
import {
  Leads,
  Companies,
  Opportunities,
  ActivityView,
} from "@/components/views/records";
import {
  InboxView,
  Campaigns,
  ReviewQueue,
  Pipeline,
} from "@/components/views/operations";
import { SettingsView } from "@/components/views/settings";
import { LeadDetail } from "@/components/lead-detail";
const nav = [
  ["dashboard", "Tableau de bord", LayoutDashboard],
  ["leads", "Leads", Users],
  ["companies", "Entreprises", Building2],
  ["opportunities", "Opportunités", Compass],
  ["inbox", "Messagerie", Inbox],
  ["campaigns", "Campagnes", Target],
  ["review", "À valider", ShieldCheck],
  ["pipeline", "Pipeline", SquareKanban],
  ["analytics", "Statistiques", BarChart3],
  ["settings", "Réglages", Settings2],
  ["activity", "Activité", Activity],
] as const;
const descriptions: Record<string, string> = {
  dashboard: "Votre moteur de prospection, en un coup d’œil.",
  leads: "Trouvez, qualifiez et engagez les bonnes conversations.",
  companies: "Les entreprises derrière votre prochaine opportunité.",
  opportunities: "Des signaux réels, des projets pertinents, une suite claire.",
  inbox: "Chaque conversation, avec le contexte qui compte.",
  campaigns: "Un ciblage précis, à un rythme quotidien maîtrisé.",
  review: "Votre jugement, là où il est nécessaire.",
  pipeline: "De la première découverte au prochain client.",
  analytics: "Comprenez ce qui transforme une approche en chiffre d’affaires.",
  settings: "Les commandes de votre moteur de prospection.",
  activity: "Le journal transparent de chaque action.",
};
export function Workspace({
  section,
  userEmail,
}: {
  section: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [modal, setModal] = useState<"discover" | "import" | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const reload = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    if (!response.ok)
      throw new Error(
        "Chargement de l’espace impossible. Vérifiez le serveur, puis réessayez.",
      );
    setData(await response.json());
    setError("");
  }, [router]);
  useEffect(() => {
    void Promise.resolve()
      .then(reload)
      .catch((e) => setError(e.message));
  }, [reload]);
  const mutate = async (action: WorkspaceAction, success = "Modifications enregistrées") => {
    if (busy) return false;
    setBusy(true);
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const result = await response.json();
      if (!response.ok || result.error)
        throw new Error(result.error || "L’action n’a pas pu être effectuée.");
      await reload();
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "L’action n’a pas pu être effectuée.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const attention =
    data?.reviews.filter(
      (r) => r.status === "PENDING" || r.status === "HANDOFF",
    ).length || 0;
  const views: Record<string, React.ReactNode> = {
    dashboard: <Overview />,
    leads: <Leads />,
    companies: <Companies />,
    opportunities: <Opportunities />,
    inbox: <InboxView />,
    campaigns: <Campaigns />,
    review: <ReviewQueue />,
    pipeline: <Pipeline />,
    analytics: <Analytics />,
    settings: <SettingsView />,
    activity: <ActivityView />,
  };
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Fermer la navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-mark">m.</span>
          <span>
            MDL <b>Lead Engine</b>
          </span>
        </Link>
        <div className="workspace-picker">
          <span className="workspace-icon">M</span>
          <div>
            <strong>MDL Advisory</strong>
            <small>Espace de prospection</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-caption">Espace</span>
        <nav>
          {nav.slice(0, 9).map(([key, title, Icon]) => (
            <Link
              key={key}
              href={key === "dashboard" ? "/" : `/${key}`}
              className={`nav-item ${section === key ? "active" : ""}`}
              onClick={() => setMobile(false)}
            >
              <Icon size={18} />
              {title}
              {key === "review" && attention > 0 && (
                <span className="nav-count">{attention}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-status">
            <span
              className={`status-dot ${data?.settings.autopilotEnabled ? "live" : ""}`}
            />
            <div>
              <strong>
                {data?.settings.autopilotEnabled
                  ? "Pilote automatique actif"
                  : "Pilote automatique en pause"}
              </strong>
              <small>
                {data?.settings.dailyNewContactCap ?? 20} nouveaux contacts / jour
              </small>
            </div>
          </div>
          {nav.slice(9).map(([key, title, Icon]) => (
            <Link
              key={key}
              href={`/${key}`}
              className={`nav-item ${section === key ? "active" : ""}`}
            >
              <Icon size={18} />
              {title}
            </Link>
          ))}
          <div className="user-row">
            <span className="user-avatar">
              {(data?.user.name || userEmail || "M").substring(0, 1)}
            </span>
            <div>
              <strong>{data?.user.name || "Administrateur"}</strong>
              <small title={userEmail}>{userEmail}</small>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label="Se déconnecter"
            >
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Ouvrir la navigation"
            >
              <Menu size={20} />
            </Button>
            <span className="topbar-workspace">Espace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{nav.find((n) => n[0] === section)?.[1]}</strong>
          </div>
          <div>
            <span className="topbar-date">
              {longDate()}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualiser l’espace"
              onClick={() => reload().catch((e) => toast.error(e.message))}
            >
              <RefreshCw size={16} />
            </Button>
          </div>
        </header>
        {data?.settings.dryRun && (
          <div className="dry-banner">
            <FlaskConical size={15} />
            <strong>MODE SIMULATION</strong>
            <span>Parcourez tout le fonctionnement. Aucun email réel ne sera envoyé.</span>
            <Link href="/settings">
              Voir les réglages
              <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
        <main className="main-content">
          <div className="page-heading">
            <div>
              <h1>{nav.find((n) => n[0] === section)?.[1]}</h1>
              <p>{descriptions[section]}</p>
            </div>
            <div className="page-actions">
              {["dashboard", "leads", "companies", "opportunities"].includes(
                section,
              ) && (
                <>
                  <Button variant="outline" onClick={() => setModal("import")}>
                    <Download size={16} />
                    Importer un CSV
                  </Button>
                  <Button onClick={() => setModal("discover")}>
                    <Plus size={17} />
                    Trouver des prospects
                  </Button>
                </>
              )}
              {section === "inbox" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    mutate({ action: "followups" }, "Relances dues traitées")
                  }
                >
                  <Play size={15} />
                  Lancer les relances dues
                </Button>
              )}
            </div>
          </div>
          {error ? (
            <div className="error-box" role="alert">
              {error}
              <Button
                variant="outline"
                onClick={() => reload().catch((e) => setError(e.message))}
              >
                Réessayer
              </Button>
            </div>
          ) : !data ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              Chargement de votre espace…
            </div>
          ) : (
            <WorkspaceContext.Provider
              value={{
                data,
                busy,
                mutate,
                openLead: setLeadId,
                discover: () => setModal("discover"),
                importCsv: () => setModal("import"),
              }}
            >
              {views[section]}
              {leadId && (
                <LeadDetail id={leadId} close={() => setLeadId(null)} />
              )}
            </WorkspaceContext.Provider>
          )}
        </main>
        <footer className="app-footer">
          <span>MDL Lead Engine</span>
          <span>Conçu pour une prospection soignée.</span>
        </footer>
      </div>
      {busy && (
        <div className="working-indicator" role="status">
          <LoaderCircle size={16} className="spin" />
          Traitement en cours…
        </div>
      )}
      {modal === "discover" && (
        <Modal title="Trouver de nouveaux prospects" close={() => setModal(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              if (
                await mutate(
                  {
                    action: "discover",
                    query: String(form.get("query")),
                    campaignId: String(form.get("campaignId")) || undefined,
                  },
                  "Recherche terminée",
                )
              )
                setModal(null);
            }}
          >
            <p className="muted">
              Décrivez les entreprises avec lesquelles vous voulez travailler. Les
              doublons sont écartés automatiquement.
            </p>
            <label>
              Votre recherche
              <Input
                name="query"
                placeholder="marque de skincare indépendante Londres boutique en ligne"
                required
                minLength={3}
              />
            </label>
            <label>
              Rattacher à une campagne
              <select name="campaignId">
                <option value="">Aucune campagne</option>
                {data?.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!data?.providers.tavily && (
              <div className="info-box">
                Tavily n’est pas connecté. La recherche renverra des exemples de
                démonstration, clairement identifiés.
              </div>
            )}
            <div className="modal-actions">
              <Button
                variant="outline"
                type="button"
                onClick={() => setModal(null)}
              >
                Annuler
              </Button>
              <Button disabled={busy}>
                <Compass size={16} />
                {busy ? "Recherche en cours…" : "Lancer la recherche"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "import" && (
        <Modal title="Importer des prospects depuis un CSV" close={() => setModal(null)} wide>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate({ action: "import-csv", csv }, "CSV importé")) {
                setModal(null);
                setCsv("");
              }
            }}
          >
            <p className="muted">
              Colonnes attendues : company, website, contact, email, job_title,
              opportunity, source_url. Les contacts déjà présents sont ignorés.
            </p>
            <label>
              Choisir un fichier CSV
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setCsv(await file.text());
                }}
              />
            </label>
            <label>
              Contenu du CSV
              <Textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={9}
                required
                placeholder={
                  "company,website,contact,email,job_title,opportunity,source_url"
                }
              />
            </label>
            <div className="modal-actions">
              <Button
                variant="outline"
                type="button"
                onClick={() => setModal(null)}
              >
                Annuler
              </Button>
              <Button disabled={busy || !csv.trim()}>Importer les prospects</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
