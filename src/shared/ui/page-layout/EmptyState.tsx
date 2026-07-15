"use client";

import { Box, Typography } from "@mui/material";

interface EmptyStateProps {
  icon: React.ReactNode;
  message: string;
}

export function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <Box sx={{ textAlign: "center", py: 12, color: "text.secondary" }}>
      <Box sx={{ mb: 2, opacity: 0.6, display: "flex", justifyContent: "center" }}>
        {icon}
      </Box>
      <Typography variant="body1">{message}</Typography>
    </Box>
  );
}
