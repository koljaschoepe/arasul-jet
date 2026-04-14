/**
 * SandboxTerminal - xterm.js based terminal component
 *
 * Renders a full interactive terminal connected to a sandbox container
 * via WebSocket. Includes connection status, reconnect, fullscreen,
 * and Quick-Launch buttons for common tools.
 */

import { useCallback, useState } from 'react';
import {
  RefreshCw,
  Maximize2,
  Minimize2,
  Circle,
  Loader2,
  AlertCircle,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { useTerminal } from './useTerminal';
import '@xterm/xterm/css/xterm.css';

interface QuickLaunchItem {
  label: string;
  command: string;
  description: string;
  color: string;
}

const QUICK_LAUNCH_ITEMS: QuickLaunchItem[] = [
  {
    label: 'Claude Code',
    command: 'claude\n',
    description: 'Claude Code CLI starten',
    color: '#d97706',
  },
  {
    label: 'Codex',
    command: 'codex\n',
    description: 'OpenAI Codex CLI starten',
    color: '#22c55e',
  },
  {
    label: 'Python',
    command: 'python3\n',
    description: 'Python REPL starten',
    color: '#3b82f6',
  },
  {
    label: 'Node.js',
    command: 'node\n',
    description: 'Node.js REPL starten',
    color: '#16a34a',
  },
  {
    label: 'htop',
    command: 'htop\n',
    description: 'Prozess-Monitor',
    color: '#06b6d4',
  },
];

interface SandboxTerminalProps {
  projectId: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
}

export default function SandboxTerminal({
  projectId,
  isFullscreen = false,
  onToggleFullscreen,
  className,
}: SandboxTerminalProps) {
  const { terminalRef, isConnected, isConnecting, error, reconnect, fit, sendInput } = useTerminal({
    projectId,
    fontSize: isFullscreen ? 15 : 14,
  });

  const [showQuickLaunch, setShowQuickLaunch] = useState(false);

  const handleFullscreenToggle = useCallback(() => {
    onToggleFullscreen?.();
    requestAnimationFrame(() => {
      requestAnimationFrame(fit);
    });
  }, [onToggleFullscreen, fit]);

  const handleQuickLaunch = useCallback(
    (item: QuickLaunchItem) => {
      sendInput(item.command);
      setShowQuickLaunch(false);
    },
    [sendInput]
  );

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Terminal toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0a0a] border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          {isConnecting ? (
            <Loader2 className="size-3 text-yellow-500 animate-spin" />
          ) : isConnected ? (
            <Circle className="size-3 fill-emerald-500 text-emerald-500" />
          ) : (
            <Circle className="size-3 fill-red-500 text-red-500" />
          )}
          <span className="text-xs text-zinc-400 font-mono">
            {isConnecting ? 'Verbinde...' : isConnected ? 'Verbunden' : 'Getrennt'}
          </span>

          {/* Quick Launch */}
          {isConnected && (
            <div className="relative ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowQuickLaunch(!showQuickLaunch)}
                className="text-zinc-400 hover:text-zinc-200 h-6 px-2 text-xs gap-1"
              >
                <Sparkles className="size-3" />
                Quick Launch
                <ChevronDown
                  className={cn('size-3 transition-transform', showQuickLaunch && 'rotate-180')}
                />
              </Button>

              {showQuickLaunch && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowQuickLaunch(false)} />
                  <div className="absolute top-full left-0 mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[200px]">
                    {QUICK_LAUNCH_ITEMS.map(item => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => handleQuickLaunch(item)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs text-zinc-200 font-medium">{item.label}</div>
                          <div className="text-[10px] text-zinc-500">{item.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {error && (
            <span className="text-xs text-red-400 mr-2 flex items-center gap-1">
              <AlertCircle className="size-3" />
              {error}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={reconnect}
            title="Neu verbinden"
            className="text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          {onToggleFullscreen && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleFullscreenToggle}
              title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
              className="text-zinc-400 hover:text-zinc-200"
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
  );
}
