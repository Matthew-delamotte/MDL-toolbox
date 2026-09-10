"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Activity, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="login">
      <div className="login-story">
        <Link className="brand" href="/">
          <span className="brand-mark">m.</span>
          <span>
            MDL <b>Lead Engine</b>
          </span>
        </Link>
        <div>
          <span className="login-kicker">
            <Activity size={17} /> Espace MDL Advisory
          </span>
          <h1>
            Moins de prospection.
            <br />
            Plus de conversations.
          </h1>
          <p>
            Trouvez les bonnes entreprises, construisez une offre pertinente et sachez
            exactement quand intervenir.
          </p>
        </div>
        <span className="login-foot">
          <ShieldCheck size={16} /> Espace de prospection privé
        </span>
      </div>
      <div className="login-panel">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(e.currentTarget);
            try {
              const result = await signIn("credentials", {
                email: data.get("email"),
                password: data.get("password"),
                redirect: false,
              });
              if (result?.error)
                setError(
                  "Email ou mot de passe non reconnu. Vérifiez vos identifiants administrateur.",
                );
              else router.replace("/");
            } catch {
              setError(
                "Connexion impossible. Vérifiez que le serveur répond, puis réessayez.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="brand-mark">m.</span>
          <h2>Bon retour</h2>
          <p className="muted">Connectez-vous à votre espace Lead Engine.</p>
          <label>
            Adresse email
            <Input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="vous@votreentreprise.com"
              required
            />
          </label>
          <label>
            Mot de passe
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <Button disabled={busy} className="full-width">
            {busy ? "Connexion…" : "Se connecter"}
            <ArrowRight size={16} />
          </Button>
          <p className="login-note">
            Premier lancement ? Vos identifiants administrateur sont dans le fichier
            .env, sous ADMIN_EMAIL et ADMIN_PASSWORD.
          </p>
        </form>
      </div>
    </main>
  );
}
