import { AdminShell } from "@/widgets/admin-shell/ui/admin-shell/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
