"use client";

import { Grid } from "@mui/material";

interface DeviceGridProps {
  children: React.ReactNode;
}

export function DeviceGrid({ children }: DeviceGridProps) {
  return (
    <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
      {children}
    </Grid>
  );
}

export function DeviceGridItem({ children }: { children: React.ReactNode }) {
  return (
    <Grid size={{ xs: 12, sm: 6, xl: 4 }}>
      {children}
    </Grid>
  );
}
