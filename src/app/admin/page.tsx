"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { HeaderActions } from "@/components/HeaderActions/HeaderActions";
import { fetchAdminUsers, patchAdminUser, type AdminUserRow } from "@/lib/api";

export default function AdminPage() {
  const t = useTranslations("admin");
  const { data: session } = useSession();
  const [users, set_users] = useState<AdminUserRow[]>([]);
  const [loading, set_loading] = useState(true);
  const [updating_id, set_updating_id] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    set_loading(true);
    try {
      const rows = await fetchAdminUsers();
      set_users(rows);
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleToggleApproved(user: AdminUserRow) {
    set_updating_id(user.id);
    try {
      const updated = await patchAdminUser(user.id, { is_approved: !user.is_approved });
      set_users((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } finally {
      set_updating_id(null);
    }
  }

  async function handleToggleRole(user: AdminUserRow) {
    const next_role = user.role === "admin" ? "user" : "admin";
    set_updating_id(user.id);
    try {
      const updated = await patchAdminUser(user.id, { role: next_role });
      set_users((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } finally {
      set_updating_id(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 flex-wrap">
          <Link href="/" className="text-sm font-bold app-link">← SmartFlip</Link>
          <span className="app-divider hidden sm:inline">/</span>
          <span className="text-sm app-text-muted flex-1 flex items-center gap-2">
            <Shield size={16} className="app-accent" aria-hidden />
            {t("title")}
          </span>
          <HeaderActions />
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
        <h1 className="text-xl sm:text-2xl font-black app-text mb-1">{t("title")}</h1>
        <p className="text-sm app-text-muted mb-6">{t("subtitle")}</p>

        {loading ? (
          <div className="app-text-faint flex items-center gap-2">
            <Loader2 size={18} className="animate-spin" aria-hidden />
            {t("loading")}
          </div>
        ) : (
          <div className="app-panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left app-text-muted">
                  <th className="p-3 font-semibold">{t("user")}</th>
                  <th className="p-3 font-semibold">{t("role")}</th>
                  <th className="p-3 font-semibold">{t("access")}</th>
                  <th className="p-3 font-semibold">{t("stats")}</th>
                  <th className="p-3 font-semibold">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const is_self = user.id === session?.user?.id;
                  const is_busy = updating_id === user.id;
                  return (
                    <tr key={user.id} className="border-b border-[var(--color-border-subtle)]">
                      <td className="p-3">
                        <div className="font-semibold app-text">{user.name ?? "—"}</div>
                        <div className="text-xs app-text-faint">{user.email}</div>
                      </td>
                      <td className="p-3">
                        <span className="text-xs font-bold uppercase app-accent">{user.role}</span>
                      </td>
                      <td className="p-3">
                        {user.is_approved ? (
                          <span className="text-xs font-semibold text-[var(--color-positive)]">{t("approved")}</span>
                        ) : (
                          <span className="text-xs font-semibold text-[var(--color-warning)]">{t("pending")}</span>
                        )}
                      </td>
                      <td className="p-3 text-xs app-text-muted">
                        ♥ {user.favorites_count} · ✕ {user.hidden_count}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="app-btn-ghost text-xs"
                            disabled={is_self || is_busy}
                            onClick={() => handleToggleApproved(user)}
                          >
                            {user.is_approved ? t("revoke_access") : t("grant_access")}
                          </button>
                          <button
                            type="button"
                            className="app-btn-ghost text-xs"
                            disabled={is_self || is_busy}
                            onClick={() => handleToggleRole(user)}
                          >
                            {user.role === "admin" ? t("make_user") : t("make_admin")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
