import type { Ordner } from './useFirmenordner';

/** Der Weg, wie ein Mensch ihn liest: die Wurzel als `/`, sonst `eltern/kennung`. */
export function ordnerWeg(o: Ordner): string {
  if (o.art === 'wurzel') return '/';
  return o.ebene === 2 && o.eltern_kennung ? `${o.eltern_kennung}/${o.kennung}` : o.kennung;
}
