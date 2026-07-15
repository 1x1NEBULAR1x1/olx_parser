"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { Breadcrumbs, Link as MuiLink, Tab, Tabs, Typography, useTheme } from "@mui/material";
import { HeaderActions } from "@/widgets/header/ui/header-actions/HeaderActions";
import { AppShell, PageContainer, StickyHeader } from "@/shared/ui/page-layout";

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const t = useTranslations("admin");
  const theme = useTheme();
  const pathname = usePathname() ?? "";

  const nav_items = [
    { href: "/admin/users", label: t("nav_users") },
    { href: "/admin/scan-log", label: t("nav_scan_log") },
  ];

  const active_index = nav_items.findIndex(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <AppShell>
      <StickyHeader
        breadcrumb={(
          <Breadcrumbs sx={{ mb: 0.5, "& .MuiBreadcrumbs-li": { fontSize: "0.875rem" } }}>
            <MuiLink component={Link} href="/" underline="hover" color="inherit" sx={{ fontWeight: 700 }}>
              SmartFlip
            </MuiLink>
            <Typography color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Shield size={16} color={theme.palette.primary.main} aria-hidden />
              {t("hub_title")}
            </Typography>
          </Breadcrumbs>
        )}
        title={null}
        actions={<HeaderActions />}
      />

      <PageContainer>
        <Tabs
          value={active_index >= 0 ? active_index : false}
          sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
          aria-label={t("hub_title")}
        >
          {nav_items.map((item, index) => (
            <Tab
              key={item.href}
              component={Link}
              href={item.href}
              label={item.label}
              value={index}
              sx={{ fontWeight: 700, fontSize: "0.9375rem" }}
            />
          ))}
        </Tabs>

        {children}
      </PageContainer>
    </AppShell>
  );
}
