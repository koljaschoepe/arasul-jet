import { test, expect, type Page } from '@playwright/test';

/**
 * Workspace-Shell (Cursor-Raster) E2E Tests — Plan 002 »Cursor-Shell 3.0«.
 *
 * Deckt ab:
 *  - Panel-Toggles: Sidebar / Terminal-Panel / Chat-Panel schalten unabhängig
 *  - Terminal existiert NUR im rechten Panel, nie als Mitte-Tab
 *  - Mitte-Tabs: öffnen, schließen, Restore nach Reload
 *  - Extension-Gating: deaktivierte App verschwindet aus der Activity Bar
 *    (GET /api/workspace-apps wird dafür per page.route gemockt, damit der
 *    Test den Geräte-Zustand nicht verändert)
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

/** Kurzzugriffe auf die stabilen Anker der Shell. */
function shell(page: Page) {
  const layoutGroup = page.getByRole('group', { name: 'Layout' });
  return {
    root: page.getByTestId('workspace-shell'),
    activityBar: page.getByRole('navigation', { name: 'Workspace-Navigation' }),
    tabList: page.getByRole('tablist', { name: 'Offene Tabs' }),
    statusBar: page.getByTestId('workspace-statusbar'),
    explorerPanel: page.getByTestId('workspace-explorer-panel'),
    chatPanel: page.getByTestId('workspace-chat-panel'),
    terminalPanel: page.getByTestId('workspace-terminal-panel'),
    // Layout-Toggles oben rechts (Labels wechseln mit dem Zustand ein/aus)
    sidebarToggle: layoutGroup.getByRole('button', { name: /Sidebar (aus|ein)blenden/ }),
    terminalToggle: layoutGroup.getByRole('button', { name: /Terminal-Panel (aus|ein)blenden/ }),
    chatToggle: layoutGroup.getByRole('button', { name: /Chat-Panel (aus|ein)blenden/ }),
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

  test('Panel-Toggles schalten Sidebar, Terminal und Chat unabhängig', async ({ page }) => {
    await openWorkspace(page);
    const s = shell(page);

    // Ausgangszustand (frischer Context): Sidebar + Chat sichtbar, Terminal zu
    await expect(s.explorerPanel).toBeVisible();
    await expect(s.chatPanel).toBeVisible();
    await expect(s.terminalPanel).toBeHidden();

    // Terminal einblenden — Sidebar und Chat bleiben unverändert
    await s.terminalToggle.click();
    await expect(s.terminalPanel).toBeVisible();
    await expect(s.chatPanel).toBeVisible();
    await expect(s.explorerPanel).toBeVisible();

    // Chat ausblenden — Terminal bleibt sichtbar
    await s.chatToggle.click();
    await expect(s.chatPanel).toBeHidden();
    await expect(s.terminalPanel).toBeVisible();

    // Sidebar ausblenden — rechtes Panel unverändert
    await s.sidebarToggle.click();
    await expect(s.explorerPanel).toBeHidden();
    await expect(s.terminalPanel).toBeVisible();
    await expect(s.chatPanel).toBeHidden();

    // aria-pressed spiegelt den Zustand
    await expect(s.sidebarToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(s.terminalToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(s.chatToggle).toHaveAttribute('aria-pressed', 'false');

    // Alles wieder einblenden
    await s.sidebarToggle.click();
    await s.chatToggle.click();
    await expect(s.explorerPanel).toBeVisible();
    await expect(s.chatPanel).toBeVisible();
  });

  test('Terminal erscheint nie als Mitte-Tab', async ({ page }) => {
    await openWorkspace(page);
    const s = shell(page);

    const tabCountBefore = await s.tabList.getByRole('tab').count();

    // Terminal-Toggle in der Activity Bar (unten) = Panel-Toggle, kein Tab
    await s.activityBar
      .getByRole('button', { name: /Terminal (aus|ein)blenden/ })
      .click();
    await expect(s.terminalPanel).toBeVisible();

    await expect(s.tabList.getByRole('tab')).toHaveCount(tabCountBefore);
    await expect(s.tabList.getByRole('tab', { name: /Terminal/i })).toHaveCount(0);

    // Der Legacy-Deep-Link /workspace/terminal (v2-Bookmark) erzeugt keinen
    // Mitte-Tab, sondern blendet das Terminal-Panel ein und normalisiert
    // die URL auf den aktiven Tab
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

  test('Extension-Gating: deaktivierte App verschwindet aus der Activity Bar', async ({
    page,
  }) => {
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
    await page.route('**/api/workspace-apps', route =>
      route.fulfill({ json: appsResponse(true) })
    );
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
});
