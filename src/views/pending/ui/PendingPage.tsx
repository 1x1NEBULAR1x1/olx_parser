"use client";

import { signOut, useSession } from "next-auth/react";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Typography, useTheme } from "@mui/material";
import { CenteredPanel } from "@/shared/ui/page-layout";

export function PendingPage() {
  const t = useTranslations("auth");
  const { data: session } = useSession();
  const theme = useTheme();

  return (
    <CenteredPanel>
      <Clock size={40} color={theme.palette.primary.main} aria-hidden />
      <Typography variant="h3" component="h1" sx={{ mt: 2, mb: 1, fontWeight: 900 }}>
        {t("pending_title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("pending_subtitle")}
      </Typography>
      {session?.user?.email && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 3, display: "block" }}>
          {session.user.email}
        </Typography>
      )}
      <Button variant="outlined" onClick={() => signOut({ callbackUrl: "/login" })}>
        {t("sign_out")}
      </Button>
    </CenteredPanel>
  );
}
