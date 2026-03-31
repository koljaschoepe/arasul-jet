import { useState, useEffect, useCallback } from 'react';
import { Moon, Sun, Clock, Wifi, ShieldCheck, Cpu } from 'lucide-react';
import { Switch } from '@/components/ui/shadcn/switch';
import { Label } from '@/components/ui/shadcn/label';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useApi } from '../../hooks/useApi';
import { PLATFORM_NAME, SUPPORT_EMAIL } from '@/config/branding';

interface SystemInfo {
  version: string;
  hostname: string;
  jetpack_version: string;
  uptime_seconds: number;
  build_hash: string;
}

interface GeneralSettingsProps {
  theme?: string;
  onToggleTheme?: () => void;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function GeneralSettings({ theme, onToggleTheme }: GeneralSettingsProps) {
  const api = useApi();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSystemInfo = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.get('/system/info', { signal, showError: false });
        setSystemInfo(data);
      } catch (error: unknown) {
        if (signal?.aborted) return;
        console.error('Failed to fetch system info:', error);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchSystemInfo(controller.signal);
    return () => controller.abort();
  }, [fetchSystemInfo]);

  return (
    <div className="animate-in fade-in">
      <div className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2">Allgemein</h1>
        <p className="text-sm text-muted-foreground">Systeminformationen und Konfiguration</p>
      </div>

      <div className="flex flex-col gap-8">
        {/* Theme Toggle */}
        <div className="pb-6 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            {theme === 'dark' ? (
              <Moon className="size-4 text-muted-foreground" />
            ) : (
              <Sun className="size-4 text-muted-foreground" />
            )}
            Erscheinungsbild
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Wählen Sie zwischen hellem und dunklem Design
          </p>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <Label className="text-sm font-medium">
                Aktuelles Theme:{' '}
                <strong>{theme === 'dark' ? 'Dunkler Modus' : 'Heller Modus'}</strong>
              </Label>
              <span className="text-xs text-muted-foreground">
                {theme === 'dark'
                  ? 'Dunkles Design für reduzierte Augenbelastung'
                  : 'Helles Design für bessere Lesbarkeit bei Tageslicht'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="size-4 text-muted-foreground" />
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={onToggleTheme}
                aria-label="Theme umschalten"
              />
              <Moon className="size-4 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* System Information */}
        {loading ? (
          <SkeletonCard hasAvatar={false} lines={3} />
        ) : systemInfo ? (
          <div className="pb-6 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground mb-1">Systeminformationen</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Aktuelle System- und Versionsinformationen
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {[
                { label: 'Platform Version', value: systemInfo.version },
                { label: 'Hostname', value: systemInfo.hostname },
                { label: 'JetPack Version', value: systemInfo.jetpack_version },
                { label: 'Build', value: systemInfo.build_hash },
                {
                  label: 'Uptime',
                  value: formatUptime(systemInfo.uptime_seconds),
                  icon: <Clock className="size-3.5 text-muted-foreground" />,
                },
              ].map(item => (
                <div
                  key={item.label}
                  className="flex flex-col gap-1 p-3 rounded-lg border border-border/50"
                >
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    {'icon' in item && item.icon}
                    {item.label}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground pb-6 border-b border-border">
            Systeminformationen konnten nicht geladen werden.
          </p>
        )}

        {/* Platform Info */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">{`Über ${PLATFORM_NAME} Platform`}</h3>
          <p className="text-xs text-muted-foreground mb-4">Edge-AI-Plattform für NVIDIA Jetson</p>
          <p className="text-sm text-muted-foreground mb-4">
            {PLATFORM_NAME} ist eine autonome Edge-AI-Plattform, die auf NVIDIA Jetson AGX Orin
            läuft. Die Plattform bietet lokale KI-Funktionen, Multi-Jahres-Betrieb ohne Wartung und
            ein einheitliches Dashboard-Interface.
          </p>
          <div className="flex flex-col gap-3">
            {[
              {
                title: 'Offline-Verfügbarkeit',
                desc: 'Funktioniert ohne Internetverbindung',
                icon: <Wifi className="size-4" />,
              },
              {
                title: 'Selbstheilungs-System',
                desc: 'Automatische Fehlerkorrektur und Recovery',
                icon: <ShieldCheck className="size-4" />,
              },
              {
                title: 'GPU-beschleunigte KI',
                desc: 'Lokale LLMs und Embedding-Modelle',
                icon: <Cpu className="size-4" />,
              },
            ].map((feature, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="shrink-0 text-muted-foreground mt-0.5">{feature.icon}</div>
                <div className="flex flex-col">
                  <strong className="text-sm text-foreground">{feature.title}</strong>
                  <span className="text-xs text-muted-foreground">{feature.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Support:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
