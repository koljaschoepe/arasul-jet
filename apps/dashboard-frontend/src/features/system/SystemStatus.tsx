import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { formatBytesBinaer } from '@/utils/formatting';
import { Button } from '@/components/ui/shadcn/button';
import { Chart, Sparkline } from '@/components/ui/Chart';
import { Section, SectionList } from '@/components/ui/Section';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useGeraetezustand } from './geraetezustand';
import type {
  Geraetezustand,
  MetricsHistory,
  Thresholds,
  DeviceInfo,
  ChartDataPoint,
} from './geraetezustand';
import type { Metrics } from '@/types';
import { useMemoryBudget } from '@/hooks/useMemoryBudget';
import { DashboardCard } from './DashboardCard';

/**
 * SystemStatus — die Live-System-Status-Ansicht (RAM/Swap/Storage/Temperatur-
 * Kacheln, Performance-Verlauf und die admin-only System-Gesundheit).
 *
 * Aus der entfernten Dashboard-Startseite (Plan 008) in die System-
 * Einstellungen übernommen; die Datenbasis liefert seit Phase D5
 * `geraetezustand.ts` daneben (Live-Metriken über den WebSocket,
 * `/metrics/history?range=24h`, `/system/thresholds`). Die frühere
 * Automatisierungs-Kachel war reines Dashboard-Chrome und entfällt hier.
 */

const SystemHealthWidget = lazy(() => import('./SystemHealthWidget'));

/**
 * Die Temperaturachse, 40 bis 100 Grad statt 0 bis 100.
 *
 * Am 20.08.2026 auf dem Orin gemessen, 20006 Werte aus sieben Tagen: 45,8 Grad
 * im Tief, 72,5 im Hoch, 50,4 im Mittel. Auf einer Achse ab null belegt das 27
 * Prozent der Hoehe und im Alltag rund 6, also wieder die fast gerade Linie,
 * gegen die dieser Schritt ueberhaupt gebaut ist. Die Temperatur von der
 * Prozentachse zu nehmen und ihr dann dieselbe Spanne zu geben, haette den
 * Fehler nur umbenannt.
 *
 * Die Untergrenze ist fest: eine Achse, die sich den Daten anpasst, macht aus
 * zwei Grad Schwankung ein Gebirge, und die Frage an dieses Diagramm lautet, ob
 * das Geraet ruhig laeuft. Die Obergrenze ist im Normalfall ebenfalls fest bei
 * 100 und haelt damit die Alarmschwellen des Produkts im Bild (Warnung 80,
 * kritisch 95). Sie waechst aber mit, sobald ein Messwert darueber liegt.
 *
 * Der zweite Teil kam aus der Review und ist wichtiger, als er aussieht: eine
 * feste Decke schneidet den Ausreisser ab, wegen dem man ueberhaupt hinsieht.
 * Ein Geraet, das fuenf Jahre unbeaufsichtigt laufen soll, faellt irgendwann in
 * genau diesen Fall, und dann darf die Kurve nicht am oberen Rand verschwinden.
 */
export const TEMPERATUR_ACHSE: [number, (datenMax: number) => number] = [
  40,
  // Der Wachtest auf endlich ist kein Zierrat: Math.max(100, NaN) ist NaN, und
  // eine Achse mit NaN als Grenze zeichnet gar nichts, ohne einen Fehler zu
  // melden. recharts kann in einem Zwischenschritt einen leeren Datensatz
  // reichen, bevor der Verlauf geladen ist.
  datenMax => (Number.isFinite(datenMax) ? Math.max(100, Math.ceil(datenMax / 10) * 10) : 100),
];

// Kompakt-Layout (Plan 002): alle Klassen auf der Dichte-Skala (text-ui-*
// + ui-1…4-Abstände). min(100%, …) in den auto-fit-Grids verhindert
// horizontales Scrollen, wenn der Container schmaler als eine Karte ist.
const STAT_BADGE_BASE =
  'mt-ui-1 inline-flex w-fit items-center gap-ui-1 rounded-xs border px-ui-1 py-px ' +
  'text-ui-xs font-semibold uppercase tracking-wide';

// Theme-aware Status-Tokens (--status-*): haben in Light-Mode eigene,
// kontraststarke Werte (#DC2626/#D97706) — --danger/--warning wären dort
// zu hell (Kontrast ~2:1 auf hellem Alpha-Hintergrund).
const STAT_BADGE_VARIANTS = {
  positive:
    'border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral)]',
  negative:
    'border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical)]',
  warning:
    'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
} as const;

type StatBadgeVariant = keyof typeof STAT_BADGE_VARIANTS;

interface SystemStatusViewProps {
  metrics: Metrics | null;
  metricsHistory: MetricsHistory | null;
  formatChartData: () => ChartDataPoint[];
  thresholds: Thresholds | null;
  deviceInfo: DeviceInfo | null;
}

/**
 * Die eigentliche Status-Darstellung. Erwartet bereits geladene Daten aus
 * `useGeraetezustand` (der Wrapper unten übernimmt Lade- und Fehlerzustand und
 * den EINEN Aufruf, damit nur ein WebSocket offen ist).
 */
function SystemStatusView({
  metrics,
  metricsHistory,
  formatChartData,
  thresholds,
  deviceInfo,
}: SystemStatusViewProps): React.JSX.Element {
  // Dasselbe Budget, das die Statusleiste unten anzeigt, aus demselben
  // Abfrageschluessel: ein Cache-Eintrag, keine zweite Abfragelast auf dem
  // Jetson. Genau das ist der Kern von F-24. Auf einem Bildschirm standen
  // „24,5 / 61 GB" und „KI-RAM 15,5/32,0 GB" nebeneinander, ohne dass eine
  // Zeile sagte, dass die 32 ein Teil der 61 sind (RAM_LIMIT_LLM in der .env
  // des Geraets). Beide Zahlen waren richtig, keine erklaerte die andere.
  const { data: kiBudget } = useMemoryBudget();
  const kiRamGb =
    kiBudget?.totalBudgetMb != null ? (kiBudget.totalBudgetMb / 1024).toFixed(0) : null;

  const defaultThresholds: Thresholds = {
    cpu: { warning: 70, critical: 90 },
    ram: { warning: 70, critical: 90 },
    swap: { warning: 30, critical: 60 },
    gpu: { warning: 80, critical: 95 },
    storage: { warning: 70, critical: 85 },
    temperature: { warning: 80, critical: 95 },
  };

  const t = thresholds || defaultThresholds;

  const getStatusInfo = (
    value: number,
    metric: string
  ): { status: string; variant: StatBadgeVariant } => {
    const threshold = t[metric];
    if (!threshold) return { status: 'Normal', variant: 'positive' };
    if (value >= threshold.critical) {
      return { status: 'Kritisch', variant: 'negative' };
    }
    if (value >= threshold.warning) {
      return { status: 'Warnung', variant: 'warning' };
    }
    return { status: 'Normal', variant: 'positive' };
  };

  const getTempStatusInfo = (value: number): { status: string; variant: StatBadgeVariant } => {
    const threshold = t.temperature;
    if (value >= threshold.critical) {
      return { status: 'Heiß', variant: 'negative' };
    }
    if (value >= threshold.warning) {
      return { status: 'Warm', variant: 'warning' };
    }
    return { status: 'Normal', variant: 'positive' };
  };

  const [chartTimeRange, setChartTimeRange] = useState<number>(() => {
    const saved = localStorage.getItem('arasul_chart_time_range');
    return saved ? Number(saved) : 24;
  });

  useEffect(() => {
    localStorage.setItem('arasul_chart_time_range', String(chartTimeRange));
  }, [chartTimeRange]);
  const timeRangeOptions: number[] = [1, 6, 12, 24];

  const tickIntervalMs: Record<number, number> = {
    1: 10 * 60 * 1000,
    6: 60 * 60 * 1000,
    12: 2 * 60 * 60 * 1000,
    24: 4 * 60 * 60 * 1000,
  };

  const chartData = useMemo((): ChartDataPoint[] => {
    const allData = formatChartData();
    if (!allData.length) return [];
    const now = Date.now();
    const cutoff = now - chartTimeRange * 60 * 60 * 1000;
    return allData.filter(d => d.timestamp >= cutoff);
  }, [formatChartData, chartTimeRange]);

  const chartTicks = useMemo((): number[] => {
    if (!chartData.length) return [];
    const interval = tickIntervalMs[chartTimeRange] || 60 * 60 * 1000;
    const now = Date.now();
    const cutoff = now - chartTimeRange * 60 * 60 * 1000;
    const firstTick = Math.ceil(cutoff / interval) * interval;
    const ticks: number[] = [];
    for (let tick = firstTick; tick <= now; tick += interval) {
      ticks.push(tick);
    }
    return ticks;
  }, [chartData, chartTimeRange]);

  const getProgressColor = (value: number, metric: string = 'cpu'): string => {
    const threshold = t[metric] || { warning: 70, critical: 90 };
    if (value >= threshold.critical) return 'var(--danger-color)';
    if (value >= threshold.warning) return 'var(--warning-color)';
    return 'var(--primary-color)';
  };

  const totalDisk = (metrics?.disk?.used || 0) + (metrics?.disk?.free || 0);
  const usedDisk = metrics?.disk?.used || 0;

  return (
    <div className="flex min-w-0 flex-col gap-ui-3">
      <div className="text-ui-xs font-semibold uppercase tracking-wider text-text-muted">
        Systemstatus
      </div>
      <StatGrid>
        <StatTile
          label="Arbeitsspeicher"
          value={metrics?.ram?.toFixed(1) || 0}
          unit="%"
          note={
            deviceInfo?.total_memory_gb ? (
              <>
                {`${(((metrics?.ram || 0) / 100) * deviceInfo.total_memory_gb).toFixed(1)} von ${deviceInfo.total_memory_gb} GB im ganzen Gerät`}
                {kiRamGb !== null && (
                  <div className="mt-ui-1 text-ui-xs text-text-muted">
                    {`Davon ${kiRamGb} GB für KI-Modelle reserviert`}
                  </div>
                )}
              </>
            ) : (
              <span
                className={`${STAT_BADGE_BASE} ${STAT_BADGE_VARIANTS[getStatusInfo(metrics?.ram || 0, 'ram').variant]}`}
              >
                {getStatusInfo(metrics?.ram || 0, 'ram').status}
              </span>
            )
          }
        />

        <StatTile
          label="Auslagerung"
          value={metrics?.swap?.toFixed(1) || 0}
          unit="%"
          note={
            <span
              className={`${STAT_BADGE_BASE} ${STAT_BADGE_VARIANTS[getStatusInfo(metrics?.swap || 0, 'swap').variant]}`}
            >
              {getStatusInfo(metrics?.swap || 0, 'swap').status}
            </span>
          }
        />

        <StatTile
          label="Speicherplatz"
          value={metrics?.disk?.percent?.toFixed(0) || 0}
          unit="%"
          note={
            <>
              <div className="my-ui-1 h-1 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${metrics?.disk?.percent || 0}%`,
                    background: getProgressColor(metrics?.disk?.percent || 0, 'storage'),
                  }}
                />
              </div>
              {/* Plan 023 D4: binaer, weil `df -h` auf diesem Geraet "1,8T"
                  sagt und nicht "2,0T". Wer im Terminal nachsieht, soll
                  dieselbe Zahl finden. */}
              {formatBytesBinaer(usedDisk)} von {formatBytesBinaer(totalDisk)}
            </>
          }
        />

        <StatTile
          label="Temperatur"
          value={metrics?.temperature?.toFixed(0) || 0}
          unit="°C"
          note={
            <>
              <span
                className={`${STAT_BADGE_BASE} ${STAT_BADGE_VARIANTS[getTempStatusInfo(metrics?.temperature || 0).variant]}`}
              >
                {getTempStatusInfo(metrics?.temperature || 0).status}
              </span>
              <Sparkline values={metricsHistory?.temperature ?? []} />
            </>
          }
        />
      </StatGrid>

      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-ui-2">
        {/*
          Die Karte steht hier beim Aufrufer, nicht im Diagramm. Der Baustein
          bleibt flaechenlos, wie Plan 023 C5 es verlangt; auf dieser Seite
          liegen aber vier Kennzahlkacheln darueber und die System-Gesundheit
          darunter, beide als Karte. Ein einzelner flacher Block dazwischen
          liest sich wie eine vergessene Formatierung, nicht wie Absicht.
        */}
        <DashboardCard className="col-span-full">
          <SectionList>
            <Section
              title="Auslastung"
              action={
                <div className="flex gap-ui-1 rounded-md bg-secondary p-ui-1">
                  {timeRangeOptions.map((hours: number) => (
                    <button
                      key={hours}
                      type="button"
                      className={`cursor-pointer rounded-sm px-ui-2 py-ui-1 text-ui-xs font-semibold transition-colors ${
                        chartTimeRange === hours
                          ? 'bg-primary text-primary-foreground'
                          : 'text-text-muted hover:bg-[var(--primary-alpha-10)] hover:text-text-primary'
                      }`}
                      onClick={() => setChartTimeRange(hours)}
                    >
                      {hours}h
                    </button>
                  ))}
                </div>
              }
            >
              <Chart
                data={chartData}
                series={[
                  { key: 'RAM', name: 'Arbeitsspeicher', unit: '%' },
                  { key: 'Swap', name: 'Auslagerung', unit: '%' },
                  // Eigene Achse rechts. Auf der Prozentachse landeten 52 Grad
                  // auf der Linie, an der „50%" steht: ein Leser sah eine
                  // halbvolle Maschine, wo eine kuehle stand.
                  { key: 'Temp', name: 'Temperatur', unit: '°C', achse: 'rechts' },
                ]}
                xKey="timestamp"
                xTicks={chartTicks}
                formatX={ts =>
                  new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                }
                formatY={wert => `${wert}%`}
                yDomain={[0, 100]}
                formatYRechts={wert => `${wert} °C`}
                yDomainRechts={TEMPERATUR_ACHSE}
                // Die alte Beschriftung nannte Prozessor, Arbeitsspeicher und
                // Grafikeinheit. Gezeichnet wurden Arbeitsspeicher, Auslagerung
                // und Temperatur. Wer die Seite vorlesen ließ, bekam drei falsche
                // Namen.
                label={`Auslastung der letzten ${chartTimeRange} Stunden: Arbeitsspeicher und Auslagerung in Prozent auf der linken Achse, Temperatur in Grad Celsius auf der rechten`}
              />
              <div className="sr-only" role="status">
                {metrics && (
                  <>
                    Arbeitsspeicher: {metrics.ram?.toFixed(1)}%, Auslagerung:{' '}
                    {metrics.swap?.toFixed(1)}
                    %, Temperatur: {metrics.temperature?.toFixed(1)}°C
                  </>
                )}
              </div>
            </Section>
          </SectionList>
        </DashboardCard>

        <Suspense fallback={<DashboardCard className="min-h-[200px]" />}>
          <SystemHealthWidget />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Öffentlicher Einstieg: kapselt Lade-/Fehlerzustand rund um die Status-Ansicht.
 */
export function SystemStatus(): React.JSX.Element {
  const data: Geraetezustand = useGeraetezustand(true);

  if (data.loading) {
    return <LoadingSpinner message="Lade Systemstatus..." />;
  }
  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <p>{data.error}</p>
        <Button type="button" variant="solid" onClick={data.retry}>
          Erneut versuchen
        </Button>
      </div>
    );
  }
  return (
    <SystemStatusView
      metrics={data.metrics}
      metricsHistory={data.metricsHistory}
      formatChartData={data.formatChartData}
      thresholds={data.thresholds}
      deviceInfo={data.deviceInfo}
    />
  );
}
