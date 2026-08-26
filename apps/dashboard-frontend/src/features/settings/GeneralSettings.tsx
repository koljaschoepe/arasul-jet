import { formatUptime } from '../../utils/formatting';
import { useState, useEffect, useCallback } from 'react';
import { Moon, MoonStar, Sun, Clock, Wifi, ShieldCheck, Cpu } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/shadcn/radio-group';
import { Label } from '@/components/ui/shadcn/label';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useApi } from '../../hooks/useApi';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { PLATFORM_NAME, SUPPORT_EMAIL } from '@/config/branding';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section, SectionList } from '@/components/ui/Section';

const THEME_OPTIONS: ReadonlyArray<{
  value: Theme;
  label: string;
  description: string;
  icon: typeof Moon;
}> = [
  {
    value: 'black',
    label: 'Schwarz',
    description: 'Tiefschwarzes Design mit maximalem Kontrast',
    icon: MoonStar,
  },
  {
    value: 'dark',
    label: 'Dunkel',
    description: 'Anthrazitfarbenes Design für reduzierte Augenbelastung',
    icon: Moon,
  },
  {
    value: 'light',
    label: 'Hell',
    description: 'Helles Design für bessere Lesbarkeit bei Tageslicht',
    icon: Sun,
  },
];

interface SystemInfo {
  version: string;
  hostname: string;
  jetpack_version: string;
  uptime_seconds: number;
  build_hash: string;
}

interface GeneralSettingsProps {
  /** @deprecated Theme kommt jetzt direkt aus useTheme(); Props bleiben für Aufrufer-Kompatibilität. */
  theme?: string;
  /** @deprecated s. theme */
  onToggleTheme?: () => void;
}

export function GeneralSettings(_props: GeneralSettingsProps) {
  const { theme, setTheme } = useTheme();
  const api = useApi();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSystemInfo = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.get<SystemInfo>('/system/info', { signal, showError: false });
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
      <PageHeader title="Allgemein" description="Systeminformationen und Konfiguration" />

      <SectionList>
        <Section
          title="Erscheinungsbild"
          icon={theme === 'light' ? <Sun /> : theme === 'dark' ? <Moon /> : <MoonStar />}
          description="Wähle zwischen schwarzem, dunklem und hellem Design"
        >
          <RadioGroup
            value={theme}
            onValueChange={value => setTheme(value as Theme)}
            aria-label="Design auswählen"
            // Plan 009: Optionen konsequent linksbündig (guaranteed), damit
            // Schwarz/Dunkel/Hell nicht mittig gegenüber dem übrigen linksbündigen
            // Inhalt stehen.
            className="items-start justify-items-start"
          >
            {THEME_OPTIONS.map(option => {
              const Icon = option.icon;
              return (
                <div key={option.value} className="flex items-start gap-3">
                  <RadioGroupItem
                    value={option.value}
                    id={`theme-${option.value}`}
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor={`theme-${option.value}`}
                    // items-start überschreibt das items-center der Basis-Label-
                    // Klasse — sonst zentriert flex-col die Kinder horizontal und
                    // der kurze Titel („Schwarz") wirkt mittig (Plan 009, live bestätigt).
                    className="flex cursor-pointer flex-col items-start gap-0.5"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Icon className="size-3.5 text-muted-foreground" />
                      {option.label}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {option.description}
                    </span>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </Section>

        {loading ? (
          <SkeletonCard hasAvatar={false} lines={3} />
        ) : systemInfo ? (
          <Section title="Systeminformationen" description="Aktuelle System- und Versionsangaben">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {[
                // Beschriftungen deutsch. B7 hat die englischen aus dem
                // System-Bereich geholt und diese fünf uebersehen.
                { label: 'Version', value: systemInfo.version },
                { label: 'Gerätename', value: systemInfo.hostname },
                { label: 'JetPack', value: systemInfo.jetpack_version },
                { label: 'Build', value: systemInfo.build_hash },
                {
                  label: 'Laufzeit',
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
          </Section>
        ) : (
          <Section title="Systeminformationen">
            <p className="text-sm text-muted-foreground">
              Systeminformationen konnten nicht geladen werden.
            </p>
          </Section>
        )}

        <Section title={`Über ${PLATFORM_NAME}`} description="Edge-AI-Plattform für NVIDIA Jetson">
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
              Unterstützung:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </Section>
      </SectionList>
    </div>
  );
}
