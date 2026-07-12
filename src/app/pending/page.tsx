"use client";

import { signOut, useSession } from "next-auth/react";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";

export default function PendingPage() {
  const t = useTranslations("auth");
  const { data: session } = useSession();

  return (
    <div className="app-shell flex items-center justify-center px-4">
      <div className="app-panel w-full max-w-md p-8 text-center">
        <Clock size={40} className="app-accent mx-auto mb-4" aria-hidden />
        <h1 className="text-xl font-black app-text mb-2">{t("pending_title")}</h1>
        <p className="text-sm app-text-muted mb-4">{t("pending_subtitle")}</p>
        {session?.user?.email && (
          <p className="text-xs app-text-faint mb-6">{session.user.email}</p>
        )}
        <button
          type="button"
          className="app-btn-ghost"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          {t("sign_out")}
        </button>
      </div>
    </div>
  );
}
