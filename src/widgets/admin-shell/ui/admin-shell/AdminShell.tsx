"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, BookOpen, ScrollText, Users } from "lucide-react";
import { AppShell, PageContainer } from "@/shared/ui/page-layout";
import styles from "./AdminShell.module.scss";

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const t = useTranslations("admin");
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [is_pending, startTransition] = useTransition();

  const nav_items = [
    { href: "/admin/users", label: t("nav_users"), icon: Users },
    { href: "/admin/catalog", label: t("nav_catalog"), icon: BookOpen },
    { href: "/admin/notifications", label: t("nav_notifications"), icon: Bell },
    { href: "/admin/scan-log", label: t("nav_scan_log"), icon: ScrollText },
  ];

  function handleNav(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <AppShell>
      <PageContainer>
        <nav className={styles.nav} aria-label={t("hub_title")}>
          {nav_items.map((item) => {
            const Icon = item.icon;
            const is_active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(event) => handleNav(event, item.href)}
                className={`${styles.nav_link} ${is_active ? styles.nav_link_active : ""}`}
                aria-current={is_active ? "page" : undefined}
              >
                <Icon size={15} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {is_pending && <div className="pending_bar" aria-hidden />}
        <div className={is_pending ? styles.nav_content_pending : undefined}>
          {children}
        </div>
      </PageContainer>
    </AppShell>
  );
}
