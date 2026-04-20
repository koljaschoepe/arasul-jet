import { RefreshCw, FileText } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import type { AuditLog } from './types';

interface LogsSectionProps {
  logs: AuditLog[];
  loading: boolean;
  onRefresh: () => void;
}

export default function LogsSection({ logs, loading, onRefresh }: LogsSectionProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h3 className="m-0 text-foreground text-lg">Aktivitäts-Log</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={loading}
          title="Aktualisieren"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 p-12 text-muted-foreground text-sm">
          <RefreshCw size={16} className="animate-spin" /> Lade Logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-card border border-dashed border-border rounded-xl">
          <FileText size={24} />
          <p>Noch keine Aktivitäten</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full border-collapse max-[480px]:text-xs">
            <thead>
              <tr>
                <th className="py-3 px-4 bg-card text-muted-foreground text-xs font-semibold uppercase tracking-wider text-left border-b border-border">
                  Zeitpunkt
                </th>
                <th className="py-3 px-4 bg-card text-muted-foreground text-xs font-semibold uppercase tracking-wider text-left border-b border-border">
                  Benutzer
                </th>
                <th className="py-3 px-4 bg-card text-muted-foreground text-xs font-semibold uppercase tracking-wider text-left border-b border-border">
                  Chat-ID
                </th>
                <th className="py-3 px-4 bg-card text-muted-foreground text-xs font-semibold uppercase tracking-wider text-left border-b border-border">
                  Befehl
                </th>
                <th className="py-3 px-4 bg-card text-muted-foreground text-xs font-semibold uppercase tracking-wider text-left border-b border-border">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-primary/5">
                  <td className="py-3 px-4 text-sm text-muted-foreground border-b border-border">
                    {new Date(log.timestamp).toLocaleString('de-DE')}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground border-b border-border">
                    {log.username || '\u2014'}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground border-b border-border">
                    {log.chat_id || '\u2014'}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground border-b border-border">
                    <code>{log.command || log.interaction_type || '\u2014'}</code>
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground border-b border-border">
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        log.success
                          ? 'bg-primary/10 text-primary'
                          : 'bg-foreground/10 text-foreground'
                      )}
                    >
                      {log.success ? 'OK' : 'Fehler'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
