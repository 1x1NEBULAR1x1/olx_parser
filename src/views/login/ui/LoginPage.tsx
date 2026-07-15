"use client";

import { signIn } from "next-auth/react";
import { Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Typography, useTheme } from "@mui/material";
import { CenteredPanel } from "@/shared/ui/page-layout";

export function LoginPage() {
  const t = useTranslations("auth");
  const theme = useTheme();

  return (
    <CenteredPanel>
      <Smartphone size={40} color={theme.palette.primary.main} aria-hidden />
      <Typography variant="h2" component="h1" sx={{ mt: 2, mb: 1, fontWeight: 900 }}>
        SmartFlip
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {t("login_subtitle")}
      </Typography>
      <Button
        variant="contained"
        color="primary"
        fullWidth
        size="large"
        onClick={() => signIn("google", { callbackUrl: "/" })}
      >
        {t("sign_in_google")}
      </Button>
    </CenteredPanel>
  );
}
