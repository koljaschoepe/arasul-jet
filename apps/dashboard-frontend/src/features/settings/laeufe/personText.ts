import type { AppLauf } from '../apps/useAppVerwaltung';

/** Der Mensch hinter einem Lauf: Name, sonst Konto; `null`, wenn es keinen gibt (Zeitplan, Ereignis ohne Person). */
export function personText(
  l: Pick<AppLauf, 'person_id' | 'person_name' | 'person_konto'>
): string | null {
  if (l.person_id == null) return null;
  return l.person_name ?? l.person_konto ?? `Person ${l.person_id}`;
}
