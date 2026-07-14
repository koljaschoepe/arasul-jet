/**
 * SandboxTerminal - xterm.js based terminal component
 *
 * Renders a full interactive terminal connected to a sandbox container
 * via WebSocket. Includes connection status, reconnect, fullscreen,
 * and Quick-Launch buttons for common tools.
 *
 * Container-aware: Shows appropriate status messages based on containerStatus
 * and only attempts connection when container is running.
 */

import { useCallback, useEffect } from 'react';
import {
  RefreshCw,
  Maximize2,
  Minimize2,
  Circle,
  Loader2,
  AlertCircle,
  Sparkles,
  Terminal,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/shadcn/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTerminal } from './useTerminal';
import type { SandboxNetworkMode } from './types';
import '@xterm/xterm/css/xterm.css';

interface QuickLaunchItem {
  label: string;
  command: string;
  description: string;
}

// /claude, /codex, /gemini sind Bash-Funktionen aus /etc/profile.d/arasul-slash.sh
// im Sandbox-Image; Erststart installiert die jeweilige CLI (Wrapper-Skripte).
const QUICK_LAUNCH_ITEMS: QuickLaunchItem[] = [
  { label: 'Claude Code', command: '/claude\n', description: 'Claude Code CLI starten' },
  { label: 'Codex', command: '/codex\n', description: 'OpenAI Codex CLI starten' },
  { label: 'Gemini', command: '/gemini\n', description: 'Google Gemini CLI starten' },
  {
    label: 'Open-ARA (lokaler Agent)',
    command: 'open-ara\n',
    description: 'Lokaler KI-Coding-Agent (Ollama)',
  },
  { label: 'Python', command: 'python3\n', description: 'Python REPL starten' },
  { label: 'Node.js', command: 'node\n', description: 'Node.js REPL starten' },
  { label: 'htop', command: 'htop\n', description: 'Prozess-Monitor' },
];

/** Modus-Badge im Terminal-Header: Isoliert=neutral, Intern=ok, Infrastruktur=rot */
const NETWORK_MODE_BADGES: Record<
  SandboxNetworkMode,
  { label: string; className: string; title: string }
> = {
  isolated: {
    label: 'Isoliert',
    className: 'bg-muted text-muted-foreground border-border',
    title: 'Nur Internet — kein Zugriff auf interne Services (DSGVO-Testumgebung)',
  },
  internal: {
    label: 'Intern',
    className: 'bg-primary/10 text-primary border-primary/30',
    title: 'Backend-Netz: Zugriff auf KI-Services + Datenbank',
  },
  infrastructure: {
    label: 'Infrastruktur',
    className: 'bg-destructive/10 text-destructive border-destructive/40',
    title: 'Voller Zugriff: Plattform-Repo (beschreibbar) + Docker — nur Admin',
  },
};

interface SandboxTerminalProps {
  projectId: string;
  /**
   * tmux-Session-Name im Container — distinkt pro Session, damit mehrere
   * Terminals desselben Projekts unabhängige Shells sind (nicht Spiegel).
   * Weglassen → Backend-Default 'main' (Erst-Session, rückwärtskompatibel).
   */
  terminalName?: string;
  containerStatus?: string;
  networkMode?: SandboxNetworkMode;
  /**
   * Sichtbarkeit des Terminals (Keep-alive: versteckt = display:none, nicht
   * unmounted). Beim Übergang zu sichtbar wird xterm neu gefittet — fit()
   * auf einem versteckten Container misst 0×0 und schlägt fehl, deshalb
   * erst NACH dem Einblenden (double-rAF, Layout steht dann).
   */
  isVisible?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
}

/**
 * Derive the status indicator for the toolbar based on container + connection state.
 */
function getStatusDisplay(
  containerStatus: string | undefined,
  isConnecting: boolean,
  isConnected: boolean,
  error: string | null
) {
  // Container not ready yet — show container-level status
  if (containerStatus && containerStatus !== 'running') {
    switch (containerStatus) {
      case 'creating':
        return {
          icon: <Loader2 className="size-3 text-primary animate-spin" />,
          text: 'Container wird erstellt...',
          showReconnect: false,
        };
      case 'none':
      case 'stopped':
        return {
          icon: <Loader2 className="size-3 text-primary animate-spin" />,
          text: 'Container wird gestartet...',
          showReconnect: false,
        };
      case 'committing':
        return {
          icon: <Loader2 className="size-3 text-primary animate-spin" />,
          text: 'Container wird gespeichert...',
          showReconnect: false,
        };
      case 'error':
        return {
          icon: <AlertCircle className="size-3 text-destructive" />,
          text: 'Container-Fehler',
          showReconnect: true,
        };
    }
  }

  // Container is running — show connection-level status
  if (isConnecting) {
    return {
      icon: <Loader2 className="size-3 text-primary animate-spin" />,
      text: 'Verbinde...',
      showReconnect: false,
    };
  }
  if (isConnected) {
    return {
      icon: <Circle className="size-3 fill-primary text-primary" />,
      text: 'Verbunden',
      showReconnect: true,
    };
  }

  // Disconnected with or without error
  return {
    icon: <Circle className="size-3 fill-muted-foreground text-muted-foreground" />,
    text: error ? '' : 'Getrennt',
    showReconnect: true,
  };
}

export default function SandboxTerminal({
  projectId,
  terminalName,
  containerStatus,
  networkMode,
  isVisible = true,
  isFullscreen = false,
  onToggleFullscreen,
  className,
}: SandboxTerminalProps) {
  const { terminalRef, isConnected, isConnecting, error, reconnect, fit, sendInput } = useTerminal({
    projectId,
    terminalName,
    containerStatus,
    fontSize: isFullscreen ? 15 : 14,
  });

  // Refit beim Wieder-Einblenden (Panel-Toggle / Session-Wechsel): double-rAF,
  // damit display:none → flex bereits gelayoutet ist, bevor fit() misst.
  useEffect(() => {
    if (!isVisible) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => fit());
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [isVisible, fit]);

  const handleFullscreenToggle = useCallback(() => {
    onToggleFullscreen?.();
    requestAnimationFrame(() => {
      requestAnimationFrame(fit);
    });
  }, [onToggleFullscreen, fit]);

  const status = getStatusDisplay(containerStatus, isConnecting, isConnected, error);
  const modeBadge = networkMode ? NETWORK_MODE_BADGES[networkMode] : null;

  return (
    <div className={cn('flex flex-col h-full p-3', className)}>
      {/* Terminal frame */}
      <div className="flex flex-col flex-1 min-h-0 rounded-lg border border-border overflow-hidden shadow-sm">
        {/* Terminal toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-background border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            {status.icon}
            <span className="text-xs text-muted-foreground font-mono">{status.text}</span>

            {/* Modus-Badge: Isoliert=neutral, Intern=ok, Infrastruktur=rot */}
            {modeBadge && (
              <span
                title={modeBadge.title}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium leading-none',
                  modeBadge.className
                )}
              >
                {networkMode === 'infrastructure' && <ShieldAlert className="size-3 shrink-0" />}
                {modeBadge.label}
              </span>
            )}

            {/* Quick Launch — Radix DropdownMenu for portal-based rendering */}
            {isConnected && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground h-6 px-2 text-xs gap-1 ml-2"
                  >
                    <Sparkles className="size-3" />
                    Quick Launch
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-50">
                  {QUICK_LAUNCH_ITEMS.map(item => (
                    <DropdownMenuItem
                      key={item.label}
                      onClick={() => sendInput(item.command)}
                      className="gap-3"
                    >
                      <Terminal className="size-3 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium">{item.label}</div>
                        <div className="text-[10px] text-muted-foreground">{item.description}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex items-center gap-1">
            {error && (
              <span className="text-xs text-destructive mr-2 flex items-center gap-1">
                <AlertCircle className="size-3" />
                {error}
              </span>
            )}
            {status.showReconnect && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={reconnect}
                title="Neu verbinden"
                className="text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="size-3.5" />
              </Button>
            )}
            {onToggleFullscreen && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleFullscreenToggle}
                title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
                className="text-muted-foreground hover:text-foreground"
              >
                {isFullscreen ? (
                  <Minimize2 className="size-3.5" />
                ) : (
                  <Maximize2 className="size-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Terminal container */}
        <div
          ref={terminalRef}
          className="flex-1 min-h-0 bg-background overflow-hidden"
          style={{ padding: '4px 0 0 4px' }}
        />
      </div>
    </div>
  );
}
