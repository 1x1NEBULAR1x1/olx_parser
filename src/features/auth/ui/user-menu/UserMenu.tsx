"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Heart, LogOut, Shield, User } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./UserMenu.module.scss";

export function UserMenu() {
  const t = useTranslations("auth");
  const { data: session } = useSession();
  const [is_open, set_is_open] = useState(false);
  const root_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!root_ref.current?.contains(event.target as Node)) {
        set_is_open(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!session?.user) return null;

  const is_admin = session.user.role === "admin";

  return (
    <div className={styles.menu} ref={root_ref}>
      <button
        type="button"
        className={styles.menu_avatar}
        onClick={() => set_is_open((prev) => !prev)}
        aria-label={t("menu")}
      >
        {session.user.image ? (
          <img src={session.user.image} alt="" />
        ) : (
          <User size={16} aria-hidden />
        )}
      </button>

      {is_open && (
        <div className={styles.menu_dropdown}>
          {session.user.email && (
            <div className={styles.menu_email}>{session.user.email}</div>
          )}
          <Link href="/favorites" className={styles.menu_link} onClick={() => set_is_open(false)}>
            <Heart size={14} aria-hidden />
            {t("favorites")}
          </Link>
          {is_admin && (
            <Link href="/admin" className={styles.menu_link} onClick={() => set_is_open(false)}>
              <Shield size={14} aria-hidden />
              {t("admin")}
            </Link>
          )}
          <button
            type="button"
            className={`${styles.menu_btn} ${styles.menu_btn_danger}`}
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut size={14} aria-hidden />
            {t("sign_out")}
          </button>
        </div>
      )}
    </div>
  );
}
