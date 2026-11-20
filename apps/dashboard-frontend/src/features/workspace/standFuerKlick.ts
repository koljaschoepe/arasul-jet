import type { AppStand } from '@/stores/workspaceStore';
import type { LeistenApp } from '@/features/apps/meineApps';

/**
 * Die Fassung, die ein Klick auf eine App in der Leiste öffnet: die, in der
 * man sie zuletzt offen hatte, sonst die erste (Live, wo es Live gibt). Jede
 * App steht genau einmal in der Leiste; umgeschaltet wird in der Kapsel.
 */
export function standFuerKlick(app: LeistenApp, zuletzt: AppStand | undefined): AppStand {
  return zuletzt && app.staende.includes(zuletzt) ? zuletzt : (app.staende[0] ?? 'live');
}
