"use client";

import { AppBar, Box, Toolbar } from "@mui/material";

interface StickyHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export function StickyHeader({ title, subtitle, actions, breadcrumb }: StickyHeaderProps) {
  return (
    <AppBar
      position="sticky"
      color="default"
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        backdropFilter: "blur(12px)",
        bgcolor: (theme) =>
          theme.palette.mode === "dark"
            ? "rgba(18, 26, 42, 0.88)"
            : "rgba(255, 255, 255, 0.88)",
      }}
    >
      <Toolbar
        sx={{
          flexWrap: "wrap",
          gap: { xs: 1, sm: 1.5 },
          py: { xs: 1, sm: 1.5 },
          minHeight: { xs: 56, sm: 64 },
          maxWidth: "xl",
          width: "100%",
          mx: "auto",
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box sx={{ minWidth: 0, flex: breadcrumb ? "0 1 auto" : "1 1 auto" }}>
          {breadcrumb}
          {title}
          {subtitle}
        </Box>
        {actions && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 0.75, sm: 1.5 },
              flexWrap: "wrap",
              justifyContent: "flex-end",
              ml: "auto",
              flexShrink: 0,
            }}
          >
            {actions}
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}
