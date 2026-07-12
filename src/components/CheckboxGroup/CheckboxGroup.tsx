import styles from "./CheckboxGroup.module.scss";

export interface CheckboxOption {
  value: string;
  label: string;
  count?: number;
}

interface CheckboxGroupProps {
  options: CheckboxOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  empty_label?: string;
}

export function CheckboxGroup({ options, selected, onChange, empty_label }: CheckboxGroupProps) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  if (options.length === 0 && empty_label) {
    return <p className={styles.checkbox_group_empty}>{empty_label}</p>;
  }

  return (
    <div className={styles.checkbox_group}>
      {options.map((option) => (
        <label key={option.value} className={styles.checkbox_group_item}>
          <input
            type="checkbox"
            className={styles.checkbox_group_input}
            checked={selected.includes(option.value)}
            onChange={() => toggle(option.value)}
          />
          <span className={styles.checkbox_group_box} aria-hidden />
          <span className={styles.checkbox_group_label}>{option.label}</span>
          {typeof option.count === "number" && (
            <span className={styles.checkbox_group_count}>{option.count}</span>
          )}
        </label>
      ))}
    </div>
  );
}
