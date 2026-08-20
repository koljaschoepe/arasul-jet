/**
 * Chart — Linien-Diagramm, und Sparkline — die kleine Form davon.
 *
 * Ersetzt zwei getrennte recharts-Aufbauten in `SystemStatus`: das Auslastungs-
 * Diagramm und den Temperaturverlauf in der Kachel. Beide setzten Achsen,
 * Gitter und Farben von Hand, mit unterschiedlichem Ergebnis.
 *
 * Zwei Festlegungen, die der Aufrufer nicht mehr treffen kann:
 *
 * 1. Nur Grau und Blau (Befund F-25). Vorher liefen drei Linien in Violett
 *    (`--color-chart-2`), Blau und Orange (`--color-chart-3`). Drei Farben für
 *    drei Werte derselben Einheit behaupten eine Bedeutung, die es nicht gibt.
 *    SERIENFARBEN hat vier Einträge, von kräftigem Blau nach Grau. Wer mehr
 *    Reihen übergibt, bekommt Wiederholungen; vier ist bewusst die Grenze,
 *    innerhalb derer sich Linien noch unterscheiden lassen.
 * 2. Keine Karte drumherum. Die Fläche stellt der Aufrufer, das Diagramm
 *    bringt nur die Linien mit.
 */

import { memo, useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

/**
 * Vier Werte von kraeftigem Blau nach Grau. Die Namen stammen aus zwei
 * Familien, und das bleibt so: recharts nimmt die rohe CSS-Variable, und
 * `--color-chart-1` ist der einzige Blauton dieser Reihe, der ueberhaupt einen
 * Tailwind-Namen hat. Die uebrigen drei gibt es nur unter ihrem rohen Namen.
 * `index.css` bildet beide Familien auf dieselben Werte ab; wer hier
 * vereinheitlicht, vereinheitlicht Namen, nicht Farben.
 */
export const SERIENFARBEN = [
  'var(--color-chart-1)',
  'var(--primary-color)',
  'var(--text-secondary)',
  'var(--text-muted)',
] as const;

export interface ChartSeries {
  /** Feldname im Datensatz. */
  key: string;
  /** Beschriftung in Legende und Tooltip. */
  name: string;
  /** Einheit hinter dem Wert im Tooltip, etwa "%" oder "°C". */
  unit?: string;
}

/**
 * Über die Datensatzform gebunden statt auf Record festgelegt: eine mit
 * `interface` erklärte Form wie `ChartDataPoint` hat keine Index-Signatur und
 * passt deshalb auf kein Record. `object` nimmt beides.
 */
interface ChartProps<Datum extends object> {
  data: readonly Datum[];
  series: readonly ChartSeries[];
  /** Feldname der X-Achse. */
  xKey: string;
  /** Feste Achsenmarken, sonst wählt recharts selbst. */
  xTicks?: number[];
  formatX: (value: number) => string;
  formatY?: (value: number) => string;
  yDomain?: [number, number];
  height?: number;
  /** Beschreibung des Diagramms für Vorlesewerkzeuge. */
  label: string;
  className?: string;
}

const ACHSE = {
  stroke: 'var(--text-muted)',
  tick: { fill: 'var(--text-muted)', fontSize: '0.75rem' },
  axisLine: { stroke: 'var(--text-muted)' },
  tickLine: { stroke: 'var(--text-muted)' },
} as const;

export function Chart<Datum extends object>({
  data,
  series,
  xKey,
  xTicks,
  formatX,
  formatY,
  yDomain,
  height = 280,
  label,
  className,
}: ChartProps<Datum>) {
  const einheiten = new Map(series.map(reihe => [reihe.name, reihe.unit ?? '']));

  return (
    <div className={cn('min-w-0', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data as Datum[]} role="img" aria-label={label}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey={xKey}
            type="number"
            domain={['dataMin', 'dataMax']}
            {...(xTicks ? { ticks: xTicks } : {})}
            tickFormatter={formatX}
            {...ACHSE}
          />
          <YAxis
            {...(yDomain ? { domain: yDomain } : {})}
            {...(formatY ? { tickFormatter: formatY } : {})}
            {...ACHSE}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
            }}
            labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
            labelFormatter={wert => formatX(Number(wert))}
            formatter={(wert, name) => {
              const zahl = typeof wert === 'number' ? wert : Number(wert);
              return [`${zahl.toFixed(1)}${einheiten.get(String(name)) ?? ''}`, String(name)];
            }}
          />
          <Legend />
          {series.map((reihe, index) => (
            <Line
              key={reihe.key}
              type="monotone"
              dataKey={reihe.key}
              name={reihe.name}
              stroke={SERIENFARBEN[index % SERIENFARBEN.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface SparklineProps {
  /** Werte in zeitlicher Reihenfolge. Lücken als null. */
  values: ReadonlyArray<number | null>;
  /** Wie viele Werte vom Ende her gezeigt werden. */
  fenster?: number;
  height?: number;
  className?: string;
}

/**
 * Verlauf ohne Achsen, für die Kennzahlkachel. Trägt keine eigene Aussage,
 * die nicht schon in der Zahl daneben steht, deshalb `aria-hidden`.
 *
 * `memo` und `useMemo`, weil `SystemStatus` bei jedem Messwert neu zeichnet.
 * Der Vorläufer `TempSparkline` hatte beides, und dreissig Werte sind zwar
 * wenig, aber es gibt keinen Grund, sie viermal je Minute neu zu falten.
 *
 * Lücken kommen als null herein. Wer eine Ausfallkennung hat, die wie ein
 * gültiger Wert aussieht, wandelt sie vorher um: die Temperatur macht das in
 * `useDashboardData.ohneAusfallwerte`, weil null Grad dort kein Messwert ist,
 * sondern ein stummer Sensor.
 */
export const Sparkline = memo(function Sparkline({
  values,
  fenster = 30,
  height = 18,
  className,
}: SparklineProps) {
  const punkte = useMemo(
    () =>
      values
        .slice(-fenster)
        .map((wert, index) => ({ index, wert }))
        .filter(
          (punkt): punkt is { index: number; wert: number } => typeof punkt.wert === 'number'
        ),
    [values, fenster]
  );

  // Eine einzelne Zahl ergibt keine Linie, gar nichts ist ehrlicher als ein Punkt.
  if (punkte.length < 2) return null;

  return (
    <div
      className={cn('pointer-events-none mt-ui-1 w-full max-w-32 opacity-60', className)}
      aria-hidden="true"
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={punkte} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Line
            type="monotone"
            dataKey="wert"
            stroke={SERIENFARBEN[0]}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

export default Chart;
