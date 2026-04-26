import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppStatus, Bot } from './types';

interface StatusSectionProps {
  appStatus: AppStatus | null;
  bots: Bot[];
  loading: boolean;
}

export default function StatusSection({ appStatus, bots, loading }: StatusSectionProps) {
  const totalChats = bots.reduce((sum, b) => sum + (b.chatCount || 0), 0);
  const activeBots = bots.filter(b => b.isActive).length;
  const ragBots = bots.filter(b => b.ragEnabled).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 p-12 text-muted-foreground text-sm">
        <RefreshCw size={16} className="animate-spin" /> Lade Status...
      </div>
    );
  }

  return (
    <div>
      <h3 className="m-0 mb-4 text-foreground text-lg">Übersicht</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 max-md:grid-cols-2 max-[480px]:grid-cols-2">
        <div className="flex flex-col gap-1.5 p-4 bg-card border border-border rounded-xl transition-colors hover:border-primary/30">
          <span className="text-[0.725rem] text-muted-foreground uppercase tracking-wider">
            Bots gesamt
          </span>
          <span className="text-2xl font-semibold text-foreground">{bots.length}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-card border border-border rounded-xl transition-colors hover:border-primary/30">
          <span className="text-[0.725rem] text-muted-foreground uppercase tracking-wider">
            Aktive Bots
          </span>
          <span className="text-2xl font-semibold text-primary">{activeBots}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-card border border-border rounded-xl transition-colors hover:border-primary/30">
          <span className="text-[0.725rem] text-muted-foreground uppercase tracking-wider">
            Verbundene Chats
          </span>
          <span className="text-2xl font-semibold text-foreground">{totalChats}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-card border border-border rounded-xl transition-colors hover:border-primary/30">
          <span className="text-[0.725rem] text-muted-foreground uppercase tracking-wider">
            RAG-Bots
          </span>
          <span className="text-2xl font-semibold text-foreground">{ragBots}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-card border border-border rounded-xl transition-colors hover:border-primary/30">
          <span className="text-[0.725rem] text-muted-foreground uppercase tracking-wider">
            System-Alerts
          </span>
          <span
            className={cn(
              'text-2xl font-semibold text-foreground',
              appStatus?.isEnabled && 'text-primary'
            )}
          >
            {appStatus?.isEnabled ? 'Aktiv' : 'Inaktiv'}
          </span>
        </div>
      </div>

      {bots.length > 0 && (
        <>
          <h3 className="m-0 mb-4 text-foreground text-lg mt-8">Bot-Details</h3>
          <div className="overflow-x-auto border border-border rounded-xl">
            <table className="w-full border-collapse max-[480px]:text-xs">
              <thead>
                <tr>
                  <th className="py-3 px-4 bg-card text-muted-foreground text-xs font-semibold uppercase tracking-wider text-left border-b border-border">
                    Bot
                  </th>
                  <th className="py-3 px-4 bg-card text-muted-foreground text-xs font-semibold uppercase tracking-wider text-left border-b border-border">
                    Status
                  </th>
                  <th className="py-3 px-4 bg-card text-muted-foreground text-xs font-semibold uppercase tracking-wider text-left border-b border-border">
                    Modell
                  </th>
                  <th className="py-3 px-4 bg-card text-muted-foreground text-xs font-semibold uppercase tracking-wider text-left border-b border-border">
                    Chats
                  </th>
                  <th className="py-3 px-4 bg-card text-muted-foreground text-xs font-semibold uppercase tracking-wider text-left border-b border-border">
                    RAG
                  </th>
                </tr>
              </thead>
              <tbody>
                {bots.map(bot => (
                  <tr key={bot.id} className="hover:bg-primary/5">
                    <td className="py-3 px-4 text-sm text-foreground border-b border-border last:[&:is(tr:last-child_td)]:border-b-0">
                      <strong>{bot.name}</strong>
                      <br />
                      <span className="text-muted-foreground text-sm">
                        @{bot.username || '\u2014'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground border-b border-border">
                      <span
                        className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          bot.isActive
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {bot.isActive ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground border-b border-border">
                      {bot.llmModel || '\u2014'}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground border-b border-border">
                      {bot.chatCount || 0}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground border-b border-border">
                      {bot.ragEnabled ? 'Ja' : 'Nein'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
