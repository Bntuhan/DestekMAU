import './Skeleton.css';

export function SkeletonLine({ width = '100%' }) {
  return <div className="skeleton-line" style={{ width }}></div>;
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <SkeletonLine width="60%" />
      <SkeletonLine width="40%" />
      <SkeletonLine width="80%" />
      <SkeletonLine width="90%" />
    </div>
  );
}

export function SkeletonList({ count = 1 }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
