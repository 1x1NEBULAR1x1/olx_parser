"use client";

import { Paper, type PaperProps } from "@mui/material";

interface SettingPanelProps extends PaperProps {
  children: React.ReactNode;
}

export function SettingPanel({ children, sx, ...props }: SettingPanelProps) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 2.5, sm: 3 }, ...sx }}
      {...props}
    >
      {children}
    </Paper>
  );
}
