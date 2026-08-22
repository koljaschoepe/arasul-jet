/**
 * SandboxTerminal - xterm.js based terminal component
 *
 * Renders a full interactive terminal connected to a sandbox container
 * via WebSocket. Includes connection status, reconnect, and Quick-Launch
 * buttons for common tools.
 *
 * Container-aware: Shows appropriate status messages based on containerStatus
 * and only attempts connection when container is running.
 */

import { useEffect, useState } from 'react';
import {
  RefreshCw,
  Circle,
  Loader2,
  AlertCircle,
  Sparkles,
  Terminal,
  ShieldAlert,
  KeyRound,
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
import KiZugangDialog from './KiZugangDialog';
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
  // Lokal-first: der lokale Coder ist der empfohlene Standard — kein Login, kein
  // externer Account, voll DSGVO. Claude/Codex/Gemini sind opt-in-Beschleuniger.
  {
    label: 'Lokaler Coder (empfohlen)',
    command: 'open-ara\n',
    description: 'Lokaler KI-Coding-Agent (Ollama, kein Login nötig)',
  },
  { label: 'Claude Code', command: '/claude\n', description: 'Claude Code CLI (opt-in)' },
  { label: 'Codex', command: '/codex\n', description: 'OpenAI Codex CLI (opt-in)' },
  // „Codex anmelden" ist in den KI-Zugangs-Hub gewandert (Plan 017 Schritt 8) —
  // Anmeldungen gehören dorthin, nicht in den Werkzeug-Schnellstart.
  { label: 'Gemini', command: '/gemini\n', description: 'Google Gemini CLI (opt-in)' },
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
    title: 'Nur Internet, kein Zugriff auf interne Services (DSGVO-Testumgebung)',
  },
  internal: {
    label: 'Intern',
    className: 'bg-primary/10 text-primary border-primary/30',
    title: 'Backend-Netz: Zugriff auf KI-Services + Datenbank',
  },
  infrastructure: {
    label: 'Infrastruktur',
    className: 'bg-destructive/10 text-destructive border-destructive/40',
    title: 'Voller Zugriff: Plattform-Repo (beschreibbar) + Docker, nur Admin',
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
  className,
}: SandboxTerminalProps) {
  const { terminalRef, isConnected, isConnecting, error, reconnect, fit, sendInput } = useTerminal({
    projectId,
    terminalName,
    containerStatus,
    fontSize: 14,
  });

  // Dialog für den zentralen KI-Zugang (einmal hinterlegen → in jeder Sandbox).
  const [zugangOffen, setZugangOffen] = useState(false);

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

  const status = getStatusDisplay(containerStatus, isConnecting, isConnected, error);
  const modeBadge = networkMode ? NETWORK_MODE_BADGES[networkMode] : null;

  return (
    // Randlos: keine zweite gerahmte Box mehr über dem Terminal. EINE schlanke
    // Statusleiste, danach füllt das Terminal die ganze Fläche (Nutzerkritik:
    // „maximal nur das Terminal", zu viele Leisten/Rahmen).
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      {/* Schlanke Statusleiste, EINZEILIG bei jeder Breite (Plan 023 F1).
          Vorher stand hier `flex-wrap`, und genau das war der gemeldete Fehler:
          bei schmalem Panel rutschten „Quick Launch" und „KI-Zugang" in eine
          zweite Zeile, und das Terminal wurde bei jeder Größenänderung kürzer.

          Statt umzubrechen wird jetzt zusammengefasst. Die Breite, die zählt,
          ist die des PANELS und nicht die des Fensters (der Nutzer zieht das
          Panel schmal, während das Fenster breit bleibt), deshalb eine
          Container-Abfrage und keine Bildschirm-Abfrage. Ab 34 rem stehen die
          Knöpfe einzeln, darunter liegen sie in einem Menü. */}
      <div className="@container shrink-0 border-b border-border bg-background">
        <div className="flex items-center justify-between gap-x-2 px-2 py-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex shrink-0 items-center" title={status.text}>
              {status.icon}
            </span>
            {/* Unter 20 rem bleibt nur das Symbol. Bei 400 Pixeln Fenster ist
              das Panel gemessen 123 Pixel breit; dort passt kein Wort mehr
              neben Abzeichen, Werkzeug-Menue und Wiederholen-Symbol, und der
              Zustand steht ohnehin im `title`. */}
            <span
              className="hidden @[20rem]:inline text-ui-xs text-muted-foreground truncate"
              title={status.text}
            >
              {status.text}
            </span>

            {/* Modus-Badge: Isoliert=neutral, Intern=ok, Infrastruktur=rot */}
            {modeBadge && (
              <span
                title={modeBadge.title}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-ui-xs font-medium leading-none',
                  modeBadge.className
                )}
              >
                {networkMode === 'infrastructure' && <ShieldAlert className="size-3 shrink-0" />}
                {/* Unter 26 rem trägt der Modus nur noch sein Kürzel; der volle
                  Name steht im `title` und ist damit nicht verloren. */}
                <span className="hidden @[26rem]:inline">{modeBadge.label}</span>
                <span className="@[26rem]:hidden">{modeBadge.label.slice(0, 1)}</span>
              </span>
            )}

            {/* Ab 34 rem stehen die beiden Knoepfe einzeln da. */}
            {isConnected && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden @[34rem]:inline-flex text-muted-foreground hover:text-foreground h-6 px-2 text-ui-xs gap-1"
                    data-testid="terminal-quick-launch"
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
                        <div className="text-ui-sm font-medium">{item.label}</div>
                        <div className="text-ui-xs text-muted-foreground">{item.description}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Zentraler KI-Zugang — einmal hinterlegen, gilt in jeder Sandbox. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZugangOffen(true)}
              className="hidden @[34rem]:inline-flex h-6 gap-1 px-2 text-ui-xs text-muted-foreground hover:text-foreground"
              title="KI-Zugang (Claude) einmal hinterlegen, gilt in jeder Sandbox"
              data-testid="terminal-ki-zugang"
            >
              <KeyRound className="size-3" />
              KI-Zugang
            </Button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Darunter liegen dieselben zwei Punkte in EINEM Menue. Nichts
              verschwindet, es wird nur zusammengefasst. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="@[34rem]:hidden text-muted-foreground hover:text-foreground"
                  title="Werkzeuge"
                  aria-label="Werkzeuge"
                  data-testid="terminal-werkzeuge"
                >
                  <Sparkles className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-50">
                {isConnected &&
                  QUICK_LAUNCH_ITEMS.map(item => (
                    <DropdownMenuItem
                      key={item.label}
                      onClick={() => sendInput(item.command)}
                      className="gap-3"
                    >
                      <Terminal className="size-3 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-ui-sm font-medium">{item.label}</div>
                        <div className="text-ui-xs text-muted-foreground">{item.description}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuItem onClick={() => setZugangOffen(true)} className="gap-3">
                  <KeyRound className="size-3 text-primary shrink-0" />
                  <div className="text-ui-sm font-medium">KI-Zugang</div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {error && (
              <span
                className="text-ui-xs text-destructive mr-1 flex min-w-0 items-center gap-1"
                title={error}
              >
                <AlertCircle className="size-3 shrink-0" />
                {/* Eine lange Fehlermeldung ist der sicherste Weg zum Umbruch.
                  Schmal bleibt nur das Symbol, der Text steht im `title`. */}
                <span className="hidden @[30rem]:inline truncate">{error}</span>
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
          </div>
        </div>
      </div>

      {/* Terminal container — symmetrisches Padding, damit FitAddon die
          sichtbare Breite exakt trifft (asymmetrisch → rechte Spalte wird
          unter overflow-hidden abgeschnitten). */}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0 bg-background overflow-hidden"
        style={{ padding: '4px' }}
      />

      {zugangOffen && (
        <KiZugangDialog projectId={projectId} onClose={() => setZugangOffen(false)} />
      )}
    </div>
  );
}
