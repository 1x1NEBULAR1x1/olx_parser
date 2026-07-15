"use client";

import { Box, CircularProgress, Typography } from "@mui/material";

interface LoadingCenterProps {
  label?: string;
}

export function LoadingCenter({ label }: LoadingCenterProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        py: 12,
        gap: 2,
        color: "text.secondary",
      }}
    >
      <CircularProgress size={36} color="inherit" />
      {label && <Typography variant="body1">{label}</Typography>}
    </Box>
  );
}
