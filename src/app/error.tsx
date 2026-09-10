"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="main-content">
      <h1>L’espace de travail n’a pas pu se charger</h1>
      <p>Vérifiez la connexion à la base de données et les journaux de l’application, puis réessayez.</p>
      <button className="button" onClick={retry}>
        Réessayer
      </button>
    </main>
  );
}
