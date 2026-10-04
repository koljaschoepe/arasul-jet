import { describe, it, expect, beforeEach } from 'vitest';
import {
  useWorkspaceStore,
  ansichtId,
  ansichtTitel,
  ansichtZuPfad,
  pfadZuAnsicht,
  appPfad,
  nurFuerAdmin,
  type Ansicht,
} from '../workspaceStore';

/**
 * Der Store seit M5 (Karte rahmen-aktivitaetsleiste): genau eine offene
 * Ansicht, keine Tabs, keine Sidebar-Ansicht, keine Spalten. Nichts davon wird
 * gespeichert — die Ansicht steht vollständig in der Adresse.
 */

beforeEach(() => {
  useWorkspaceStore.setState({ ansicht: { type: 'dashboard' } });
});

describe('workspaceStore, eine Ansicht', () => {
  it('beginnt auf der Startseite', () => {
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'dashboard' });
  });

  it('oeffne ersetzt die Ansicht, statt eine zweite daneben zu legen', () => {
    const { oeffne } = useWorkspaceStore.getState();
    oeffne({ type: 'app', appId: 'urlaub', stand: 'live', title: 'Urlaub' });
    oeffne({ type: 'settings' });
    expect(useWorkspaceStore.getState().ansicht).toEqual({ type: 'settings' });
  });

  it('dieselbe Ansicht noch einmal ist kein Wechsel', () => {
    const { oeffne } = useWorkspaceStore.getState();
    oeffne({ type: 'verwaltung', bereich: 'benutzer' });
    const vorher = useWorkspaceStore.getState().ansicht;
    oeffne({ type: 'verwaltung', bereich: 'benutzer' });
    expect(useWorkspaceStore.getState().ansicht).toBe(vorher);
  });

  it('eine App über die Adresse behält ihren Namen', () => {
    const { oeffne } = useWorkspaceStore.getState();
    oeffne({ type: 'app', appId: 'urlaub', stand: 'live', title: 'Urlaub' });
    oeffne({ type: 'app', appId: 'urlaub', stand: 'live' });
    expect(useWorkspaceStore.getState().ansicht.title).toBe('Urlaub');
    // Eine andere App erbt ihn nicht.
    oeffne({ type: 'app', appId: 'rechnung', stand: 'live' });
    expect(useWorkspaceStore.getState().ansicht.title).toBeUndefined();
  });

  it('setzeAppTitel trägt den Namen nur in die offene App nach', () => {
    const { oeffne, setzeAppTitel } = useWorkspaceStore.getState();
    oeffne({ type: 'app', appId: 'angebot', stand: 'test' });
    setzeAppTitel('angebot', 'live', 'Falscher Stand');
    expect(useWorkspaceStore.getState().ansicht.title).toBeUndefined();
    setzeAppTitel('angebot', 'test', 'Angebot');
    expect(useWorkspaceStore.getState().ansicht.title).toBe('Angebot');
  });

  it('der Titel fällt auf den des Typs zurück', () => {
    expect(ansichtTitel({ type: 'dashboard' })).toBe('Startseite');
    expect(ansichtTitel({ type: 'verwaltung', bereich: 'modelle' })).toBe('Verwaltung');
    expect(ansichtTitel({ type: 'app', appId: 'a', title: 'Urlaub' })).toBe('Urlaub');
  });

  it('speichert nichts im localStorage', () => {
    localStorage.removeItem('arasul_workspace');
    useWorkspaceStore.getState().oeffne({ type: 'settings' });
    expect(localStorage.getItem('arasul_workspace')).toBeNull();
  });
});

describe('Tieflink in die App (M5)', () => {
  it('trägt den Vorgang als ?freigabe= in der Adresse und liest ihn zurück', () => {
    const a = { type: 'app' as const, appId: 'urlaub', stand: 'test' as const, vorgang: 12 };
    expect(ansichtZuPfad(a)).toBe('/workspace/app/urlaub/test?freigabe=12');
    expect(pfadZuAnsicht('/app/urlaub/test', '?freigabe=12')).toEqual(a);
  });

  it('ohne oder mit unbrauchbarem Vorgang bleibt es die App', () => {
    expect(pfadZuAnsicht('/app/urlaub', '')).toEqual({
      type: 'app',
      appId: 'urlaub',
      stand: 'live',
    });
    expect(pfadZuAnsicht('/app/urlaub', '?freigabe=abc')).toEqual({
      type: 'app',
      appId: 'urlaub',
      stand: 'live',
    });
    expect(pfadZuAnsicht('/app/urlaub', '?freigabe=-3')).toEqual({
      type: 'app',
      appId: 'urlaub',
      stand: 'live',
    });
  });
});

describe('URL-Mapping (ansichtZuPfad / pfadZuAnsicht)', () => {
  it('bildet jede Ansicht auf einen Pfad ab und zurück', () => {
    const ansichten: Ansicht[] = [
      { type: 'dashboard' },
      { type: 'settings' },
      { type: 'verwaltung' },
      { type: 'verwaltung', bereich: 'benutzer' },
      { type: 'verwaltung', bereich: 'system', abschnitt: 'sicherung' },
      // Die Seite einer App in der Verwaltung, mit Ziffern in der Kennung (M5).
      { type: 'verwaltung', bereich: 'apps', abschnitt: 'probe-seite-1004' },
      { type: 'app', appId: 'urlaub', stand: 'live' },
      { type: 'app', appId: 'urlaub', stand: 'test' },
    ];
    for (const a of ansichten) {
      expect(pfadZuAnsicht(ansichtZuPfad(a).replace(/^\/workspace/, ''))).toEqual(a);
    }
    expect(ansichtZuPfad({ type: 'app', appId: 'urlaub', stand: 'test' })).toBe(
      '/workspace/app/urlaub/test'
    );
    expect(ansichtZuPfad({ type: 'verwaltung', bereich: 'modelle' })).toBe(
      '/workspace/verwaltung/modelle'
    );
  });

  it('zwei Apps sind zwei Ansichten, Live und Test einer App auch', () => {
    expect(ansichtId({ type: 'app', appId: 'a' })).not.toBe(ansichtId({ type: 'app', appId: 'b' }));
    expect(ansichtId({ type: 'app', appId: 'a', stand: 'live' })).not.toBe(
      ansichtId({ type: 'app', appId: 'a', stand: 'test' })
    );
    expect(ansichtId({ type: 'app', appId: 'a' })).toBe(
      ansichtId({ type: 'app', appId: 'a', stand: 'live' })
    );
    // Der Bereich der Verwaltung ist kein Wechsel der Ansicht.
    expect(ansichtId({ type: 'verwaltung', bereich: 'lizenz' })).toBe('verwaltung');
  });

  it('appPfad zeigt auf den Weg, unter dem die App im Browser läuft', () => {
    expect(appPfad('urlaub')).toBe('/apps/urlaub/');
    expect(appPfad('urlaub', 'test')).toBe('/apps/urlaub/test/');
  });

  /**
   * Die Kennung kommt aus der Adresszeile, und von dort kommt alles Mögliche.
   * `/workspace/app/..` ergäbe sonst einen Rahmen auf `/apps/../`, also auf
   * Arasul selbst: die Oberfläche in sich geschachtelt.
   */
  it('eine Kennung, die keine ist, ergibt keine Ansicht', () => {
    for (const p of ['/app', '/app/..', '/app/.', '/app/Gross', '/app/mit punkt', '/app/-anfang']) {
      expect(pfadZuAnsicht(p)).toBeNull();
    }
    expect(pfadZuAnsicht('/app/beispiel-app-2')).toEqual({
      type: 'app',
      appId: 'beispiel-app-2',
      stand: 'live',
    });
  });

  it('Bereich und Abschnitt der Verwaltung sind Wörter, kein Pfad', () => {
    expect(pfadZuAnsicht('/verwaltung/..')).toEqual({ type: 'verwaltung' });
    // Eine App-Kennung als Abschnitt nur im Bereich Apps (M5).
    expect(pfadZuAnsicht('/verwaltung/system/probe-1004')).toEqual({
      type: 'verwaltung',
      bereich: 'system',
    });
    expect(pfadZuAnsicht('/verwaltung/system/%2e%2e')).toEqual({
      type: 'verwaltung',
      bereich: 'system',
    });
  });

  it('die alten Pfade der Modelle landen im Bereich der Verwaltung', () => {
    expect(pfadZuAnsicht('/modelle')).toEqual({ type: 'verwaltung', bereich: 'modelle' });
    expect(pfadZuAnsicht('/store')).toEqual({ type: 'verwaltung', bereich: 'modelle' });
  });

  it('nurFuerAdmin nennt genau die Verwaltung', () => {
    expect(nurFuerAdmin('verwaltung')).toBe(true);
    // Die persönlichen Einstellungen gehören jedem.
    expect(nurFuerAdmin('settings')).toBe(false);
    expect(nurFuerAdmin('dashboard')).toBe(false);
    expect(nurFuerAdmin('app')).toBe(false);
  });

  it('gefallene und unbekannte Pfade ergeben null', () => {
    for (const p of [
      '/terminal',
      '/doc/1',
      '/projekte',
      '/flow',
      '/erweiterungen',
      '/ext/meine-app',
      '/gibt-es-nicht',
      '',
    ]) {
      expect(pfadZuAnsicht(p)).toBeNull();
    }
  });
});
