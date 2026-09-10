import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
const sections = [
  "dashboard",
  "leads",
  "companies",
  "opportunities",
  "inbox",
  "campaigns",
  "review",
  "pipeline",
  "analytics",
  "settings",
  "activity",
];
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const { section } = await params;
  const page = section?.[0] || "dashboard";
  if ((section?.length || 0) > 1 || !sections.includes(page)) notFound();
  return <Workspace section={page} userEmail={session.user.email || ""} />;
}
