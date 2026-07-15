"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

interface MuiProviderProps {
  children: React.ReactNode;
}

function getIsDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function MuiProvider({ children }: MuiProviderProps) {
  const [is_dark, set_is_dark] = useState(false);

  useLayoutEffect(() => {
    set_is_dark(getIsDarkMode());
    const observer = new MutationObserver(() => set_is_dark(getIsDarkMode()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: is_dark ? "dark" : "light",
          primary: { main: is_dark ? "#ff5a1f" : "#e54d00" },
          success: { main: is_dark ? "#3ddc84" : "#16a34a" },
          error: { main: is_dark ? "#ff6b6b" : "#dc2626" },
          warning: { main: is_dark ? "#fbbf24" : "#d97706" },
          background: {
            default: is_dark ? "#0a0a0a" : "#f4f4f5",
            paper: is_dark ? "#141414" : "#ffffff",
          },
          divider: is_dark ? "#2a2a2a" : "#e4e4e7",
          text: {
            primary: is_dark ? "#f5f5f5" : "#18181b",
            secondary: is_dark ? "#a8a8a8" : "#52525b",
          },
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily: "inherit",
          fontSize: 15,
          h1: { fontSize: "1.75rem", fontWeight: 900, lineHeight: 1.2 },
          h2: { fontSize: "1.375rem", fontWeight: 800, lineHeight: 1.25 },
          h3: { fontSize: "1.125rem", fontWeight: 700, lineHeight: 1.3 },
          body1: { fontSize: "0.9375rem", lineHeight: 1.5 },
          body2: { fontSize: "0.875rem", lineHeight: 1.45 },
          caption: { fontSize: "0.8125rem", lineHeight: 1.4 },
          button: { fontSize: "0.875rem", fontWeight: 700, textTransform: "none" },
        },
        spacing: 8,
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale",
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: { backgroundImage: "none" },
            },
          },
          MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
              root: { borderRadius: 10, paddingInline: 16, paddingBlock: 10 },
            },
            variants: [
              {
                props: { variant: "contained" },
                style: { fontWeight: 800 },
              },
            ],
          },
          MuiIconButton: {
            styleOverrides: {
              root: {
                border: "1px solid",
                borderColor: is_dark ? "#2a2a2a" : "#e4e4e7",
                borderRadius: 10,
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: { fontWeight: 600, fontSize: "0.8125rem" },
            },
          },
          MuiTypography: {
            defaultProps: { variantMapping: { subtitle1: "p", subtitle2: "p" } },
          },
        },
      }),
    [is_dark],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
