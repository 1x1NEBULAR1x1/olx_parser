"use client";

import { Container, type ContainerProps } from "@mui/material";

export function PageContainer({
  children,
  maxWidth = "xl",
  sx,
  ...props
}: ContainerProps) {
  return (
    <Container
      maxWidth={maxWidth}
      sx={{
        px: { xs: 2, sm: 3 },
        py: { xs: 3, sm: 4, md: 5 },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Container>
  );
}
