import { RefreshCw, Send, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import type { SystemConfig, SystemMessage } from './types';

interface SystemSectionProps {
  config: SystemConfig;
  setConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
  hasToken: boolean;
  showToken: boolean;
  setShowToken: (show: boolean) => void;
  loading: boolean;
  saving: boolean;
  testing: boolean;
  message: SystemMessage | null;
  hasChanges: boolean;
  onSave: () => void;
  onToggle: () => void;
  onTest: () => void;
}

export default function SystemSection({
  config,
  setConfig,
  hasToken,
  showToken,
  setShowToken,
  loading,
  saving,
  testing,
  message,
  hasChanges,
  onSave,
  onToggle,
  onTest,
}: SystemSectionProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 p-12 text-muted-foreground text-sm">
        <RefreshCw size={16} className="animate-spin" /> Lade Konfiguration...
      </div>
    );
  }

  return (
    <div>
      <h3 className="m-0 mb-4 text-foreground text-lg">System-Benachrichtigungen</h3>
      <p className="text-muted-foreground text-sm -mt-2 mb-6 leading-relaxed">
        Konfiguriere einen Bot für automatische System-Alerts (CPU, RAM, Disk, Temperatur).
      </p>

      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <div className="flex justify-between items-center">
          <div>
            <strong className="text-foreground text-sm">System-Alerts</strong>
            <p className="text-muted-foreground text-sm mt-1 mb-0">
              Automatische Benachrichtigungen bei System-Warnungen
            </p>
          </div>
          <button
            type="button"
            className={cn(
              'relative w-12 h-[26px] bg-background border border-border rounded-full cursor-pointer transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
              config.enabled && 'bg-primary border-primary'
            )}
            onClick={onToggle}
            disabled={saving || (!hasToken && !config.enabled)}
            title={!hasToken ? 'Zuerst Bot-Token eingeben' : ''}
            role="switch"
            aria-checked={config.enabled}
            aria-label="System-Alerts ein/ausschalten"
          >
            <span
              className={cn(
                'absolute top-[3px] left-[3px] size-[18px] bg-white rounded-full transition-transform',
                config.enabled && 'translate-x-[22px]'
              )}
            />
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <h4 className="m-0 mb-1 text-foreground text-sm">Bot Konfiguration</h4>
        <p className="text-muted-foreground text-sm mb-4">
          Bot-Token von @BotFather und Chat-ID eingeben
        </p>

        {message && (
          <div
            className={cn(
              'flex items-center gap-2 py-2.5 px-3.5 rounded-lg text-sm mb-4',
              message.type === 'success'
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-foreground/5 text-foreground border border-foreground/20'
            )}
          >
            {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="sys-bot-token"
            className="block mb-1.5 text-foreground text-sm font-medium"
          >
            Bot Token
          </label>
          <div className="relative">
            <input
              id="sys-bot-token"
              type={showToken ? 'text' : 'password'}
              value={config.bot_token}
              onChange={e => setConfig(prev => ({ ...prev, bot_token: e.target.value }))}
              placeholder={
                hasToken ? '********** (Token gespeichert)' : 'Token von @BotFather eingeben'
              }
              autoComplete="off"
              className="w-full py-2.5 px-3.5 pr-10 bg-background border border-border rounded-lg text-foreground text-sm transition-colors focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-muted-foreground cursor-pointer p-1"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small className="block mt-1.5 text-muted-foreground text-xs">
            Erstelle einen Bot bei <strong>@BotFather</strong> auf Telegram
          </small>
        </div>

        <div className="mb-4">
          <label htmlFor="sys-chat-id" className="block mb-1.5 text-foreground text-sm font-medium">
            Chat ID
          </label>
          <input
            id="sys-chat-id"
            type="text"
            value={config.chat_id}
            onChange={e => setConfig(prev => ({ ...prev, chat_id: e.target.value }))}
            placeholder="z.B. 123456789"
            className="w-full py-2.5 px-3.5 bg-background border border-border rounded-lg text-foreground text-sm transition-colors focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <small className="block mt-1.5 text-muted-foreground text-xs">
            Nutze <strong>@userinfobot</strong> um deine Chat-ID zu erfahren
          </small>
        </div>

        <div className="flex gap-3 mt-5 max-md:flex-col">
          <Button onClick={onSave} disabled={saving || !hasChanges}>
            {saving ? (
              'Speichern...'
            ) : (
              <>
                <Check size={16} /> Speichern
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onTest}
            disabled={testing || !hasToken || !config.chat_id}
          >
            {testing ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Senden...
              </>
            ) : (
              <>
                <Send size={16} /> Test senden
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
