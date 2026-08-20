import styles from "./PageHeader.module.scss";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className={styles.page_header}>
      <div className={styles.page_header_text}>
        <h1 className={styles.page_header_title}>{title}</h1>
        {subtitle && <p className={styles.page_header_subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.page_header_actions}>{actions}</div>}
    </div>
  );
}
