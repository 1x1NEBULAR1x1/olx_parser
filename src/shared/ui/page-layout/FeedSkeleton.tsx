import styles from "./FeedSkeleton.module.scss";

export function FeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={styles.feed_skeleton} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.feed_skeleton_card}>
          <div className={styles.feed_skeleton_media} />
          <div className={styles.feed_skeleton_line} />
          <div className={`${styles.feed_skeleton_line} ${styles.feed_skeleton_line_short}`} />
          <div className={styles.feed_skeleton_price} />
        </div>
      ))}
    </div>
  );
}
