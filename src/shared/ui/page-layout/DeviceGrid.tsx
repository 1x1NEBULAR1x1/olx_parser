import styles from "./DeviceGrid.module.scss";

interface DeviceGridProps {
  children: React.ReactNode;
  is_pending?: boolean;
}

export function DeviceGrid({ children, is_pending = false }: DeviceGridProps) {
  return (
    <div
      className={`${styles.device_grid} ${is_pending ? styles.device_grid_pending : ""}`}
      aria-busy={is_pending || undefined}
    >
      {children}
    </div>
  );
}

export function DeviceGridItem({
  children,
  index = 0,
}: {
  children: React.ReactNode;
  index?: number;
}) {
  return (
    <div
      className={styles.device_grid_item}
      style={{ "--stagger": index } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
