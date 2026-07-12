import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/db/client";

type UserAuthSnapshot = {
  id: string;
  email: string;
  role: string;
  is_approved: boolean;
  name: string | null;
  image: string | null;
};

async function applyAdminPrivilegesIfNeeded(db_user: UserAuthSnapshot): Promise<UserAuthSnapshot> {
  const admin_email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin_email || db_user.email.toLowerCase() !== admin_email) return db_user;
  if (db_user.role === "admin" && db_user.is_approved) return db_user;

  return prisma.user.update({
    where: { id: db_user.id },
    data: { role: "admin", is_approved: true },
    select: { id: true, role: true, is_approved: true, email: true, name: true, image: true },
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  events: {
    async signIn({ user }) {
      if (!user.email) return;
      const db_user = await prisma.user.findUnique({
        where: { email: user.email },
        select: { id: true, email: true, role: true, is_approved: true, name: true, image: true },
      });
      if (db_user) await applyAdminPrivilegesIfNeeded(db_user);
    },
  },
  callbacks: {
    async signIn() {
      return true;
    },
    async jwt({ token }) {
      const user_id = token.sub;
      if (!user_id) return token;

      const db_user = await prisma.user.findUnique({
        where: { id: user_id },
        select: { id: true, role: true, is_approved: true, email: true, name: true, image: true },
      });
      if (!db_user) return token;

      const fresh_user = await applyAdminPrivilegesIfNeeded(db_user);

      token.sub = fresh_user.id;
      token.role = fresh_user.role;
      token.is_approved = fresh_user.is_approved;
      token.email = fresh_user.email;
      token.name = fresh_user.name;
      token.picture = fresh_user.image;

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as string) ?? "user";
        session.user.is_approved = Boolean(token.is_approved);
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
        session.user.image = (token.picture as string | null | undefined) ?? session.user.image;
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
};
