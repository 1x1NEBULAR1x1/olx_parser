"use client";

import { signIn } from "next-auth/react";
import { Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  const t = useTranslations("auth");

  return (
    <div className="app-shell flex items-center justify-center px-4">
      <div className="app-panel w-full max-w-md p-8 text-center">
        <div className="flex justify-center mb-4">
          <Smartphone size={40} className="app-accent" aria-hidden />
        </div>
        <h1 className="text-2xl font-black app-text mb-2">SmartFlip</h1>
        <p className="text-sm app-text-muted mb-8">{t("login_subtitle")}</p>
        <button
          type="button"
          className="app-btn-primary w-full"
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          {t("sign_in_google")}
        </button>
      </div>
    </div>
  );
}
