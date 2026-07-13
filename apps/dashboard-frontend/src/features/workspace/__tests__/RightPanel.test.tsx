/**
 * Tests: RightPanel-Segment-Umschalter (Plan 003 · Schritt 4).
 *
 * Das rechte Panel ist EINE Fläche mit zwei Modi (Chat/Terminal), umgeschaltet
 * über einen Segment-Kopf. Kernzusage: BEIDE Flächen bleiben beim Umschalten
 * permanent gemountet (Keep-alive) — nur die inaktive wird per
 * data-shell-hidden versteckt. Sonst stürben Chat-Streams und Terminal-Sessions
 * bei jedem Moduswechsel.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { RightPanel } from '../RightPanel';

const { chatLog, terminalLog } = vi.hoisted(() => ({
  chatLog: { mounts: 0, unmounts: 0 },
  terminalLog: { mounts: 0, unmounts: 0 },
}));

vi.mock('../llm/ChatPanel', async () => {
  const React = await import('react');
  function MockChatPanel() {
    React.useEffect(() => {
      chatLog.mounts++;
      return () => {
        chatLog.unmounts++;
      };
    }, []);
    return React.createElement('div', { 'data-testid': 'mock-chat-panel' });
  }
  return { ChatPanel: MockChatPanel };
});

vi.mock('../terminal/TerminalPanel', async () => {
  const React = await import('react');
  function MockTerminalPanel() {
    React.useEffect(() => {
      terminalLog.mounts++;
      return () => {
        terminalLog.unmounts++;
      };
    }, []);
    return React.createElement('div', { 'data-testid': 'mock-terminal-panel' });
  }
  return { TerminalPanel: MockTerminalPanel };
});

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    sidebarVisible: true,
    rightPanelVisible: true,
    rightPanelMode: 'chat',
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
}

function chatSurface() {
  return document.querySelector<HTMLElement>('[data-shell-surface="chat"]');
}
function terminalSurface() {
  return document.querySelector<HTMLElement>('[data-shell-surface="terminal"]');
}

describe('RightPanel — Segment-Umschalter', () => {
  beforeEach(() => {
    resetStore();
    chatLog.mounts = 0;
    chatLog.unmounts = 0;
    terminalLog.mounts = 0;
    terminalLog.unmounts = 0;
  });

  it('mountet beide Flächen sofort; im Chat-Modus ist nur die Chat-Fläche sichtbar', () => {
    render(<RightPanel />);

    // Beide Flächen sind gemountet (Keep-alive), egal welcher Modus aktiv ist.
    expect(screen.getByTestId('mock-chat-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-terminal-panel')).toBeInTheDocument();
    expect(chatLog.mounts).toBe(1);
    expect(terminalLog.mounts).toBe(1);

    // Chat sichtbar, Terminal versteckt (data-shell-hidden).
    expect(chatSurface()).toHaveAttribute('data-shell-hidden', 'false');
    expect(terminalSurface()).toHaveAttribute('data-shell-hidden', 'true');

    // Segment-Tabs spiegeln den Modus.
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Terminal' })).toHaveAttribute('aria-selected', 'false');
  });

  it('Umschalten auf Terminal versteckt Chat, hält aber beide Flächen gemountet', () => {
    render(<RightPanel />);
    const chatNode = screen.getByTestId('mock-chat-panel');
    const terminalNode = screen.getByTestId('mock-terminal-panel');

    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }));

    // Store-Modus gewechselt, Panel bleibt sichtbar.
    expect(useWorkspaceStore.getState().rightPanelMode).toBe('terminal');
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(true);

    // Sichtbarkeit dreht sich um — ohne Remount/Unmount einer der Flächen.
    expect(chatSurface()).toHaveAttribute('data-shell-hidden', 'true');
    expect(terminalSurface()).toHaveAttribute('data-shell-hidden', 'false');
    expect(screen.getByTestId('mock-chat-panel')).toBe(chatNode);
    expect(screen.getByTestId('mock-terminal-panel')).toBe(terminalNode);
    expect(chatLog.unmounts).toBe(0);
    expect(terminalLog.unmounts).toBe(0);

    // Zurück auf Chat — weiterhin kein Unmount, kein zweiter Mount.
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(chatSurface()).toHaveAttribute('data-shell-hidden', 'false');
    expect(terminalSurface()).toHaveAttribute('data-shell-hidden', 'true');
    expect(chatLog.mounts).toBe(1);
    expect(terminalLog.mounts).toBe(1);
    expect(chatLog.unmounts).toBe(0);
    expect(terminalLog.unmounts).toBe(0);
  });

  it('der Schließen-Button blendet das ganze Panel aus (Modus bleibt erhalten)', () => {
    useWorkspaceStore.setState({ rightPanelMode: 'terminal' });
    render(<RightPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Panel ausblenden' }));

    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(false);
    // Modus unverändert — beim Wieder-Einblenden erscheint dieselbe Fläche.
    expect(useWorkspaceStore.getState().rightPanelMode).toBe('terminal');
    // Flächen bleiben gemountet (das RightPanel selbst wird von der Shell
    // versteckt, nicht unmounted).
    expect(chatLog.unmounts).toBe(0);
    expect(terminalLog.unmounts).toBe(0);
  });
});
