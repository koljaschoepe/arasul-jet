import { formatUptime } from '../../utils/formatting';
import { useState, useEffect, useCallback } from 'react';
import { Moon, Sun, Clock, Wifi, ShieldCheck, Cpu, Building2 } from 'lucide-react';
import { Kopf } from '@marken';
import { Button, Input, Label, RadioGroup, RadioGroupItem } from '@marken';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { PLATFORM_NAME, SUPPORT_EMAIL } from '@/config/branding';
import { Feldgruppe, Formularseite } from '@marken';

/**
 * Zwei Optionen (Phase H1). »Schwarz« ist gefallen: es unterschied sich von
 * »Dunkel« um zwei Hintergrundstufen, und drei Zeilen an dieser Stelle liessen
 * einen Menschen zwischen zwei Dingen waehlen, die er auf dem Bildschirm nicht
 * auseinanderhalten kann. Die Werte heissen `light` und `dark`, weil derselbe
 * Wert im DOM als `data-theme` steht; deutsch ist die Beschriftung.
 */
const THEME_OPTIONS: ReadonlyArray<{
  value: Theme;
  label: string;
  description: string;
  icon: typeof Moon;
}> = [
  {
    value: 'light',
    label: 'Hell',
    description: 'Helles Design für bessere Lesbarkeit bei Tageslicht',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Dunkel',
    description: 'Anthrazitfarbenes Design für reduzierte Augenbelastung',
    icon: Moon,
  },
];

interface SystemInfo {
  version: string;
  hostname: string;
  jetpack_version: string;
  uptime_seconds: number;
  build_hash: string;
}

/** Antwort von GET/PUT /settings/firmenname. */
interface FirmennameAntwort {
  firmenname: string | null;
}

/** So lang darf der Name sein; dieselbe Zahl wie im Schema des Backends. */
const FIRMENNAME_MAX = 120;

export function GeneralSettings() {
  const { theme, setTheme } = useTheme();
  const api = useApi();
  const toast = useToast();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Der Firmenname: er steht ueber dem Anmeldeformular (Auftrag
  // anmeldung-ohne-slogan, 30.08.2026). `gespeichert` ist der Stand vom
  // Geraet, `firmenname` das Feld; der Knopf ist nur an, wenn beides
  // auseinanderliegt.
  const [firmenname, setFirmenname] = useState('');
  const [gespeichert, setGespeichert] = useState('');
  const [firmennameSpeichert, setFirmennameSpeichert] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<FirmennameAntwort>('/settings/firmenname', {
        signal: controller.signal,
        showError: false,
      })
      .then(d => {
        const wert = d.firmenname ?? '';
        setFirmenname(wert);
        setGespeichert(wert);
      })
      .catch(() => {
        // Ohne Antwort bleibt das Feld leer; der Fehler stuende sonst beim
        // Laden jeder Einstellungsseite als Meldung da.
      });
    return () => controller.abort();
  }, [api]);

  const firmennameSpeichern = async () => {
    setFirmennameSpeichert(true);
    try {
      const d = await api.put<FirmennameAntwort>('/settings/firmenname', {
        firmenname: firmenname.trim(),
      });
      const wert = d.firmenname ?? '';
      setFirmenname(wert);
      setGespeichert(wert);
      toast.success(
        wert
          ? `Die Anmeldeseite zeigt jetzt „${wert}".`
          : `Die Anmeldeseite zeigt jetzt den Produktnamen „${PLATFORM_NAME}".`
      );
    } catch {
      // useApi hat die Meldung schon gezeigt.
    } finally {
      setFirmennameSpeichert(false);
    }
  };
  const firmennameGeaendert = firmenname.trim() !== gespeichert;

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
      <Kopf titel="Allgemein" beschreibung="Systeminformationen und Konfiguration" />

      <Formularseite>
        <Feldgruppe
          titel="Unternehmen"
          symbol={<Building2 />}
          beschreibung="Der Name steht über dem Anmeldeformular. Ohne Namen steht dort der Produktname."
        >
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={e => {
              e.preventDefault();
              if (firmennameGeaendert && !firmennameSpeichert) void firmennameSpeichern();
            }}
          >
            <div className="flex-1">
              <Label htmlFor="firmenname" className="mb-1.5 block text-sm font-medium">
                Firmenname
              </Label>
              <Input
                id="firmenname"
                value={firmenname}
                maxLength={FIRMENNAME_MAX}
                autoComplete="organization"
                onChange={e => setFirmenname(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="solid"
              loading={firmennameSpeichert}
              disabled={!firmennameGeaendert}
            >
              Speichern
            </Button>
          </form>
        </Feldgruppe>

        <Feldgruppe
          titel="Erscheinungsbild"
          symbol={theme === 'dark' ? <Moon /> : <Sun />}
          beschreibung="Wählen Sie zwischen hellem und dunklem Design"
        >
          <RadioGroup
            value={theme}
            onValueChange={value => {
              // `setTheme` schreibt gegen das Gerät und meldet einen Fehler
              // über `useApi` selbst; hier bleibt nur, die abgelehnte Zusage
              // nicht als unbehandelt stehen zu lassen.
              void setTheme(value as Theme).catch(() => {});
            }}
            aria-label="Design auswählen"
            // Plan 009: Optionen konsequent linksbündig (guaranteed), damit
            // Hell/Dunkel nicht mittig gegenüber dem übrigen linksbündigen
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
                    // der kurze Titel („Hell") wirkt mittig (Plan 009, live bestätigt).
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
        </Feldgruppe>

        {loading ? (
          <SkeletonCard hasAvatar={false} lines={3} />
        ) : systemInfo ? (
          <Feldgruppe
            titel="Systeminformationen"
            beschreibung="Aktuelle System- und Versionsangaben"
          >
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
          </Feldgruppe>
        ) : (
          <Feldgruppe titel="Systeminformationen">
            <p className="text-sm text-muted-foreground">
              Systeminformationen konnten nicht geladen werden.
            </p>
          </Feldgruppe>
        )}

        {/*
          DIESER TEXT SAGT SEIT H5, WAS DAS GERÄT IST. Bis dahin stand hier
          „Edge-AI-Plattform für NVIDIA Jetson" und „Multi-Jahres-Betrieb ohne
          Wartung" — Sätze aus der Zeit, in der das Produkt eine KI-Plattform
          sein sollte. Es ist Standardsoftware, die interne Apps hostet; der
          Jetson ist das Blech darunter und keine Eigenschaft, die einen
          Mitarbeiter angeht. Was bleibt, ist, was er wirklich davon hat: es
          läuft im Haus, es läuft weiter, und die Apps rechnen lokal.
        */}
        <Feldgruppe
          titel={`Über ${PLATFORM_NAME}`}
          beschreibung="Die Software, die Ihre Apps im Haus betreibt"
        >
          <p className="text-sm text-muted-foreground mb-4">
            {PLATFORM_NAME} läuft auf einem Gerät in Ihrem Unternehmen und hostet die Apps, die Sie
            dort brauchen. Wer sich anmeldet, sieht die Apps, die für ihn freigegeben sind. Alles
            bleibt im Haus: Daten, Modelle und Protokolle verlassen das Gerät nicht.
          </p>
          <div className="flex flex-col gap-3">
            {[
              {
                title: 'Läuft im Haus',
                desc: 'Kein Konto bei einem Anbieter, keine Daten nach draußen',
                icon: <Wifi className="size-4" />,
              },
              {
                title: 'Betreut sich selbst',
                desc: 'Sicherung, Selbstheilung und Aktualisierungen ohne Konsole',
                icon: <ShieldCheck className="size-4" />,
              },
              {
                title: 'Rechnet vor Ort',
                desc: 'Die Modelle, mit denen die Flows arbeiten, liegen auf diesem Gerät',
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
        </Feldgruppe>
      </Formularseite>
    </div>
  );
}
