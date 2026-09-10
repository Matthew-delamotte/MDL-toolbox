import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
export default async function LoginPage() {
  if ((await auth())?.user) redirect("/");
  return <LoginForm />;
}
