import styles from "./PageContainer.module.scss";

interface PageContainerProps {
  children: React.ReactNode;
  max_width?: "md" | "xl";
}

export function PageContainer({ children, max_width = "xl" }: PageContainerProps) {
  return (
    <div
      id="main-content"
      className={`${styles.page_container} ${styles[`page_container_${max_width}`]}`}
    >
      {children}
    </div>
  );
}
