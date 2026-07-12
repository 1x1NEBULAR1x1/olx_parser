"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
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
          background: {
            default: is_dark ? "#0a0a0a" : "#f4f4f5",
            paper: is_dark ? "#141414" : "#ffffff",
          },
          divider: is_dark ? "#2a2a2a" : "#e4e4e7",
          text: {
            primary: is_dark ? "#f5f5f5" : "#18181b",
            secondary: is_dark ? "#8a8a8a" : "#71717a",
          },
        },
        shape: { borderRadius: 12 },
        typography: { fontFamily: "inherit" },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: "none",
              },
            },
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
