"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Button, Chip, CircularProgress, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import { fetchAdminUsers, patchAdminUser, type AdminUserRow } from "@/shared/api/client";

export function AdminUsersPage() {
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
    <>
      <Typography variant="h2" component="h1" sx={{ mb: 0.5, fontWeight: 900 }}>
        {t("title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t("subtitle")}
      </Typography>

      {loading ? (
        <Stack direction="row" spacing={1} color="text.secondary">
          <CircularProgress size={18} color="inherit" />
          <Typography variant="body2">{t("loading")}</Typography>
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{t("user")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("role")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("access")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("stats")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => {
                const is_self = user.id === session?.user?.id;
                const is_busy = updating_id === user.id;
                return (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{user.name ?? "—"}</Typography>
                      <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={user.role} size="small" color="primary" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.is_approved ? t("approved") : t("pending")}
                        size="small"
                        color={user.is_approved ? "success" : "warning"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        ♥ {user.favorites_count} · ✕ {user.hidden_count}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={is_self || is_busy}
                          onClick={() => handleToggleApproved(user)}
                        >
                          {user.is_approved ? t("revoke_access") : t("grant_access")}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={is_self || is_busy}
                          onClick={() => handleToggleRole(user)}
                        >
                          {user.role === "admin" ? t("make_user") : t("make_admin")}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
