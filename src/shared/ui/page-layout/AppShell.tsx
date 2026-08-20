import styles from "./AppShell.module.scss";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return <div className={styles.app_shell}>{children}</div>;
}
