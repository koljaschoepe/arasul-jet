/**
 * Zusammensetzungen aus dem Platzhalter `Skeleton` (`@marken`).
 *
 * Der Platzhalter selbst ist seit H3 ein Primitiv der Bibliothek -- ein
 * grauer Kasten, mehr nicht. Was hier steht, ist das, was die Shell daraus
 * baut: ein Absatz, eine Karte, eine Liste. Genau die Grenze, an der die
 * Bibliothek endet -- `Skeleton` weiß nichts von Arasul, `SkeletonList` weiß,
 * dass eine Liste auf diesem Gerät Zeilen mit Bildchen hat.
 *
 * `role="status"` steht an der LISTE und nicht am einzelnen Kasten: der ist
 * `aria-hidden`, denn niemand will sieben graue Balken vorgelesen bekommen.
 */
import { Skeleton } from '@marken';

export function SkeletonText({
  lines = 3,
  width = '100%',
  lineHeight = '1rem',
  gap = '0.5rem',
}: {
  lines?: number;
  width?: string | number;
  lineHeight?: string;
  gap?: string;
}) {
  return (
    <div className="flex flex-col" style={{ width, gap }} aria-hidden="true">
      {Array(lines)
        .fill(0)
        .map((_, i) => (
          <Skeleton key={i} height={lineHeight} width={i === lines - 1 ? '60%' : '100%'} />
        ))}
    </div>
  );
}

function SkeletonAvatar({ size = '40px' }: { size?: string }) {
  return <Skeleton width={size} height={size} borderRadius="50%" />;
}

export function SkeletonCard({
  hasAvatar = true,
  lines = 2,
}: {
  hasAvatar?: boolean;
  lines?: number;
}) {
  return (
    <div className="rounded-lg border border-border p-4" aria-hidden="true">
      <div className="flex items-center gap-3 mb-3">
        {hasAvatar && <SkeletonAvatar size="32px" />}
        <Skeleton height="1rem" width="60%" />
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

export function SkeletonList({
  count = 5,
  hasAvatar = true,
}: {
  count?: number;
  hasAvatar?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3" aria-label="Lade Inhalte..." role="status">
      {Array(count)
        .fill(0)
        .map((_, i) => (
          <SkeletonCard key={i} hasAvatar={hasAvatar} />
        ))}
    </div>
  );
}
