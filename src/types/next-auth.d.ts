import type { DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      is_approved: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    is_approved?: boolean;
  }
}

export type AuthUser = {
  id: string;
  email: string | null | undefined;
  name: string | null | undefined;
  image: string | null | undefined;
  role: string;
  is_approved: boolean;
};
