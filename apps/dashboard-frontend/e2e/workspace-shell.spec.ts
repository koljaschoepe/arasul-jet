import { test, expect, type Page } from '@playwright/test';

/**
 * Workspace-Shell (Cursor-Raster) E2E Tests — Plan 003 »Cursor-Shell 3.1«.
 *
 * Deckt die 3.1-Anpassungen ab:
 *  - Genau ZWEI Layout-Toggles oben rechts (Sidebar + rechtes Panel). Die
 *    früheren getrennten Chat-/Terminal-Toggles sind weg — Chat und Terminal
 *    teilen sich EINE Fläche, umgeschaltet über den Segment-Kopf im Panel
 *    (data-testid="right-panel-mode").
 *  - Segment-Umschalter wechselt den Modus, ohne die inaktive Fläche zu
 *    unmounten (Keep-alive → Session überlebt).
 *  - Kontext-Sidebar (SidebarHost): Dashboard → Explorer, Extensions →
 *    Extensions-Liste, App-Tab → Sidebar klappt automatisch zu.
 *  - Terminal existiert NUR im rechten Panel, nie als Mitte-Tab; die
 *    Activity Bar hat KEINE Explorer-/Chats-/Terminal-Buttons mehr.
 *  - Bug (b): ein offener Radix-Dialog (»Neuer Ordner«) lässt Sidebar und
 *    rechtes Panel sichtbar (aria-hidden steuert die Darstellung nicht mehr).
 *  - CSRF-Retry: ein 403 CSRF_INVALID auf eine Mutation wird transparent über
 *    einen frischen Token wiederholt (lokal per Route-Mock nachgestellt).
 *  - Mitte-Tabs: öffnen, schließen, Restore nach Reload.
 *  - Extension-Gating: deaktivierte App verschwindet aus der Activity Bar.
 *
 * Läuft wie die übrigen Specs gegen E2E_BASE_URL (deployter Stack, kein
 * lokaler Dev-Server). Die Shell ist seit Schritt 10 die Standard-UI (Default
 * an); das localStorage-Flag `arasul_workspace_shell` dient nur noch dem
 * Opt-out ('false'). Diese Tests betreten die Shell explizit über /workspace
 * und lassen den Default unangetastet.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

async function login(page: Page) {
  await page.goto('/');
  await page.fill('input[name="username"], input[type="text"]', ADMIN_USER);
  await page.fill('input[type="password"]', ADMIN_PASS);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
}

/** Kurzzugriffe auf die stabilen Anker der Shell (3.1). */
function shell(page: Page) {
  const layoutGroup = page.getByRole('group', { name: 'Layout' });
  const modeSwitch = page.getByTestId('right-panel-mode');
  return {
    root: page.getByTestId('workspace-shell'),
    activityBar: page.getByRole('navigation', { name: 'Workspace-Navigation' }),
    tabList: page.getByRole('tablist', { name: 'Offene Tabs' }),
    statusBar: page.getByTestId('workspace-statusbar'),
    // Linke Fläche: kontextabhängig Explorer ODER Extensions-Liste
    explorerPanel: page.getByTestId('workspace-explorer-panel'),
    extensionsSidebar: page.getByTestId('extensions-sidebar'),
    // Rechtes Panel: EINE Fläche, zwei Modi
    rightPanel: page.getByTestId('workspace-right-panel'),
    chatPanel: page.getByTestId('workspace-chat-panel'),
    terminalPanel: page.getByTestId('workspace-terminal-panel'),
    // Genau zwei Layout-Toggles oben rechts (Labels wechseln mit dem Zustand).
    // Der Sidebar-Toggle trägt »Sidebar …blenden«, der Panel-Toggle »Panel
    // …blenden« — auf die Layout-Gruppe eingegrenzt, damit der gleichnamige
    // Schließen-Button IM Panel nicht mitgezählt wird.
    sidebarToggle: layoutGroup.getByRole('button', { name: /Sidebar (aus|ein)blenden/ }),
    rightPanelToggle: layoutGroup.getByRole('button', { name: /^Panel (aus|ein)blenden/ }),
    // Segment-Umschalter Chat ⇄ Terminal im rechten Panel
    modeSwitch,
    chatModeTab: modeSwitch.getByRole('tab', { name: 'Chat' }),
    terminalModeTab: modeSwitch.getByRole('tab', { name: 'Terminal' }),
  };
}

async function openWorkspace(page: Page) {
  await page.goto('/workspace');
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
}

test.describe('Workspace-Shell', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('zeigt Activity Bar, Tab-Leiste, Statusleiste und Dashboard-Default-Tab', async ({
    page,
  }) => {
    await openWorkspace(page);
    const s = shell(page);

    await expect(s.activityBar).toBeVisible();
    await expect(s.tabList).toBeVisible();
    await expect(s.statusBar).toBeVisible();

    // Erster Start: Dashboard öffnet sich als Default-Tab
    await expect(s.tabList.getByRole('tab', { name: /Dashboard/ })).toBeVisible();
  });

  test('genau zwei Layout-Toggles schalten Sidebar und rechtes Panel', async ({ page }) => {
    await openWorkspace(page);
    const s = shell(page);
    const layoutGroup = page.getByRole('group', { name: 'Layout' });

    // Die Layout-Gruppe enthält GENAU zwei Toggles — keine getrennten
    // Chat-/Terminal-Buttons mehr (die leben jetzt im Segment-Kopf des Panels).
    await expect(layoutGroup.getByRole('button')).toHaveCount(2);

    // Ausgangszustand (frischer Context): Sidebar + rechtes Panel sichtbar
    await expect(s.explorerPanel).toBeVisible();
    await expect(s.rightPanel).toBeVisible();
    await expect(s.sidebarToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(s.rightPanelToggle).toHaveAttribute('aria-pressed', 'true');

    // Sidebar ausblenden — rechtes Panel bleibt sichtbar
    await s.sidebarToggle.click();
    await expect(s.explorerPanel).toBeHidden();
    await expect(s.rightPanel).toBeVisible();
    await expect(s.sidebarToggle).toHaveAttribute('aria-pressed', 'false');

    // Rechtes Panel ausblenden — Sidebar bleibt aus
    await s.rightPanelToggle.click();
    await expect(s.rightPanel).toBeHidden();
    await expect(s.explorerPanel).toBeHidden();
    await expect(s.rightPanelToggle).toHaveAttribute('aria-pressed', 'false');

    // Beide wieder einblenden
    await s.sidebarToggle.click();
    await s.rightPanelToggle.click();
    await expect(s.explorerPanel).toBeVisible();
    await expect(s.rightPanel).toBeVisible();
  });

  test('Segment-Umschalter wechselt Chat ⇄ Terminal, Session bleibt gemountet', async ({
    page,
  }) => {
    await openWorkspace(page);
    const s = shell(page);

    // Default: Chat-Modus aktiv, Terminal versteckt (aber gemountet)
    await expect(s.chatPanel).toBeVisible();
    await expect(s.terminalPanel).toBeHidden();
    await expect(s.chatModeTab).toHaveAttribute('aria-selected', 'true');
    await expect(s.terminalModeTab).toHaveAttribute('aria-selected', 'false');

    // Auf Terminal umschalten — Chat verschwindet nur optisch
    await s.terminalModeTab.click();
    await expect(s.terminalPanel).toBeVisible();
    await expect(s.chatPanel).toBeHidden();
    await expect(s.terminalModeTab).toHaveAttribute('aria-selected', 'true');
    await expect(s.chatModeTab).toHaveAttribute('aria-selected', 'false');

    // Keep-alive: BEIDE Flächen bleiben im DOM verankert (nie unmounten →
    // Chat-Stream/Terminal-WebSocket überleben den Moduswechsel).
    await expect(s.chatPanel).toHaveCount(1);
    await expect(s.terminalPanel).toHaveCount(1);

    // Zurück zu Chat — dieselbe (nie zerstörte) Fläche ist wieder sichtbar
    await s.chatModeTab.click();
    await expect(s.chatPanel).toBeVisible();
    await expect(s.terminalPanel).toBeHidden();
    await expect(s.terminalPanel).toHaveCount(1);
  });

  test('Activity Bar hat keine Explorer-/Chats-/Terminal-Buttons', async ({ page }) => {
    await openWorkspace(page);
    const s = shell(page);

    // 3.1: Die Activity Bar ist rein für Mitte-Tabs (Dashboard/Extensions/Apps).
    // Panel-Sichtbarkeit und -Modus steuern die Layout-Toggles bzw. der
    // Segment-Kopf — daher keine dieser Buttons mehr in der Leiste.
    await expect(s.activityBar.getByRole('button', { name: /^Explorer/ })).toHaveCount(0);
    await expect(s.activityBar.getByRole('button', { name: /^Chats?/ })).toHaveCount(0);
    await expect(
      s.activityBar.getByRole('button', { name: /Terminal (aus|ein)blenden/ })
    ).toHaveCount(0);

    // Dashboard und Extensions bleiben als Mitte-Tab-Shortcuts erhalten
    await expect(s.activityBar.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(s.activityBar.getByRole('button', { name: 'Extensions' })).toBeVisible();
  });

  test('Kontext-Sidebar bildet den aktiven Tab ab (Dashboard → Explorer, Extensions → Liste, App-Tab → zu)', async ({
    page,
  }) => {
    // Telegram-App aktivieren, damit der App-Tab-Shortcut in der Activity Bar
    // erscheint (deterministisch statt geräteabhängig).
    await page.route('**/api/workspace-apps', route =>
      route.fulfill({
        json: {
          apps: [
            {
              id: 'telegram',
              name: 'Telegram',
              description: 'Telegram-Bot',
              tab: 'telegram',
              enabled: true,
            },
          ],
        },
      })
    );

    await openWorkspace(page);
    const s = shell(page);

    // Dashboard-Tab (Default): linke Fläche = Explorer
    await expect(s.explorerPanel).toBeVisible();
    await expect(s.extensionsSidebar).toHaveCount(0);

    // Extensions-Tab: linke Fläche wechselt auf die Extensions-Liste
    await s.activityBar.getByRole('button', { name: 'Extensions' }).click();
    await expect(s.extensionsSidebar).toBeVisible();
    await expect(s.explorerPanel).toHaveCount(0);

    // App-Tab (Telegram): Sidebar klappt automatisch zu
    await s.activityBar.getByRole('button', { name: 'Telegram' }).click();
    await expect(page).toHaveURL(/\/workspace\/telegram/);
    await expect(s.explorerPanel).toBeHidden();
    await expect(s.extensionsSidebar).toHaveCount(0);
    await expect(s.sidebarToggle).toHaveAttribute('aria-pressed', 'false');

    // Zurück auf Dashboard: die zuvor gemerkte Sidebar-Präferenz wird
    // wiederhergestellt (Explorer wieder sichtbar)
    await s.activityBar.getByRole('button', { name: 'Dashboard' }).click();
    await expect(s.explorerPanel).toBeVisible();
    await expect(s.sidebarToggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('offener Dialog lässt Sidebar und rechtes Panel sichtbar (Bug b)', async ({ page }) => {
    await openWorkspace(page);
    const s = shell(page);

    await expect(s.explorerPanel).toBeVisible();
    await expect(s.rightPanel).toBeVisible();

    // »Neuer Ordner…« über das Datei-Menü öffnen → Radix-Dialog. Radix ruft
    // beim Öffnen hideOthers() auf und kippt aria-hidden auf Nachbar-Elemente;
    // seit dem Fix (data-shell-hidden statt aria-hidden als CSS-Anker) dürfen
    // Sidebar und rechtes Panel dabei NICHT mehr kollabieren.
    await page.getByRole('button', { name: 'Datei-Menü' }).click();
    await page.getByRole('menuitem', { name: /Neuer Ordner/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Kern des Regressions-Tests: beide Panels bleiben sichtbar
    await expect(s.explorerPanel).toBeVisible();
    await expect(s.rightPanel).toBeVisible();

    // Dialog schließen — Panels weiterhin sichtbar
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(s.explorerPanel).toBeVisible();
    await expect(s.rightPanel).toBeVisible();
  });

  test('Terminal erscheint nie als Mitte-Tab', async ({ page }) => {
    await openWorkspace(page);
    const s = shell(page);

    const tabCountBefore = await s.tabList.getByRole('tab').count();

    // Terminal wird über den Segment-Kopf des rechten Panels erreicht,
    // nicht als Mitte-Tab.
    await s.terminalModeTab.click();
    await expect(s.terminalPanel).toBeVisible();
    await expect(s.tabList.getByRole('tab')).toHaveCount(tabCountBefore);
    await expect(s.tabList.getByRole('tab', { name: /Terminal/i })).toHaveCount(0);

    // Der Legacy-Deep-Link /workspace/terminal (v2-Bookmark) erzeugt keinen
    // Mitte-Tab, sondern blendet das Terminal-Panel ein und normalisiert
    // die URL auf den aktiven Tab.
    await page.goto('/workspace/terminal');
    await expect(s.root).toBeVisible({ timeout: 10000 });
    await expect(s.tabList.getByRole('tab', { name: /Terminal/i })).toHaveCount(0);
    await expect(s.terminalPanel).toBeVisible();
    await expect(page).not.toHaveURL(/\/workspace\/terminal/);
  });

  test('Tabs öffnen, schließen und nach Reload wiederherstellen', async ({ page }) => {
    await openWorkspace(page);
    const s = shell(page);

    // Extensions-Tab über die Activity Bar öffnen
    await s.activityBar.getByRole('button', { name: 'Extensions' }).click();
    const extensionsTab = s.tabList.getByRole('tab', { name: /Extensions/ });
    await expect(extensionsTab).toBeVisible();
    await expect(extensionsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/workspace\/store/);

    // Reload: beide Tabs kommen wieder, Extensions bleibt aktiv
    await page.reload();
    await expect(s.root).toBeVisible({ timeout: 10000 });
    await expect(s.tabList.getByRole('tab', { name: /Dashboard/ })).toBeVisible();
    await expect(s.tabList.getByRole('tab', { name: /Extensions/ })).toBeVisible();
    await expect(s.tabList.getByRole('tab', { name: /Extensions/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    // Schließen: ×-Button am Tab, Nachbar (Dashboard) wird aktiv
    await s.tabList.getByRole('button', { name: 'Tab Extensions schließen' }).click();
    await expect(s.tabList.getByRole('tab', { name: /Extensions/ })).toHaveCount(0);
    await expect(s.tabList.getByRole('tab', { name: /Dashboard/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('CSRF-Retry: 403 CSRF_INVALID auf eine Mutation wird transparent wiederholt', async ({
    page,
  }) => {
    // Zustandsbehafteter Mock: die erste PUT-Mutation 403t mit CSRF_INVALID,
    // useApi holt daraufhin einen frischen Token von /auth/csrf und wiederholt
    // die Mutation GENAU EINMAL — die zweite PUT gelingt. Der sichtbare Beweis:
    // der Toggle greift trotzdem (n8n verschwindet aus der Activity Bar), ohne
    // dass der Test neu lädt.
    let n8nEnabled = true;
    let putAttempts = 0;
    let csrfFetched = false;

    const appsResponse = () => ({
      apps: [
        {
          id: 'n8n',
          name: 'n8n',
          description: 'Workflow-Automatisierung',
          tab: 'automationen',
          enabled: n8nEnabled,
        },
        {
          id: 'telegram',
          name: 'Telegram',
          description: 'Telegram-Bot',
          tab: 'telegram',
          enabled: true,
        },
      ],
    });

    await page.route('**/api/workspace-apps', route => route.fulfill({ json: appsResponse() }));
    await page.route('**/api/auth/csrf', route => {
      csrfFetched = true;
      return route.fulfill({ json: { csrfToken: 'fresh-csrf-token-e2e' } });
    });
    await page.route('**/api/workspace-apps/n8n', route => {
      putAttempts += 1;
      if (putAttempts === 1) {
        // Erste Anfrage: Token abgelaufen → 403 mit dem distinkten Code, auf den
        // useApi den Refresh-und-Retry-Pfad triggert.
        return route.fulfill({
          status: 403,
          json: { error: { code: 'CSRF_INVALID', message: 'CSRF token missing' } },
        });
      }
      n8nEnabled = route.request().postDataJSON()?.enabled ?? false;
      return route.fulfill({ json: { app: { id: 'n8n', enabled: n8nEnabled } } });
    });

    await openWorkspace(page);
    const s = shell(page);
    await expect(s.activityBar.getByRole('button', { name: 'Automationen' })).toBeVisible();

    // Extensions-Tab öffnen und n8n abschalten
    await s.activityBar.getByRole('button', { name: 'Extensions' }).click();
    await page.getByRole('switch', { name: 'n8n deaktivieren' }).click();

    // Trotz des ersten 403 greift die Mutation: Automationen verschwindet.
    await expect(s.activityBar.getByRole('button', { name: 'Automationen' })).toHaveCount(0);

    // Der Retry-Pfad ist tatsächlich gelaufen: genau zwei PUT-Versuche und ein
    // frisch geholter CSRF-Token dazwischen.
    expect(putAttempts).toBe(2);
    expect(csrfFetched).toBe(true);
  });

  test('Extension-Gating: deaktivierte App verschwindet aus der Activity Bar', async ({ page }) => {
    const appsResponse = (n8nEnabled: boolean) => ({
      apps: [
        {
          id: 'n8n',
          name: 'n8n',
          description: 'Workflow-Automatisierung',
          tab: 'automationen',
          enabled: n8nEnabled,
        },
        {
          id: 'telegram',
          name: 'Telegram',
          description: 'Telegram-Bot',
          tab: 'telegram',
          enabled: true,
        },
        {
          id: 'database',
          name: 'Datenbank',
          description: 'Datentabellen',
          tab: 'database',
          enabled: true,
        },
      ],
    });

    // Phase 1: alle Apps aktiviert → alle dynamischen Einträge sichtbar
    await page.route('**/api/workspace-apps', route => route.fulfill({ json: appsResponse(true) }));
    await openWorkspace(page);
    const s = shell(page);

    await expect(s.activityBar.getByRole('button', { name: 'Automationen' })).toBeVisible();
    await expect(s.activityBar.getByRole('button', { name: 'Telegram' })).toBeVisible();
    await expect(s.activityBar.getByRole('button', { name: 'Datenbank' })).toBeVisible();

    // Phase 2: n8n deaktiviert → Automationen-Eintrag verschwindet,
    // die übrigen Apps bleiben sichtbar
    await page.unroute('**/api/workspace-apps');
    await page.route('**/api/workspace-apps', route =>
      route.fulfill({ json: appsResponse(false) })
    );
    await page.reload();
    await expect(s.root).toBeVisible({ timeout: 10000 });

    await expect(s.activityBar.getByRole('button', { name: 'Telegram' })).toBeVisible();
    await expect(s.activityBar.getByRole('button', { name: 'Automationen' })).toHaveCount(0);
    await expect(s.activityBar.getByRole('button', { name: 'Datenbank' })).toBeVisible();
  });

  test('Extension-Gating wirkt live: Toggle im Extensions-Tab, KEIN Reload', async ({ page }) => {
    // Zustandsbehafteter Mock: PUT ändert den Stand, der Refetch nach
    // invalidateQueries liefert ihn zurück — der Test lädt NIE neu.
    let n8nEnabled = true;
    const appsResponse = () => ({
      apps: [
        {
          id: 'n8n',
          name: 'n8n',
          description: 'Workflow-Automatisierung',
          tab: 'automationen',
          enabled: n8nEnabled,
        },
        {
          id: 'telegram',
          name: 'Telegram',
          description: 'Telegram-Bot',
          tab: 'telegram',
          enabled: true,
        },
        {
          id: 'database',
          name: 'Datenbank',
          description: 'Datentabellen',
          tab: 'database',
          enabled: true,
        },
      ],
    });
    await page.route('**/api/workspace-apps', route => route.fulfill({ json: appsResponse() }));
    await page.route('**/api/workspace-apps/n8n', route => {
      n8nEnabled = route.request().postDataJSON()?.enabled ?? false;
      return route.fulfill({ json: { app: { id: 'n8n', enabled: n8nEnabled } } });
    });

    await openWorkspace(page);
    const s = shell(page);
    await expect(s.activityBar.getByRole('button', { name: 'Automationen' })).toBeVisible();

    // Extensions-Tab öffnen und n8n dort abschalten
    await s.activityBar.getByRole('button', { name: 'Extensions' }).click();
    await page.getByRole('switch', { name: 'n8n deaktivieren' }).click();

    // Ohne Reload: Eintrag verschwindet über den gemeinsamen Query-Cache,
    // die übrigen Apps bleiben sichtbar
    await expect(s.activityBar.getByRole('button', { name: 'Automationen' })).toHaveCount(0);
    await expect(s.activityBar.getByRole('button', { name: 'Telegram' })).toBeVisible();

    // Wieder aktivieren — ebenfalls ohne Reload
    await page.getByRole('switch', { name: 'n8n aktivieren' }).click();
    await expect(s.activityBar.getByRole('button', { name: 'Automationen' })).toBeVisible();
  });

  test('Automationen-Tab (Plan 007): holt die n8n-Session vor dem iframe, keine Login-Maske', async ({
    page,
  }) => {
    // Der Tab ruft beim Öffnen GET /api/automations/session auf; das Backend
    // stellt die n8n-Session her (Set-Cookie n8n-auth) und der iframe lädt
    // dann bereits angemeldet. Hermetisch nachgestellt: die Session-Route
    // liefert 200 (Cookie im echten Deploy), /n8n/ wird auf einen Stub
    // geroutet, damit der Test nicht von einer echten n8n-Instanz abhängt.
    let sessionCalls = 0;
    await page.route('**/api/workspace-apps', route =>
      route.fulfill({
        json: {
          apps: [
            {
              id: 'n8n',
              name: 'n8n',
              description: 'Workflow-Automatisierung',
              tab: 'automationen',
              enabled: true,
            },
          ],
        },
      })
    );
    await page.route('**/api/automations/session', route => {
      sessionCalls += 1;
      return route.fulfill({
        // n8n-auth-Cookie würde im echten Deploy hier durchgereicht; für den
        // Tab-Zustand genügt der 200-Erfolg.
        json: { data: { authenticated: true }, timestamp: new Date().toISOString() },
      });
    });
    await page.route('**/n8n/**', route =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>n8n editor stub</title>' })
    );

    await openWorkspace(page);
    const s = shell(page);

    // Automationen-Tab öffnen
    await s.activityBar.getByRole('button', { name: 'Automationen' }).click();

    // Die Session wird VOR dem iframe geholt …
    await expect.poll(() => sessionCalls).toBeGreaterThan(0);

    // … und danach lädt der iframe direkt (Ladeplatzhalter verschwindet,
    // keine Fehlermeldung, keine n8n-Login-Maske).
    const frame = page.getByTestId('n8n-frame');
    await expect(frame).toBeVisible({ timeout: 10000 });
    await expect(frame).toHaveAttribute('src', '/n8n/');
    await expect(page.getByText('Automationen nicht verfügbar')).toHaveCount(0);
  });
});
