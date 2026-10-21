import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [CredentialsProvider({
    name: "Credentials", credentials: { email: {}, password: {} },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase();
      const password = credentials?.password;
      if (!email || !password) return null;
      const user = await db.user.findUnique({ where: { email } });
      if (!user || !(await compare(password, user.passwordHash))) return null;
      return { id: user.id, name: user.name, email: user.email };
    },
  })],
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.email) {
        const user = await db.user.findUnique({ where: { email: token.email } });
        if (user) {
          session.user.id = user.id;
          session.user.role = user.role;
          session.user.tenantId = user.tenantId;
        }
      }
      return session;
    },
  },
};
