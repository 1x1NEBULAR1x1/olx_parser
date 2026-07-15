import styles from "./RangeSlider.module.scss";

interface RangeSliderProps {
  min: number;
  max: number;
  step?: number;
  // В режиме single используется только value[0], второй ползунок не рендерится
  // — тот же визуальный компонент обслуживает и "цена от-до" (диапазон), и
  // "год выпуска от" (одно значение), избегая дублирования вёрстки/стилей.
  single?: boolean;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  formatValue?: (value: number) => string;
}

export function RangeSlider({
  min,
  max,
  step = 1,
  single = false,
  value,
  onChange,
  formatValue = (v) => String(v),
}: RangeSliderProps) {
  const safe_max = Math.max(min + step, max);
  const [raw_low, raw_high] = value;
  const low = Math.min(raw_low, raw_high);
  const high = Math.max(raw_low, raw_high);

  const low_pct = ((low - min) / (safe_max - min)) * 100;
  const high_pct = ((high - min) / (safe_max - min)) * 100;

  function handleLowChange(next_low: number) {
    onChange([Math.min(next_low, high), high]);
  }

  function handleHighChange(next_high: number) {
    onChange([low, Math.max(next_high, low)]);
  }

  return (
    <div className={styles.range_slider}>
      <div className={styles.range_slider_track_wrapper}>
        <div className={styles.range_slider_track} />
        <div
          className={styles.range_slider_fill}
          style={{
            left: `${single ? 0 : low_pct}%`,
            width: `${(single ? high_pct : high_pct - low_pct)}%`,
          }}
        />
        {!single && (
          <input
            type="range"
            className={styles.range_slider_input}
            min={min}
            max={safe_max}
            step={step}
            value={low}
            onChange={(e) => handleLowChange(Number(e.target.value))}
          />
        )}
        <input
          type="range"
          className={styles.range_slider_input}
          min={min}
          max={safe_max}
          step={step}
          value={high}
          onChange={(e) => handleHighChange(Number(e.target.value))}
        />
      </div>
      <div className={styles.range_slider_values}>
        {single ? (
          <span>{formatValue(high)}</span>
        ) : (
          <>
            <span>{formatValue(low)}</span>
            <span>{formatValue(high)}</span>
          </>
        )}
      </div>
    </div>
  );
}
