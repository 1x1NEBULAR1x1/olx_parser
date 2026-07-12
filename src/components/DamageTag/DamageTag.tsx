import styles from "./DamageTag.module.scss";
import { useTranslations } from "next-intl";

interface DamageTagProps {
  type: string;
}

export function DamageTag({ type }: DamageTagProps) {
  const t = useTranslations("damage_types");
  const safe_key = type.replace("-", "_") as string;
  const style_key = `tag_${safe_key}` as keyof typeof styles;
  const class_name = [styles.tag, styles[style_key]].filter(Boolean).join(" ");

  return (
    <span className={class_name}>
      {t(type) || type}
    </span>
  );
}
