"use client";

import { useTranslations } from "next-intl";
import { Box, Typography } from "@mui/material";
import { AppShell } from "@/shared/ui/page-layout";

export default function NotFound() {
  const t = useTranslations("errors");

  return (
    <AppShell>
      <Box
        component="main"
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 4,
          color: "text.secondary",
        }}
      >
        <Typography variant="h1" component="h1" color="text.primary" sx={{ mb: 1.5 }}>
          {t("not_found_title")}
        </Typography>
        <Typography variant="body1">{t("not_found_text")}</Typography>
      </Box>
    </AppShell>
  );
}
