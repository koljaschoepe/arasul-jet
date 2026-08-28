/**
 * Aktualisierungen (Phase D5 des Umbaus vom 26.08.2026, gekürzt aus der alten
 * Seite von 734 Zeilen).
 *
 * DREI FRAGEN, IN DIESER REIHENFOLGE:
 *
 *   1. Welche Fassung läuft hier? Sie kommt seit C10 aus dem BAU
 *      (`scripts/lib/fassung.sh`) und steht in `GET /api/update/status` als
 *      `fassung`. Ein Gerät ohne gesetzte Fassung sagt „Vorserie", statt eine
 *      1.0.0 zu behaupten.
 *   2. Lässt sich hier überhaupt eines einspielen? Das Backend beantwortet
 *      das selbst (`einspielenMoeglich` / `einspielenGrund`, aus
 *      `updateService.wegPruefen`): im Backend-Container gibt es kein
 *      `docker`-Programm, und dann geht der Weg über den Deploy oder
 *      `./arasul update` am Gerät. Die Seite sagt das, statt Knöpfe
 *      anzubieten, die zuverlässig scheitern.
 *   3. Was war bisher? Der Verlauf aus `update_events`.
 *
 * WAS GESTRICHEN IST: die Statuszeile mit sechs Schritt-Übersetzungen, der
 * „hängt seit zehn Minuten"-Kasten, die Karte „Aktueller Stand" mit vier
 * Feldern neben dem Verlauf und der eigene Zustandsautomat aus sieben
 * Zuständen. Übrig ist der Ablauf, den es wirklich gibt: Paket wählen,
 * hochladen, prüfen lassen, einspielen.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle,
  HardDrive,
  Lock,
  Package,
  RefreshCw,
  Settings,
  XCircle,
} from 'lucide-react';
import { API_BASE } from '../../config/api';
import { getCsrfToken } from '../../utils/csrf';
import { getValidToken } from '../../utils/token';
import { useApi } from '../../hooks/useApi';
import { formatBytes, formatDate } from '../../utils/formatting';
import EmptyState from '../../components/ui/EmptyState';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section, SectionList } from '@/components/ui/Section';
import { StatGrid, StatTile } from '@/components/ui/StatTile';

interface ValidationResult {
  file_path?: string;
  version?: string;
  size?: number;
  components?: Array<{ name?: string; version_to?: string } | string>;
  requires_reboot?: boolean;
  source?: string;
}

interface UpdateStatusData {
  status?: string;
  error?: string;
  currentStep?: string;
  startTime?: string;
  /** Seit C10: die Fassung aus dem Bau, und ob das Gerät sie überhaupt kennt. */
  fassung?: { version: string | null; anzeige: string; bekannt: boolean };
  /** Seit C10: kann dieses Gerät über die Schnittstelle einspielen? */
  einspielenMoeglich?: boolean;
  einspielenGrund?: string | null;
}

interface SystemInfoData {
  build_hash?: string;
  jetpack_version?: string;
}

interface UsbDevice {
  path: string;
  name: string;
  size: number;
  device: string;
}

interface HistoryEntry {
  id: number;
  version_from: string;
  version_to: string;
  source: string;
  status: string;
  started_at?: string;
  timestamp?: string;
  duration_seconds?: number;
}

/** Der Ablauf, den es gibt. Kein Zustand mehr für das, was die Abfrage weiß. */
type Schritt = 'ruhe' | 'laedt hoch' | 'geprueft' | 'spielt ein' | 'fertig' | 'fehler';

const STATUS_KEY = ['update', 'status'] as const;
const HISTORY_KEY = ['update', 'history'] as const;
const USB_KEY = ['update', 'usb'] as const;

const VERLAUF_STATUS: Record<string, string> = {
  completed: 'Abgeschlossen',
  failed: 'Fehlgeschlagen',
  in_progress: 'In Bearbeitung',
  validated: 'Geprüft',
  rolled_back: 'Zurückgesetzt',
  signature_verified: 'Signatur OK',
};

const UpdatePage = () => {
  const api = useApi();
  const qc = useQueryClient();
  const [schritt, setSchritt] = useState<Schritt>('ruhe');
  const [paket, setPaket] = useState<File | null>(null);
  const [signatur, setSignatur] = useState<File | null>(null);
  const [fortschritt, setFortschritt] = useState(0);
  const [geprueft, setGeprueft] = useState<ValidationResult | null>(null);
  const [fehler, setFehler] = useState('');

  const { data: status, isError: statusUnerreichbar } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api.get<UpdateStatusData>('/update/status', { showError: false }),
    // Während des Einspielens im Zwei-Sekunden-Takt, sonst gemütlich: der
    // Ruhezustand ändert sich nur, wenn jemand hier etwas tut.
    refetchInterval: schritt === 'spielt ein' ? 2_000 : false,
    retry: 1,
  });
  const { data: info } = useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => api.get<SystemInfoData>('/system/info', { showError: false }),
    staleTime: 60_000,
  });
  const { data: verlauf } = useQuery({
    queryKey: HISTORY_KEY,
    queryFn: async () => {
      const res = await api.get<{ updates?: HistoryEntry[] }>('/update/history', {
        showError: false,
      });
      return res.updates ?? [];
    },
    staleTime: 30_000,
  });

  const einspielenMoeglich = status?.einspielenMoeglich !== false;

  // Die USB-Suche fragt das Gerät nach angesteckten Sticks. Sie läuft NUR,
  // wenn sich hier überhaupt einspielen lässt: sonst ist sie eine Suche nach
  // einem Paket, mit dem danach nichts geschehen kann.
  const {
    data: sticks,
    isFetching: sucht,
    refetch: sucheSticks,
  } = useQuery({
    queryKey: USB_KEY,
    queryFn: async () => {
      const res = await api.get<{ devices?: UsbDevice[] }>('/update/usb-devices', {
        showError: false,
      });
      return res.devices ?? [];
    },
    enabled: einspielenMoeglich && schritt === 'ruhe',
    staleTime: 30_000,
  });

  // Der Ausgang des Einspielens steht in der Abfrage, nicht in einem zweiten
  // Zustand daneben.
  useEffect(() => {
    if (schritt !== 'spielt ein' || !status) return;
    if (status.status === 'completed') {
      setSchritt('fertig');
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
    } else if (status.status === 'failed') {
      setSchritt('fehler');
      setFehler(status.error || 'Aktualisierung fehlgeschlagen');
    }
  }, [status, schritt, qc]);

  const zuruecksetzen = () => {
    setPaket(null);
    setSignatur(null);
    setFortschritt(0);
    setGeprueft(null);
    setFehler('');
    setSchritt('ruhe');
  };

  const hochladen = async () => {
    if (!paket || !signatur) {
      setFehler('Paket und Signaturdatei werden beide gebraucht');
      return;
    }
    setSchritt('laedt hoch');
    setFehler('');
    setFortschritt(0);

    const daten = new FormData();
    daten.append('file', paket);
    daten.append('signature', signatur);

    try {
      // XMLHttpRequest und nicht `useApi`: nur er meldet den Fortschritt eines
      // Uploads, und ein Paket ist hier bis zu zwei Gigabyte groß.
      const xhr = new XMLHttpRequest();
      const token = getValidToken();
      await new Promise<void>((fertig, scheitern) => {
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) setFortschritt(Math.round((e.loaded * 100) / e.total));
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setGeprueft(JSON.parse(xhr.responseText));
            setSchritt('geprueft');
            setFortschritt(100);
            fertig();
          } else {
            let meldung = 'Upload fehlgeschlagen';
            try {
              const koerper = JSON.parse(xhr.responseText);
              meldung = koerper?.error?.message || koerper?.error || meldung;
            } catch {
              /* Antwort ohne JSON: die allgemeine Meldung bleibt stehen. */
            }
            scheitern(new Error(meldung));
          }
        });
        xhr.addEventListener('error', () => scheitern(new Error('Netzwerkfehler beim Upload')));
        xhr.open('POST', `${API_BASE}/update/upload`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        const csrf = getCsrfToken();
        if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
        xhr.send(daten);
      });
    } catch (err: unknown) {
      setSchritt('fehler');
      setFehler(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
      setFortschritt(0);
    }
  };

  const vomStick = async (stick: UsbDevice) => {
    setSchritt('laedt hoch');
    setFortschritt(50);
    setFehler('');
    try {
      const daten = await api.post<ValidationResult>(
        '/update/install-from-usb',
        { file_path: stick.path },
        { showError: false }
      );
      setGeprueft(daten);
      setSchritt('geprueft');
      setFortschritt(100);
    } catch (err: unknown) {
      setSchritt('fehler');
      setFehler((err as { message?: string }).message || 'Das Paket vom Stick kam nicht durch');
      setFortschritt(0);
    }
  };

  const einspielen = async () => {
    if (!geprueft?.file_path) {
      setFehler('Kein geprüftes Paket da');
      return;
    }
    setSchritt('spielt ein');
    setFehler('');
    try {
      await api.post('/update/apply', { file_path: geprueft.file_path }, { showError: false });
    } catch (err: unknown) {
      setSchritt('fehler');
      setFehler(
        (err as { message?: string }).message || 'Die Aktualisierung ließ sich nicht starten'
      );
    }
  };

  const fassung = status?.fassung;
  const letztes = verlauf?.[0];

  return (
    <div className="animate-in fade-in" data-testid="update-seite">
      <PageHeader
        title="Aktualisierungen"
        description="Welche Fassung hier läuft, und wie eine neue hierher kommt."
      />

      <SectionList>
        <Section title="Diese Fassung" icon={<Package />}>
          <StatGrid>
            <StatTile
              label="Fassung"
              value={fassung?.anzeige ?? '—'}
              note={
                fassung?.bekannt === false
                  ? 'Dieses Gerät kennt seine Fassung nicht. Sie kommt aus dem Bau; ohne sie lässt sich nicht entscheiden, ob ein Paket neuer ist.'
                  : 'Aus dem Bau (Tag oder Datum plus Kurz-SHA).'
              }
            />
            <StatTile
              label="Bau"
              value={info?.build_hash ? info.build_hash.substring(0, 7) : '—'}
            />
            <StatTile label="JetPack" value={info?.jetpack_version || '—'} />
            <StatTile
              label="Letzte Aktualisierung"
              value={letztes ? formatDate(letztes.started_at || letztes.timestamp || '') : 'keine'}
              note={letztes ? `${letztes.version_from} auf ${letztes.version_to}` : undefined}
            />
          </StatGrid>
        </Section>

        {!einspielenMoeglich ? (
          /*
           * DER EHRLICHE FALL, und am Orin der Normalfall. Ein Paket
           * einzuspielen heißt, Images zu laden und Container neu zu starten;
           * dafür braucht das Backend ein `docker`-Programm, und in seinem
           * Image gibt es keines. Statt eines Knopfes, der das erst nach dem
           * Hochladen von zwei Gigabyte sagt, steht hier der Satz des Geräts.
           */
          <Section title="Einspielen über diese Seite" icon={<AlertCircle />}>
            <p className="text-sm text-muted-foreground" data-testid="einspielen-nicht-moeglich">
              {status?.einspielenGrund ??
                'Dieses Gerät kann ein Paket nicht über die Schnittstelle einspielen.'}
            </p>
          </Section>
        ) : (
          <>
            {schritt === 'ruhe' && (
              <Section
                title="Paket auf einem USB-Stick"
                icon={<HardDrive />}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void sucheSticks()}
                    disabled={sucht}
                    className="h-7 w-7 p-0"
                    aria-label="Noch einmal suchen"
                  >
                    <RefreshCw className={cn('size-3.5', sucht && 'animate-spin')} />
                  </Button>
                }
              >
                {sticks && sticks.length > 0 ? (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {sticks.map(stick => (
                      <li
                        key={stick.path}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground">
                            {stick.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {stick.device} · {formatBytes(stick.size)}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => void vomStick(stick)}
                        >
                          Übernehmen
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={<HardDrive />}
                    title={sucht ? 'Sucht …' : 'Kein Stick mit einem Paket'}
                    description={sucht ? undefined : 'Stick anstecken und noch einmal suchen.'}
                  />
                )}
              </Section>
            )}

            <Section title="Paket einspielen" icon={<Package />}>
              {schritt === 'ruhe' && (
                <div className="flex flex-col gap-3">
                  <label
                    htmlFor="update-file"
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 transition-colors hover:bg-muted/30"
                  >
                    <Package className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {paket ? paket.name : '.araupdate Datei auswählen'}
                    </span>
                  </label>
                  <input
                    id="update-file"
                    type="file"
                    accept=".araupdate"
                    className="hidden"
                    onChange={e => {
                      const datei = e.target.files?.[0];
                      if (datei && datei.name.endsWith('.araupdate')) {
                        setPaket(datei);
                        setFehler('');
                        setGeprueft(null);
                      } else {
                        setPaket(null);
                        setFehler('Das ist keine .araupdate Datei');
                      }
                    }}
                  />

                  <label
                    htmlFor="signature-file"
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 transition-colors hover:bg-muted/30"
                  >
                    <Lock className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {signatur ? signatur.name : '.sig Signaturdatei auswählen (erforderlich)'}
                    </span>
                  </label>
                  <input
                    id="signature-file"
                    type="file"
                    accept=".sig"
                    className="hidden"
                    onChange={e => {
                      const datei = e.target.files?.[0];
                      if (datei && datei.name.endsWith('.sig')) {
                        setSignatur(datei);
                      } else {
                        setSignatur(null);
                        setFehler('Das ist keine .sig Signaturdatei');
                      }
                    }}
                  />

                  {fehler && (
                    <p className="flex items-center gap-2 text-sm text-foreground">
                      <AlertCircle className="size-4 shrink-0" />
                      {fehler}
                    </p>
                  )}

                  <Button onClick={() => void hochladen()} disabled={!paket || !signatur}>
                    Hochladen und prüfen
                  </Button>
                </div>
              )}

              {schritt === 'laedt hoch' && (
                <div className="py-6">
                  <p className="mb-3 text-sm text-muted-foreground">Lädt hoch …</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${fortschritt}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{fortschritt}%</p>
                </div>
              )}

              {schritt === 'geprueft' && geprueft && (
                <div className="space-y-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckCircle className="size-4 text-primary" />
                    Das Paket ist geprüft: Signatur und Manifest stimmen.
                  </p>
                  <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                    <li className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Fassung</span>
                      <span className="font-medium text-foreground">{geprueft.version}</span>
                    </li>
                    {geprueft.size != null && (
                      <li className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                        <span className="text-xs text-muted-foreground">Größe</span>
                        <span className="text-foreground">{formatBytes(geprueft.size)}</span>
                      </li>
                    )}
                    <li className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Teile</span>
                      <span className="text-foreground">{geprueft.components?.length ?? 0}</span>
                    </li>
                    <li className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Neustart nötig</span>
                      <span className="text-foreground">
                        {geprueft.requires_reboot ? 'ja' : 'nein'}
                      </span>
                    </li>
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => void einspielen()} className="flex-1">
                      Einspielen
                    </Button>
                    <Button variant="outline" onClick={zuruecksetzen} className="flex-1">
                      Abbrechen
                    </Button>
                  </div>
                </div>
              )}

              {schritt === 'spielt ein' && (
                <div className="space-y-4 py-6">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Settings className="size-4 animate-spin text-primary" />
                    Wird eingespielt …
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-full animate-pulse rounded-full bg-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {statusUnerreichbar
                      ? 'Verbindung weg. Das ist erwartbar: das Gerät startet sich gerade selbst neu. Diese Seite bitte offen lassen.'
                      : 'Diese Seite bitte nicht schließen und das Gerät nicht ausschalten.'}
                  </p>
                  {status?.startTime && (
                    <p className="text-xs text-muted-foreground">
                      Gestartet: {formatDate(status.startTime)}
                    </p>
                  )}
                </div>
              )}

              {schritt === 'fertig' && (
                <div className="space-y-3 py-6 text-center">
                  <CheckCircle className="mx-auto size-8 text-primary" />
                  <p className="text-sm font-semibold text-foreground">
                    Eingespielt. Das Gerät läuft jetzt auf {geprueft?.version}.
                  </p>
                  {geprueft?.requires_reboot && (
                    <p className="text-xs text-muted-foreground">
                      Dieses Paket verlangt einen Neustart des Geräts.
                    </p>
                  )}
                  <Button variant="outline" size="sm" onClick={zuruecksetzen}>
                    Weiteres Paket
                  </Button>
                </div>
              )}

              {schritt === 'fehler' && (
                <div className="space-y-3 py-6 text-center">
                  <XCircle className="mx-auto size-8 text-foreground" />
                  <p className="text-sm font-semibold text-foreground">Nicht eingespielt</p>
                  <p className="text-sm text-muted-foreground">{fehler}</p>
                  <Button variant="outline" size="sm" onClick={zuruecksetzen}>
                    Noch einmal
                  </Button>
                </div>
              )}
            </Section>
          </>
        )}

        <Section title="Verlauf" icon={<RefreshCw />}>
          {!verlauf || verlauf.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="verlauf-leer">
              Auf diesem Gerät ist noch nichts eingespielt worden.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {verlauf.map(eintrag => (
                <li key={eintrag.id} className="px-4 py-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {eintrag.version_from} auf {eintrag.version_to}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {VERLAUF_STATUS[eintrag.status] ?? eintrag.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatDate(eintrag.started_at || eintrag.timestamp || '')}</span>
                    <span>{eintrag.source === 'usb' ? 'USB' : eintrag.source}</span>
                    {eintrag.duration_seconds != null && (
                      <span>{Math.round(eintrag.duration_seconds / 60)} min</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </SectionList>
    </div>
  );
};

export default UpdatePage;
