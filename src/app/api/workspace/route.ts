import { auth } from "@/auth";
import { getWorkspace } from "@/lib/repositories/workspace";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Connectez-vous pour accéder à votre espace." }, { status: 401 });
  try {
    return Response.json(await getWorkspace({ name: session.user.name || "Matthew", email: session.user.email }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ action: "workspace.error", error: error instanceof Error ? error.name : "Unknown" }));
    return Response.json({ error: "Base de données indisponible. Vérifiez DATABASE_URL et appliquez les migrations." }, { status: 503 });
  }
}
