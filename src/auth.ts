import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [Credentials({
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials) {
      const parsed = z.object({ email: z.email(), password: z.string().min(1).max(256) }).safeParse(credentials);
      if (!parsed.success) return null;
      const email = parsed.data.email.toLowerCase();
      // Persistent single-user login throttling also works across serverless instances.
      const since = new Date(Date.now() - 15 * 60 * 1000);
      const failures = await db.activityLog.count({ where: { action: "auth.failed", entityId: email, createdAt: { gte: since } } });
      if (failures >= 10) return null;
      const user = await db.user.findUnique({ where: { email } });
      const valid = user && await compare(parsed.data.password, user.passwordHash);
      if (!valid) {
        await db.activityLog.create({ data: { action: "auth.failed", entityId: email, message: "Failed sign-in", level: "WARN" } });
        return null;
      }
      return { id: user.id, name: user.name, email: user.email };
    },
  })],
});
