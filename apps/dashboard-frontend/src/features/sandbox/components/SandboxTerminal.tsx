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

import { useCallback } from 'react';
import {
  RefreshCw,
  Maximize2,
  Minimize2,
  Circle,
  Loader2,
  AlertCircle,
  Sparkles,
  Terminal,
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
import '@xterm/xterm/css/xterm.css';

interface QuickLaunchItem {
  label: string;
  command: string;
  description: string;
}

const QUICK_LAUNCH_ITEMS: QuickLaunchItem[] = [
  { label: 'Claude Code', command: 'claude\n', description: 'Claude Code CLI starten' },
  { label: 'Codex', command: 'codex\n', description: 'OpenAI Codex CLI starten' },
  { label: 'Python', command: 'python3\n', description: 'Python REPL starten' },
  { label: 'Node.js', command: 'node\n', description: 'Node.js REPL starten' },
  { label: 'htop', command: 'htop\n', description: 'Prozess-Monitor' },
];

interface SandboxTerminalProps {
  projectId: string;
  containerStatus?: string;
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
  containerStatus,
  isFullscreen = false,
  onToggleFullscreen,
  className,
}: SandboxTerminalProps) {
  const { terminalRef, isConnected, isConnecting, error, reconnect, fit, sendInput } = useTerminal({
    projectId,
    containerStatus,
    fontSize: isFullscreen ? 15 : 14,
  });

  const handleFullscreenToggle = useCallback(() => {
    onToggleFullscreen?.();
    requestAnimationFrame(() => {
      requestAnimationFrame(fit);
    });
  }, [onToggleFullscreen, fit]);

  const status = getStatusDisplay(containerStatus, isConnecting, isConnected, error);

  return (
    <div className={cn('flex flex-col h-full p-3', className)}>
      {/* Terminal frame */}
      <div className="flex flex-col flex-1 min-h-0 rounded-lg border border-border overflow-hidden shadow-sm">
        {/* Terminal toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0a0a] border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            {status.icon}
            <span className="text-xs text-muted-foreground font-mono">{status.text}</span>

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
                <DropdownMenuContent align="start" className="min-w-[200px]">
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
          className="flex-1 min-h-0 bg-[#0a0a0a] overflow-hidden"
          style={{ padding: '4px 0 0 4px' }}
        />
      </div>
    </div>
  );
}
