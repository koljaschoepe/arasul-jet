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
import { Button } from '@/components/ui/shadcn/button';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { cn } from '@/lib/utils';

interface Peer {
  id: string;
  hostname: string;
  dnsName: string;
  ip: string;
  os: string;
  online: boolean;
  lastSeen: string | null;
}

interface TailscaleStatus {
  installed: boolean;
  running: boolean;
  connected: boolean;
  ip: string | null;
  hostname: string | null;
  dnsName: string | null;
  tailnet: string | null;
  version: string | null;
  peers: Peer[];
}

const OS_ICONS: Record<string, typeof Monitor> = {
  linux: Server,
  windows: Monitor,
  macOS: Laptop,
  iOS: Smartphone,
  android: Smartphone,
};

function getStep(status: TailscaleStatus | null): number {
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

  const initialCache = getCachedStatus();
  const [status, setStatus] = useState<TailscaleStatus | null>(initialCache);
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [authKey, setAuthKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

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
        updateStatus(data);
      } catch {
        if (signal?.aborted) return;
        // Only set empty status if we have NO data at all
        if (!statusRef.current) {
          setStatus({
            installed: false,
            running: false,
            connected: false,
            ip: null,
            hostname: null,
            dnsName: null,
            tailnet: null,
            version: null,
            peers: [],
          });
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [api, updateStatus]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadStatus(controller.signal);
    const interval = setInterval(() => loadStatus(controller.signal), 30000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [loadStatus]);

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
      const e = err as { data?: { error?: string; message?: string }; message?: string };
      const msg = e.data?.error || e.data?.message || e.message || 'Installation fehlgeschlagen';
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
      toast.success('Tailscale verbunden!');
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      toast.error(e.data?.error || e.message || 'Verbindung fehlgeschlagen');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post('/tailscale/disconnect', null, { showError: false });
      toast.success('Tailscale getrennt');
      await loadStatus();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      toast.error(e.data?.error || e.message || 'Trennung fehlgeschlagen');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRefresh = () => loadStatus();

  const copyIp = async () => {
    if (!status?.ip) return;
    try {
      await navigator.clipboard.writeText(status.ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard unavailable */
    }
  };

  if (loading) {
    return (
      <div className="animate-in fade-in">
        <div className="mb-8 pb-6 border-b border-border">
          <h1 className="text-2xl font-bold text-foreground mb-2">Fernzugriff</h1>
        </div>
        <SkeletonCard hasAvatar={false} lines={3} />
      </div>
    );
  }

  const currentStep = getStep(status);

  return (
    <div className="animate-in fade-in">
      <div className="mb-8 pb-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Fernzugriff</h1>
            <p className="text-sm text-muted-foreground">
              Greife sicher von überall auf dein Gerät zu — über Tailscale VPN.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8"
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { n: 1, label: 'Installation' },
          { n: 2, label: 'Verbinden' },
          { n: 3, label: 'Fertig' },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center gap-2">
            {i > 0 && (
              <div className={cn('h-px w-6', n <= currentStep ? 'bg-primary' : 'bg-border')} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'size-5 rounded-full flex items-center justify-center text-xs font-medium',
                  n < currentStep
                    ? 'bg-primary text-primary-foreground'
                    : n === currentStep
                      ? 'border-2 border-primary text-primary'
                      : 'border border-border text-muted-foreground'
                )}
              >
                {n < currentStep ? <Check className="size-3" /> : n}
              </div>
              <span
                className={cn(
                  'text-xs',
                  n <= currentStep ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-8">
        {/* Step 1: Installation */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">
              Schritt 1: Tailscale installieren
            </h3>

            {!installing && !installError && (
              <p className="text-sm text-muted-foreground">
                Tailscale wird direkt auf deinem Gerät installiert. Die Installation dauert ca. 1–2
                Minuten und benötigt eine Internetverbindung.
              </p>
            )}

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
        )}

        {/* Step 2: Auth-Key & Connect */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">
              Schritt 2: Mit Tailscale verbinden
            </h3>
            <p className="text-sm text-muted-foreground">
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
            </p>

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
        )}

        {/* Step 3: Connected */}
        {currentStep === 3 && status && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wifi className="size-4 text-primary" />
                  Verbunden
                </h3>
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
              </div>

              <div className="border border-border/50 rounded-lg divide-y divide-border/50">
                {status.ip && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Tailscale IP</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-mono font-medium text-foreground">
                        {status.ip}
                      </span>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={copyIp}>
                        {copied ? (
                          <Check className="size-3 text-primary" />
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
            </div>

            {/* Peers */}
            {status.peers.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Geräte im Netzwerk ({status.peers.filter(p => p.online).length} online)
                </h3>
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
                              peer.online ? 'bg-primary' : 'bg-muted-foreground/30'
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Access info */}
            <div className="border-l-2 border-primary/30 pl-4 space-y-1">
              <p className="text-xs font-medium text-foreground">Zugriff von anderen Geräten:</p>
              <p className="text-xs text-muted-foreground">
                Dashboard:{' '}
                <code className="px-1 py-0.5 rounded border border-border text-xs">
                  http://{status.ip}
                </code>
              </p>
              <p className="text-xs text-muted-foreground">
                SSH:{' '}
                <code className="px-1 py-0.5 rounded border border-border text-xs">
                  ssh arasul@{status.ip}
                </code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
