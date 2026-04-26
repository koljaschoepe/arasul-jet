import { RefreshCw, Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import BotCard from './BotCard';
import type { Bot } from './types';

interface BotsSectionProps {
  bots: Bot[];
  loading: boolean;
  error: string | null;
  togglingBot: string | null;
  deletingBot: string | null;
  onRefresh: () => void;
  onCreateBot: () => void;
  onEditBot: (bot: Bot) => void;
  onToggleBot: (botId: string, currentActive: boolean) => void;
  onDeleteBot: (botId: string) => void;
}

export default function BotsSection({
  bots,
  loading,
  error,
  togglingBot,
  deletingBot,
  onRefresh,
  onCreateBot,
  onEditBot,
  onToggleBot,
  onDeleteBot,
}: BotsSectionProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h3 className="m-0 text-foreground text-lg">
          {bots.length} Bot{bots.length !== 1 ? 's' : ''}
        </h3>
        <div className="flex gap-2 items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            title="Aktualisieren"
            aria-label="Aktualisieren"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button onClick={onCreateBot}>
            <Plus size={16} /> Neuer Bot
          </Button>
        </div>
      </div>

      {error && (
        <div className="py-3 px-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 max-md:grid-cols-1">
          {[1, 2].map(i => (
            <div
              key={i}
              className="bg-card border border-border rounded-xl p-5 pointer-events-none"
            >
              <div className="flex justify-between items-start mb-3.5">
                <div
                  className="rounded bg-border animate-pulse"
                  style={{ width: 120, height: 16 }}
                />
                <div className="w-[52px] h-[22px] rounded-full bg-border animate-pulse" />
              </div>
              <div
                className="rounded bg-border animate-pulse"
                style={{ width: '80%', height: 12 }}
              />
              <div className="flex flex-wrap gap-2.5 py-3 border-t border-b border-border mb-3.5 mt-3.5">
                <div
                  className="rounded bg-border animate-pulse"
                  style={{ width: 80, height: 12 }}
                />
                <div
                  className="rounded bg-border animate-pulse"
                  style={{ width: 60, height: 12 }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : bots.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground bg-card border border-dashed border-border rounded-xl">
          <div className="flex items-center justify-center size-16 bg-primary/10 rounded-full text-primary mb-4">
            <Send size={32} />
          </div>
          <h4 className="text-foreground m-0 mb-2 text-lg">Noch keine Bots</h4>
          <p className="m-0 mb-5 max-w-[360px] leading-relaxed text-sm">
            Verbinde deinen ersten Telegram Bot mit einer KI und starte Gespräche direkt aus
            Telegram.
          </p>
          <Button onClick={onCreateBot}>
            <Plus size={16} /> Bot erstellen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 max-md:grid-cols-1">
          {bots.map(bot => (
            <BotCard
              key={bot.id}
              bot={bot}
              toggling={togglingBot === bot.id}
              deleting={deletingBot === bot.id}
              onEdit={() => onEditBot(bot)}
              onToggle={() => onToggleBot(bot.id, bot.isActive)}
              onDelete={() => onDeleteBot(bot.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
