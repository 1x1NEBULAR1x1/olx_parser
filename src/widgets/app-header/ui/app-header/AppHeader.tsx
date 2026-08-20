"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Smartphone } from "lucide-react";
import styles from "./AppHeader.module.scss";

interface AppHeaderProps {
  actions?: React.ReactNode;
}

const HIDDEN_PATHS = ["/login", "/pending"];

export function AppHeader({ actions }: AppHeaderProps) {
  const t = useTranslations("app");
  const pathname = usePathname() ?? "";
  const { data: session } = useSession();
  const [is_scrolled, set_is_scrolled] = useState(false);
  const is_admin = session?.user?.role === "admin";

  useEffect(() => {
    function handleScroll() {
      set_is_scrolled(window.scrollY > 4);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (HIDDEN_PATHS.some((path) => pathname.startsWith(path))) {
    return null;
  }

  const nav_items = [
    { href: "/", label: t("nav_feed"), match: (path: string) => path === "/" || path.startsWith("/devices/") },
    { href: "/favorites", label: t("nav_favorites"), match: (path: string) => path.startsWith("/favorites") },
    ...(is_admin
      ? [{ href: "/admin", label: t("nav_admin"), match: (path: string) => path.startsWith("/admin") }]
      : []),
  ];

  function renderNav(class_name: string) {
    return (
      <nav className={class_name} aria-label={t("title")}>
        {nav_items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.header_link} ${item.match(pathname) ? styles.header_link_active : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <header
      className={`${styles.header} ${is_scrolled ? styles.header_scrolled : ""}`}
    >
      <a href="#main-content" className="skip_link">{t("skip_to_content")}</a>
      <div className={styles.header_accent} />
      <div className={styles.header_inner}>
        <Link href="/" className={styles.header_brand} aria-label={t("title")}>
          <span className={styles.header_logo} aria-hidden>
            <Smartphone size={18} />
          </span>
          <span className={styles.header_name}>{t("title")}</span>
        </Link>

        {renderNav(styles.header_nav)}

        <div className={styles.header_actions}>
          {actions}
        </div>

        {renderNav(styles.header_nav_mobile)}
      </div>
    </header>
  );
}
