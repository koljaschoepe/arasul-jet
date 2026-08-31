import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { formatBytesBinaer } from '@/utils/formatting';
import {
  Button,
  Chart,
  Kennzahl,
  Kennzahlen,
  Sparkline,
  ToggleGroup,
  ToggleGroupItem,
} from '@marken';
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
import { Feldgruppe, Formularseite, Ladezustand } from '@marken';

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

// Drei Zustände, drei Formen — und nur zwei Farben (30.08.2026): »Normal«
// ist eine Linie ohne Fläche, »Warnung« ein grauer Wisch, »Kritisch« Rot.
// Orange gibt es in der Palette nicht mehr; was der Zustand ist, steht im Wort.
const STAT_BADGE_VARIANTS = {
  positive: 'border-border bg-transparent text-muted-foreground',
  negative: 'border-destructive/25 bg-destructive/10 text-destructive',
  warning: 'border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground',
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
    if (value >= threshold.warning) return 'var(--muted-foreground)';
    return 'var(--primary-color)';
  };

  const totalDisk = (metrics?.disk?.used || 0) + (metrics?.disk?.free || 0);
  const usedDisk = metrics?.disk?.used || 0;

  return (
    <div className="flex min-w-0 flex-col gap-ui-3" data-testid="auslastung-seite">
      <div className="text-ui-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Systemstatus
      </div>
      <Kennzahlen>
        <Kennzahl
          beschriftung="Arbeitsspeicher"
          wert={metrics?.ram?.toFixed(1) || 0}
          einheit="%"
          fussnote={
            deviceInfo?.total_memory_gb ? (
              <>
                {`${(((metrics?.ram || 0) / 100) * deviceInfo.total_memory_gb).toFixed(1)} von ${deviceInfo.total_memory_gb} GB im ganzen Gerät`}
                {kiRamGb !== null && (
                  <div className="mt-ui-1 text-ui-xs text-muted-foreground">
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

        <Kennzahl
          beschriftung="Auslagerung"
          wert={metrics?.swap?.toFixed(1) || 0}
          einheit="%"
          fussnote={
            <span
              className={`${STAT_BADGE_BASE} ${STAT_BADGE_VARIANTS[getStatusInfo(metrics?.swap || 0, 'swap').variant]}`}
            >
              {getStatusInfo(metrics?.swap || 0, 'swap').status}
            </span>
          }
        />

        <Kennzahl
          beschriftung="Speicherplatz"
          wert={metrics?.disk?.percent?.toFixed(0) || 0}
          einheit="%"
          fussnote={
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

        <Kennzahl
          beschriftung="Temperatur"
          wert={metrics?.temperature?.toFixed(0) || 0}
          einheit="°C"
          fussnote={
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
      </Kennzahlen>

      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-ui-2">
        {/*
          SEIT H5 OHNE KARTE (Plan 023 C5 hat den Baustein flaechenlos
          gehalten, und der Aufrufer legte eine Karte darum, weil darueber
          vier Kennzahlkacheln und darunter die System-Gesundheit standen --
          beide als Karte). Beides ist jetzt keine Karte mehr: die Kachel
          traegt ihren Rand, die Gesundheit ist eine Feldgruppe. Der flache
          Block dazwischen liest sich damit nicht mehr als vergessene
          Formatierung, sondern als das, was er ist.

          BEIDE FELDGRUPPEN LIEGEN IN EINER `Formularseite`, damit die
          Trennlinie zwischen ihnen steht und die letzte keine hat. `Suspense`
          erzeugt kein Element, also ist die `section` der Gesundheit ein
          unmittelbares Kind -- und der Waehler `:last-child` greift.
        */}
        <div className="col-span-full min-w-0">
          <Formularseite>
            <Feldgruppe
              titel="Auslastung"
              aktion={
                /* SEIT H5 EIN `ToggleGroup` AUS DER BIBLIOTHEK. Bis dahin
                   standen hier drei handgebaute Knoepfe auf einer zweiten
                   Flaeche (`bg-secondary`), der gewaehlte im Akzent gefuellt
                   und der Rest mit einem willkuerlichen
                   `hover:bg-[var(--primary-alpha-10)]` -- eine Farbe, die an
                   keinem Token haengt. Die Bibliothek kennt genau diese Form,
                   und der gewaehlte Knopf hebt sich dort ab, wie ueberall
                   sonst auch. */
                <ToggleGroup
                  type="single"
                  value={String(chartTimeRange)}
                  onValueChange={wert => wert && setChartTimeRange(Number(wert))}
                  aria-label="Zeitraum der Auslastung"
                >
                  {timeRangeOptions.map((hours: number) => (
                    <ToggleGroupItem
                      key={hours}
                      value={String(hours)}
                      aria-label={`${hours} Stunden`}
                    >
                      {hours}h
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
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
            </Feldgruppe>
            <Suspense fallback={<div className="min-h-[200px]" />}>
              <SystemHealthWidget />
            </Suspense>
          </Formularseite>
        </div>
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
    return <Ladezustand meldung="Lade Systemstatus..." />;
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
