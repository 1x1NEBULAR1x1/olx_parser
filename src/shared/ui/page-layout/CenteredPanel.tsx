"use client";

import { Box, Paper } from "@mui/material";

interface CenteredPanelProps {
  children: React.ReactNode;
  max_width?: number;
}

export function CenteredPanel({ children, max_width = 440 }: CenteredPanelProps) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        bgcolor: "background.default",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: max_width,
          p: { xs: 4, sm: 5 },
          textAlign: "center",
          border: 1,
          borderColor: "divider",
          borderRadius: 3,
        }}
      >
        {children}
      </Paper>
    </Box>
  );
}
