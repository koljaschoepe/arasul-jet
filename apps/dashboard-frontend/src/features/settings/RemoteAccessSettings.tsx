import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wifi,
  WifiOff,
  Monitor,
  Smartphone,
  Laptop,
  Server,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronUp,
  Download,
  Loader2,
} from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { Kopf } from '@marken';
import { Alert, AlertDescription, Button, cn } from '@marken';
import { SkeletonCard } from '../../components/ui/Skeleton';
import useConfirm from '../../hooks/useConfirm';
import { sitzungLaeuftUeberFernzugriff, trennFrage } from './sitzungUeberFernzugriff';
import { Feldgruppe, Formularseite } from '@marken';

interface Peer {
  id: string;
  hostname: string;
  dnsName: string;
  ip: string;
  os: string;
  online: boolean;
  lastSeen: string | null;
}

export interface TailscaleStatus {
  installed: boolean;
  running: boolean;
  connected: boolean;
  ip: string | null;
  hostname: string | null;
  dnsName: string | null;
  tailnet: string | null;
  version: string | null;
  peers: Peer[];
  /**
   * Set by the backend when the host status probe could NOT be run (helper
   * image not pullable, docker-proxy unreachable, exec error/timeout). This is
   * NOT "not installed" — treat it as a transient/retryable detection error and
   * keep the last-known status rather than dropping to step 1.
   */
  detectionError?: boolean;
}

const OS_ICONS: Record<string, typeof Monitor> = {
  linux: Server,
  windows: Monitor,
  macOS: Laptop,
  iOS: Smartphone,
  android: Smartphone,
};

/** „Fertig". Kein Schritt, den man noch vor sich hat, sondern der Zustand danach. */
export const LETZTER_SCHRITT = 3;

/**
 * Ist dieser Schritt abgehakt?
 *
 * Bis Plan 023 C6 hiess das schlicht `n < currentStep`. Damit stand der letzte
 * Schritt „Fertig" als offene Nummer da, waehrend die Verbindung nachweislich
 * stand (Befund F-26): der Assistent widersprach dem, was einen Absatz weiter
 * unten auf demselben Bildschirm zu lesen war. „Fertig" ist kein Schritt, den
 * man noch vor sich hat, sondern der Zustand danach.
 */
export function istErledigt(n: number, currentStep: number): boolean {
  if (currentStep === LETZTER_SCHRITT) return n <= LETZTER_SCHRITT;
  return n < currentStep;
}

/**
 * Aktueller Schritt im Assistenten: installieren, verbinden, fertig.
 *
 * Zwischen „verbinden" und „fertig" standen bis zum 28.08.2026 zwei weitere
 * Schritte: HTTPS-Zertifikate im Tailnet freischalten und danach `tailscale
 * serve` einschalten, damit der Tailscale-Name ein browser-vertrautes Schloss
 * bekommt. Beide sind gefallen, und der Grund ist eine Messung am Orin: mit
 * aktivem `serve` bindet tailscaled `100.x.y.z:443`, danach bekommt Traefik
 * `0.0.0.0:443` nicht mehr, der reverse-proxy startet nicht -- und das Geraet
 * ist im EIGENEN Firmennetz nicht mehr erreichbar. Ein Knopf, der die
 * Oberflaeche abschaltet, gehoert nicht in die Oberflaeche.
 *
 * Das vertraute Schloss kommt seit Phase C10 fuer BEIDE Netze aus derselben
 * Quelle: der Geraete-CA, die der Admin einmal verteilt
 * (docs/ops/NETZNAME_UND_ZERTIFIKAT.md). Traefik antwortet auch auf der
 * Tailscale-Adresse.
 */
export function getStep(status: TailscaleStatus | null): number {
  if (!status || !status.installed) return 1;
  if (!status.connected) return 2;
  return 3;
}

// sessionStorage for instant tab-switch rendering
const SS_KEY = 'arasul_tailscale_status';

function getCachedStatus(): TailscaleStatus | null {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedStatus(data: TailscaleStatus) {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(data));
  } catch {
    /* */
  }
}

export function RemoteAccessSettings() {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const initialCache = getCachedStatus();
  const [status, setStatus] = useState<TailscaleStatus | null>(initialCache);
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  // Transient/detection error (probe couldn't run, network blip). Distinct from
  // a genuine installed:false — we keep the last-known status and offer a retry.
  const [statusError, setStatusError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [authKey, setAuthKey] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  // "So erreichst du Arasul" card: der echte LAN-Name aus /system/network.
  const [lanName, setLanName] = useState<string | null>(null);

  // Use ref for status so callbacks don't need it as a dependency
  const statusRef = useRef(status);
  statusRef.current = status;

  const updateStatus = useCallback((data: TailscaleStatus) => {
    setStatus(data);
    setCachedStatus(data);
  }, []);

  const loadStatus = useCallback(
    async (signal?: AbortSignal) => {
      setRefreshing(true);
      try {
        const data = await api.get<TailscaleStatus>('/tailscale/status', {
          showError: false,
          signal,
        });
        if (signal?.aborted) return;
        if (data.detectionError) {
          // Backend could not run the host probe. This is NOT "not installed" —
          // keep whatever we last knew and surface a retryable inline error so
          // we don't hide the access card / drop the user to step 1.
          setStatusError(
            'Der Tailscale-Status konnte gerade nicht vom Gerät abgefragt werden. ' +
              'Es wird der zuletzt bekannte Zustand angezeigt.'
          );
          return;
        }
        setStatusError(null);
        updateStatus(data);
      } catch {
        if (signal?.aborted) return;
        // Transient fetch failure (network/timeout/backend down). Treat exactly
        // like a detection error: DO NOT synthesize an installed:false status
        // (that is indistinguishable from genuinely uninstalled and hides the
        // access card). Keep the last-known status and offer a retry.
        setStatusError(
          'Verbindung zum Gerät fehlgeschlagen. Der Tailscale-Status konnte nicht aktualisiert werden.'
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [api, updateStatus]
  );

  // Der Name, unter dem das Geraet im Firmennetz erreichbar ist. Er ist
  // praktisch unveraenderlich und wird deshalb getrennt vom 30-Sekunden-Takt
  // des Statusabrufs geholt.
  const loadAccessInfo = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const net = await api.get<{ mdns: string }>('/system/network', {
          showError: false,
          signal,
        });
        if (!signal?.aborted && net?.mdns) setLanName(net.mdns);
      } catch {
        /* LAN name is a nice-to-have; ignore failures */
      }
    },
    [api]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadStatus(controller.signal);
    loadAccessInfo(controller.signal);
    const interval = setInterval(() => loadStatus(controller.signal), 30000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [loadStatus, loadAccessInfo]);

  const handleInstall = async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      // 3 minute timeout — install downloads and runs a script on the host
      await api.post('/tailscale/install', null, {
        showError: false,
        signal: AbortSignal.timeout(180_000),
      });
      toast.success('Tailscale erfolgreich installiert!');
      await loadStatus();
    } catch (err: unknown) {
      const e = err as { message?: string };
      const msg = e.message || 'Installation fehlgeschlagen';
      setInstallError(msg);
      toast.error(msg);
    } finally {
      setInstalling(false);
    }
  };

  const handleConnect = async () => {
    if (!authKey.trim()) return;
    setConnecting(true);
    try {
      const data = await api.post<TailscaleStatus>(
        '/tailscale/connect',
        { authKey: authKey.trim() },
        {
          showError: false,
          signal: AbortSignal.timeout(60_000),
        }
      );
      updateStatus(data);
      setAuthKey('');
      loadAccessInfo();
      toast.success('Tailscale verbunden!');
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e.message || 'Verbindung fehlgeschlagen');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    // Plan 023 J5: „Trennen" kappte sofort, ohne zu fragen. Wer gerade ÜBER
    // diese Verbindung angemeldet ist, kappte damit die Leitung unter sich
    // selbst weg und kam nur noch im lokalen Netz wieder heran.
    const ueberFernzugriff = sitzungLaeuftUeberFernzugriff(
      typeof window === 'undefined' ? '' : window.location.hostname,
      status
    );
    const ok = await confirm(trennFrage(ueberFernzugriff));
    if (!ok) {
      return;
    }
    setDisconnecting(true);
    try {
      await api.post('/tailscale/disconnect', null, { showError: false });
      toast.success('Tailscale getrennt');
      await loadStatus();
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e.message || 'Trennung fehlgeschlagen');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRefresh = () => {
    loadStatus();
    loadAccessInfo();
  };

  const copyValue = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      /* Clipboard unavailable */
    }
  };

  if (loading) {
    return (
      <div className="animate-in fade-in">
        <Kopf titel="Fernzugriff" />
        <SkeletonCard hasAvatar={false} lines={3} />
      </div>
    );
  }

  // Detection failure with no last-known status to fall back on: show a
  // retryable error instead of the step-1 install flow — otherwise "couldn't
  // check" would look identical to "Tailscale not installed".
  if (statusError && !status) {
    return (
      <div className="animate-in fade-in">
        <Kopf
          titel="Fernzugriff"
          beschreibung="Greife sicher von überall auf dein Gerät zu, über Tailscale VPN."
        />
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription className="space-y-3">
            <p>{statusError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8"
            >
              <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const currentStep = getStep(status);
  const erledigt = (n: number) => istErledigt(n, currentStep);

  return (
    <div className="animate-in fade-in">
      {ConfirmDialog}
      <Kopf
        titel="Fernzugriff"
        beschreibung="Greife sicher von überall auf dein Gerät zu, über Tailscale VPN."
        aktionen={
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8"
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </Button>
        }
      />

      {/* Transient detection error — status shown below is the last-known one */}
      {statusError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{statusError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-7 shrink-0"
            >
              <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Step Indicator */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mb-8">
        {[
          { n: 1, label: 'Installation' },
          { n: 2, label: 'Verbinden' },
          { n: 3, label: 'Fertig' },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center gap-2">
            {i > 0 && (
              <div className={cn('h-px w-6', n <= currentStep ? 'bg-foreground' : 'bg-border')} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'size-5 rounded-full flex items-center justify-center text-xs font-medium',
                  erledigt(n)
                    ? 'bg-foreground text-background'
                    : n === currentStep
                      ? 'border-2 border-foreground font-semibold text-foreground'
                      : 'border border-border text-muted-foreground'
                )}
                aria-hidden="true"
              >
                {erledigt(n) ? <Check className="size-3" /> : n}
              </div>
              <span
                className={cn(
                  'text-xs',
                  n <= currentStep ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}
              >
                {label}
                <span className="sr-only">
                  {erledigt(n)
                    ? ', erledigt'
                    : n === currentStep
                      ? ', dieser Schritt ist dran'
                      : ', offen'}
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <Formularseite>
        {/* Step 1: Installation */}
        {currentStep === 1 && (
          <Feldgruppe
            titel="Schritt 1: Tailscale installieren"
            beschreibung={
              installing || installError
                ? undefined
                : 'Tailscale wird direkt auf deinem Gerät installiert. Die Installation dauert ein bis zwei Minuten und benötigt eine Internetverbindung.'
            }
          >
            <div className="space-y-4">
              {installing && (
                <div className="border border-border/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="size-4 text-primary animate-spin" />
                    <span className="text-sm font-medium text-foreground">
                      Tailscale wird installiert...
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-7">
                    Das Installations-Script wird heruntergeladen und ausgeführt. Dies kann bis zu 2
                    Minuten dauern.
                  </p>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden ml-7">
                    <div className="h-full bg-primary rounded-full animate-pulse w-full" />
                  </div>
                </div>
              )}

              {installError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription className="space-y-2">
                    <p>{installError}</p>
                    <p className="text-xs opacity-80">
                      Falls die automatische Installation nicht funktioniert, kannst du Tailscale
                      manuell per SSH installieren:
                    </p>
                    <code className="block text-xs px-2 py-1.5 rounded border border-border bg-muted/30 font-mono">
                      curl -fsSL https://tailscale.com/install.sh | sudo sh
                    </code>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button onClick={handleInstall} disabled={installing}>
                  {installing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Wird installiert...
                    </>
                  ) : installError ? (
                    <>
                      <RefreshCw className="size-4" />
                      Erneut versuchen
                    </>
                  ) : (
                    <>
                      <Download className="size-4" />
                      Tailscale installieren
                    </>
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-9">
                  <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                  Status prüfen
                </Button>
              </div>
            </div>
          </Feldgruppe>
        )}

        {/* Step 2: Auth-Key & Connect */}
        {currentStep === 2 && (
          <Feldgruppe
            titel="Schritt 2: Mit Tailscale verbinden"
            beschreibung={
              <>
                Tailscale ist installiert{status?.version ? ` (v${status.version})` : ''}. Erstelle
                einen Auth-Key in deinem{' '}
                <a
                  href="https://login.tailscale.com/admin/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Tailscale Admin-Panel <ExternalLink className="size-3" />
                </a>{' '}
                und füge ihn hier ein.
              </>
            }
          >
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={authKey}
                  onChange={e => setAuthKey(e.target.value)}
                  placeholder="tskey-auth-..."
                  className="flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                />
                <Button onClick={handleConnect} disabled={connecting || !authKey.trim()}>
                  {connecting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Verbinden...
                    </>
                  ) : (
                    <>
                      <Wifi className="size-4" />
                      Verbinden
                    </>
                  )}
                </Button>
              </div>

              {!showGuide && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowGuide(true)}
                >
                  Wo bekomme ich einen Auth-Key?
                </button>
              )}

              {showGuide && (
                <div className="border border-border/50 rounded-lg p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">Auth-Key erstellen:</span>
                    <button
                      type="button"
                      onClick={() => setShowGuide(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                  </div>
                  {[
                    <>
                      Öffne{' '}
                      <a
                        href="https://login.tailscale.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        login.tailscale.com
                      </a>{' '}
                      (Konto erstellen falls nötig)
                    </>,
                    <>
                      Gehe zu <strong>Settings → Keys → Generate auth key</strong>
                    </>,
                    <>
                      Wähle <strong>Reusable</strong> und klicke <strong>Generate key</strong>
                    </>,
                    'Kopiere den Key und füge ihn oben ein',
                  ].map((text, i) => (
                    <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="text-foreground font-medium shrink-0">{i + 1}.</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Feldgruppe>
        )}

        {/* Schritt 3: verbunden */}
        {currentStep === 3 && status && (
          <Formularseite>
            {/* Ein stabiler Name je Zusammenhang, die IP nur als Rueckfalltuer. */}
            <Feldgruppe titel="So erreichst du Arasul" symbol={<ExternalLink />}>
              <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                {lanName && (
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="text-xs text-muted-foreground shrink-0">Im LAN</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <a
                        href={`https://${lanName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono font-medium text-primary hover:underline truncate"
                      >
                        https://{lanName}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 shrink-0"
                        onClick={() => copyValue(`https://${lanName}`, 'lan')}
                      >
                        {copiedKey === 'lan' ? (
                          <Check className="size-3 text-success" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                {status.dnsName && (
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="text-xs text-muted-foreground shrink-0">Unterwegs</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <a
                        href={`https://${status.dnsName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono font-medium text-primary hover:underline truncate"
                      >
                        https://{status.dnsName}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 shrink-0"
                        onClick={() =>
                          status.dnsName && copyValue(`https://${status.dnsName}`, 'remote')
                        }
                      >
                        {copiedKey === 'remote' ? (
                          <Check className="size-3 text-success" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                {status.ip && (
                  <div className="flex items-center justify-between gap-2 px-4 py-2 text-muted-foreground">
                    <span className="text-[11px] shrink-0">Fallback (IP)</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-mono truncate">https://{status.ip}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 shrink-0"
                        onClick={() => status.ip && copyValue(`https://${status.ip}`, 'ip')}
                      >
                        {copiedKey === 'ip' ? (
                          <Check className="size-3 text-success" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              {status.dnsName && (
                <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                  <AlertCircle className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-[11px] text-muted-foreground">
                    Unterwegs antwortet dasselbe Gerät mit demselben Zertifikat wie im Firmennetz.
                    Damit der Browser es ohne Warnung annimmt, muss einmalig das{' '}
                    <strong className="font-medium text-foreground">Gerätezertifikat</strong>{' '}
                    verteilt sein: Einstellungen &gt; Sicherheit.
                  </p>
                </div>
              )}
            </Feldgruppe>

            <Feldgruppe
              titel="Verbunden"
              symbol={<Wifi />}
              aktion={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="h-7 text-xs"
                >
                  {disconnecting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <WifiOff className="size-3.5" />
                  )}
                  Trennen
                </Button>
              }
            >
              <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                {status.ip && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Tailscale IP</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-mono font-medium text-foreground">
                        {status.ip}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={() => status.ip && copyValue(status.ip, 'ip')}
                      >
                        {copiedKey === 'ip' ? (
                          <Check className="size-3 text-success" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                {status.dnsName && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">DNS</span>
                    <span className="text-sm text-foreground">{status.dnsName}</span>
                  </div>
                )}
                {status.tailnet && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Tailnet</span>
                    <span className="text-sm text-foreground">{status.tailnet}</span>
                  </div>
                )}
                {status.version && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Version</span>
                    <span className="text-sm text-foreground">{status.version}</span>
                  </div>
                )}
              </div>
            </Feldgruppe>

            {status.peers.length > 0 && (
              <Feldgruppe
                titel={`Geräte im Netzwerk (${status.peers.filter(p => p.online).length} online)`}
              >
                <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                  {status.peers.map(peer => {
                    const IconComponent = OS_ICONS[peer.os] || Monitor;
                    return (
                      <div
                        key={peer.id || peer.hostname}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <IconComponent className="size-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {peer.hostname || peer.dnsName}
                          </p>
                          {peer.ip && (
                            <p className="text-xs text-muted-foreground font-mono">{peer.ip}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{peer.os}</span>
                          <div
                            className={cn(
                              'size-2 rounded-full',
                              peer.online ? 'bg-success' : 'bg-muted-foreground/30'
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Feldgruppe>
            )}

            {/* Der Dashboard-Zugriff steht schon in der Karte darueber. */}
            {status.ip && (
              /* Ein Randhinweis, kein Abschnitt: er steht nicht auf derselben
                 Ebene wie "So erreichst du Arasul" und "Verbunden". */
              <div className="space-y-1 border-l-2 border-border pl-4">
                <p className="text-xs font-medium text-foreground">SSH-Zugriff:</p>
                <code className="rounded border border-border px-1 py-0.5 text-xs text-muted-foreground">
                  ssh arasul@{status.ip}
                </code>
              </div>
            )}
          </Formularseite>
        )}
      </Formularseite>
    </div>
  );
}
