"use client";

import { useTranslations } from "next-intl";
import { Box, Button, Paper, Typography } from "@mui/material";
import { AppShell } from "@/shared/ui/page-layout";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const details = error.message || t("generic");
  const stack = process.env.NODE_ENV === "development" ? error.stack : undefined;

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
          {t("title")}
        </Typography>
        <Typography variant="body1" sx={{ mb: 2, textAlign: "center" }}>
          {details}
        </Typography>
        {stack && (
          <Paper
            variant="outlined"
            sx={{
              width: "100%",
              maxWidth: 640,
              p: 2,
              mb: 2,
              overflow: "auto",
              fontSize: "0.8125rem",
            }}
          >
            <Box component="pre" sx={{ m: 0, whiteSpace: "pre-wrap" }}>
              <code>{stack}</code>
            </Box>
          </Paper>
        )}
        <Button variant="contained" onClick={reset}>
          {t("retry")}
        </Button>
      </Box>
    </AppShell>
  );
}
