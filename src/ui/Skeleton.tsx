export function Skeleton({ rows = 4, icon = true }: { rows?: number; icon?: boolean }) {
  return (
    <ul className="skeleton" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          {icon && <span className="skeleton-icon" />}
          <span className="skeleton-lines">
            <span style={{ width: `${55 - (i % 3) * 12}%` }} />
            <span style={{ width: `${80 - (i % 2) * 18}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
