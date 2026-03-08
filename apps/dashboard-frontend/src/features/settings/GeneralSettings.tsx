import { useState, useEffect, useCallback } from 'react';
import { Moon, Sun, Clock, Wifi, ShieldCheck, Cpu } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/shadcn/card';
import { Switch } from '@/components/ui/shadcn/switch';
import { Label } from '@/components/ui/shadcn/label';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useApi } from '../../hooks/useApi';

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
      } catch (error: any) {
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

      <div className="flex flex-col gap-6">
        {/* Theme Toggle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {theme === 'dark' ? <Moon className="size-5" /> : <Sun className="size-5" />}
              Erscheinungsbild
            </CardTitle>
            <CardDescription>Wählen Sie zwischen hellem und dunklem Design</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Label className="text-sm font-medium">
                  Aktuelles Theme: <strong>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</strong>
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
          </CardContent>
        </Card>

        {/* System Information */}
        {loading ? (
          <SkeletonCard hasAvatar={false} lines={3} />
        ) : systemInfo ? (
          <Card>
            <CardHeader>
              <CardTitle>Systeminformationen</CardTitle>
              <CardDescription>Aktuelle System- und Versionsinformationen</CardDescription>
            </CardHeader>
            <CardContent>
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
                  <div key={item.label} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      {'icon' in item && item.icon}
                      {item.label}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Systeminformationen konnten nicht geladen werden.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Platform Info */}
        <Card>
          <CardHeader>
            <CardTitle>Über Arasul Platform</CardTitle>
            <CardDescription>Edge-AI-Plattform für NVIDIA Jetson</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Arasul ist eine autonome Edge-AI-Plattform, die auf NVIDIA Jetson AGX Orin läuft. Die
              Plattform bietet lokale KI-Funktionen, Multi-Jahres-Betrieb ohne Wartung und ein
              einheitliches Dashboard-Interface.
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
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {feature.icon}
                  </div>
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
                <a href="mailto:info@arasul.de" className="text-primary hover:underline">
                  info@arasul.de
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
