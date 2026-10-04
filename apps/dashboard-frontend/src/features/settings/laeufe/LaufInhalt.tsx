/**
 * Ein Lauf zum Nachlesen, geholt erst, wenn jemand ihn sehen will: die Zeile
 * der Liste klappt ihn auf, die Seite eines Laufs zeigt ihn gleich. Beide
 * zeigen denselben `LaufDetail`.
 */
import { SkeletonText } from '@/components/ui/Skeleton';
import { LaufDetail } from '../apps/LaufAnsicht';
import { personText } from './personText';
import { useLauf } from './useLaeufe';

export function LaufInhalt({ runId }: { runId: number }) {
  const { data: lauf, isLoading, isError } = useLauf(runId);
  if (isLoading) return <SkeletonText lines={4} />;
  if (isError || !lauf) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="lauf-fehler">
        Der Lauf ließ sich nicht laden.
      </p>
    );
  }
  return <LaufDetail lauf={lauf} person={personText(lauf)} />;
}
