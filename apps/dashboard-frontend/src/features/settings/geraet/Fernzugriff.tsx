/**
 * Fernzugriff: ein Schalter und die Adresse, unter der das Gerät von
 * unterwegs erreichbar ist (M5, `frontend.md`, Gerät).
 *
 * Bis M5 war das eine eigene Seite mit einem Assistenten aus drei Schritten,
 * IP, DNS-Name, Tailnet, Fassung von Tailscale, der Liste aller Geräte im Netz
 * und einem SSH-Befehl, alles gleichrangig. Ein Administrator hat genau zwei
 * Fragen: ist es an, und wie heißt die Adresse. Der Rest steht unter
 * „Technik", aufgeklappt.
 *
 * EINSCHALTEN IST EIN DIALOG, AUSSCHALTEN EINE BESTÄTIGUNG. Einschalten
 * braucht einmal einen Schlüssel aus dem Konto bei Tailscale (und auf einem
 * Gerät ohne Tailscale vorher die Installation); das gehört in einen Dialog,
 * nicht als Dauerformular auf die Seite. Ausschalten fragt nach und warnt
 * ausdrücklich, wenn diese Sitzung selbst über den Fernzugriff läuft
 * (`sitzungUeberFernzugriff.ts`): danach ist die Seite weg.
 *
 * Das Gerätezertifikat (vorher Bereich „Sicherheit") steht bei den Adressen:
 * es ist die Antwort auf die Warnung des Browsers, im Firmennetz wie
 * unterwegs, und wer die Adresse weitergibt, gibt die Datei mit.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Copy, Download, ExternalLink, Globe, Loader2 } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialogform,
  Feldgruppe,
  Input,
  Label,
  Switch,
  cn,
} from '@marken';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import useConfirm from '@/hooks/useConfirm';
import { fehlertext } from '@/utils/fehlertext';
import { sitzungLaeuftUeberFernzugriff, trennFrage } from './sitzungUeberFernzugriff';

interface Peer {
  id: string;
  hostname: string;
  dnsName: string;
  ip: string;
  os: string;
  online: boolean;
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
  /**
   * Gesetzt, wenn das Backend den Zustand gerade NICHT abfragen konnte. Das
   * heißt nicht „nicht installiert": der zuletzt bekannte Zustand bleibt
   * stehen, statt auf „aus" zu fallen.
   */
  detectionError?: boolean;
}

const STATUS_KEY = ['tailscale', 'status'] as const;

/** Der Zustand des Fernzugriffs; ein Abfragefehler hält den letzten bekannten. */
function useFernzugriff() {
  const api = useApi();
  const letzter = useRef<TailscaleStatus | null>(null);
  const abfrage = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api.get<TailscaleStatus>('/tailscale/status', { showError: false }),
    refetchInterval: 30_000,
    retry: false,
  });
  const frisch = abfrage.data && !abfrage.data.detectionError ? abfrage.data : null;
  if (frisch) letzter.current = frisch;
  const unsicher = abfrage.isError || abfrage.data?.detectionError === true;
  return { status: frisch ?? letzter.current, unsicher, laedt: abfrage.isPending };
}

/** Die Adresse im Firmennetz (mDNS-Name), falls das Gerät eine nennt. */
function useFirmennetzName() {
  const api = useApi();
  return useQuery({
    queryKey: ['system', 'network'],
    queryFn: () => api.get<{ mdns?: string }>('/system/network', { showError: false }),
    select: d => d.mdns ?? null,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function Fernzugriff() {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { status, unsicher, laedt } = useFernzugriff();
  const { data: lanName } = useFirmennetzName();
  const [einschalten, setEinschalten] = useState(false);
  const [schaltet, setSchaltet] = useState(false);
  const [offen, setOffen] = useState(false);

  const an = status?.connected === true;
  const adresse = status?.dnsName ? `https://${status.dnsName}` : null;

  const ausschalten = async () => {
    const ueberFernzugriff = sitzungLaeuftUeberFernzugriff(
      typeof window === 'undefined' ? '' : window.location.hostname,
      status
    );
    const frage = trennFrage(ueberFernzugriff);
    const ok = await confirm({ ...frage, confirmVariant: 'warning' });
    if (!ok) return;
    setSchaltet(true);
    try {
      await api.post('/tailscale/disconnect', null, { showError: false });
      toast.success('Der Fernzugriff ist aus.');
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      toast.error(fehlertext(e.message, e.status));
    } finally {
      setSchaltet(false);
      void qc.invalidateQueries({ queryKey: STATUS_KEY });
    }
  };

  return (
    <Feldgruppe
      titel="Fernzugriff"
      symbol={<Globe />}
      aktion={
        <span className="flex items-center gap-2">
          {schaltet && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={an}
            disabled={laedt || schaltet}
            aria-label="Fernzugriff"
            data-testid="fernzugriff-schalter"
            onCheckedChange={wert => {
              if (wert) setEinschalten(true);
              else void ausschalten();
            }}
          />
        </span>
      }
    >
      {ConfirmDialog}
      <div className="flex flex-col gap-3" data-abschnitt="fernzugriff" data-testid="fernzugriff">
        {laedt && !status ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : an && adresse ? (
          <AdresseZeile
            beschriftung="Unterwegs"
            adresse={adresse}
            kennzeichen="fernzugriff-adresse"
          />
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="fernzugriff-aus">
            Aus. Das Gerät ist nur im Firmennetz erreichbar.
          </p>
        )}
        {lanName && (
          <AdresseZeile
            beschriftung="Im Firmennetz"
            adresse={`https://${lanName}`}
            kennzeichen="fernzugriff-firmennetz"
          />
        )}
        {unsicher && status && (
          <p className="text-xs text-muted-foreground" data-testid="fernzugriff-unsicher">
            Der Zustand ließ sich gerade nicht abfragen; hier steht der zuletzt bekannte.
          </p>
        )}
        <Zertifikat />

        <Collapsible open={offen} onOpenChange={setOffen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2"
              data-testid="fernzugriff-technik-knopf"
            >
              <ChevronDown
                className={cn('size-4 transition-transform', offen && 'rotate-180')}
                aria-hidden="true"
              />
              Technische Angaben
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Technik status={status} />
          </CollapsibleContent>
        </Collapsible>
      </div>

      <Einschalten
        offen={einschalten}
        status={status}
        beiSchliessen={() => setEinschalten(false)}
        beiFertig={() => {
          setEinschalten(false);
          void qc.invalidateQueries({ queryKey: STATUS_KEY });
        }}
      />
    </Feldgruppe>
  );
}

function AdresseZeile({
  beschriftung,
  adresse,
  kennzeichen,
}: {
  beschriftung: string;
  adresse: string;
  kennzeichen: string;
}) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{beschriftung}</span>
      <a
        href={adresse}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 truncate font-mono text-sm text-primary hover:underline"
        data-testid={kennzeichen}
      >
        {adresse}
      </a>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        aria-label={`${beschriftung}: Adresse kopieren`}
        onClick={() => {
          void navigator.clipboard
            .writeText(adresse)
            .then(() => {
              setKopiert(true);
              setTimeout(() => setKopiert(false), 2000);
            })
            .catch(() => undefined);
        }}
      >
        {kopiert ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

/**
 * Das Gerätezertifikat herunterladen: die Antwort auf die Warnung, die jeder
 * beim ersten Aufruf sieht. Der Administrator verteilt die Datei einmal auf
 * die Rechner der Firma; danach ist Ruhe, auch nach einer Erneuerung.
 */
function Zertifikat() {
  const api = useApi();
  const toast = useToast();
  const [laedt, setLaedt] = useState(false);
  const laden = async () => {
    setLaedt(true);
    try {
      const res = await api.get<Response>('/system/ca-zertifikat', { raw: true, showError: false });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'arasul-ca.crt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      toast.error(
        (err as { status?: number }).status === 404
          ? 'Dieses Gerät hat noch kein Zertifikat.'
          : 'Das Zertifikat ließ sich nicht laden.'
      );
    } finally {
      setLaedt(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-xs text-muted-foreground">
        Damit der Browser beide Adressen ohne Warnung öffnet, das Zertifikat einmal auf den Rechnern
        der Firma installieren.
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void laden()}
        disabled={laedt}
        data-testid="zertifikat-laden"
      >
        <Download className="size-3.5" aria-hidden="true" />
        Zertifikat herunterladen
      </Button>
    </div>
  );
}

/** Was der Betreuer am Telefon fragt; nur aufgeklappt. */
function Technik({ status }: { status: TailscaleStatus | null }) {
  if (!status) {
    return <p className="mt-2 text-sm text-muted-foreground">Keine Angaben.</p>;
  }
  const zeilen: [string, string | null][] = [
    ['Dienst', status.installed ? `Tailscale ${status.version ?? ''}`.trim() : 'nicht installiert'],
    ['Name im Tailnet', status.dnsName],
    ['Tailnet', status.tailnet],
    ['IP', status.ip],
    ['SSH', status.ip ? `ssh arasul@${status.ip}` : null],
  ];
  return (
    <div className="mt-2 flex flex-col gap-3" data-testid="fernzugriff-technik">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {zeilen.map(([b, w]) => (
          <div key={b} className="contents">
            <dt className="text-muted-foreground">{b}</dt>
            <dd className="min-w-0 break-all font-mono text-foreground">{w || '—'}</dd>
          </div>
        ))}
      </dl>
      {status.peers.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            Geräte im Tailnet ({status.peers.filter(p => p.online).length} erreichbar)
          </p>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {status.peers.map(p => (
              <li
                key={p.id || p.hostname}
                className="flex items-center justify-between gap-3 px-3 py-1.5"
              >
                <span className="min-w-0 truncate text-foreground">{p.hostname || p.dnsName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {p.online ? 'erreichbar' : 'nicht erreichbar'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Einschalten: auf einem Gerät ohne Tailscale erst installieren, dann den
 * Schlüssel aus dem Konto bei Tailscale einfügen und verbinden.
 */
function Einschalten({
  offen,
  status,
  beiSchliessen,
  beiFertig,
}: {
  offen: boolean;
  status: TailscaleStatus | null;
  beiSchliessen: () => void;
  beiFertig: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const [schluessel, setSchluessel] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const installiert = status?.installed === true;

  useEffect(() => {
    if (!offen) {
      setSchluessel('');
      setFehler(null);
    }
  }, [offen]);

  const installieren = async () => {
    setArbeitet(true);
    setFehler(null);
    try {
      await api.post('/tailscale/install', null, {
        showError: false,
        signal: AbortSignal.timeout(180_000),
      });
      await qc.invalidateQueries({ queryKey: STATUS_KEY });
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      setFehler(fehlertext(e.message, e.status));
    } finally {
      setArbeitet(false);
    }
  };

  const verbinden = async () => {
    setArbeitet(true);
    setFehler(null);
    try {
      await api.post(
        '/tailscale/connect',
        { authKey: schluessel.trim() },
        { showError: false, signal: AbortSignal.timeout(60_000) }
      );
      toast.success('Der Fernzugriff ist an.');
      beiFertig();
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      setFehler(fehlertext(e.message, e.status));
    } finally {
      setArbeitet(false);
    }
  };

  return (
    <Dialogform
      offen={offen}
      beiSchliessen={beiSchliessen}
      titel="Fernzugriff einschalten"
      schliesstBeiKlickDaneben={false}
      fuss={
        <>
          <Button variant="ghost" onClick={beiSchliessen} disabled={arbeitet}>
            Abbrechen
          </Button>
          {installiert ? (
            <Button
              onClick={() => void verbinden()}
              disabled={arbeitet || schluessel.trim().length === 0}
              loading={arbeitet}
              data-testid="fernzugriff-verbinden"
            >
              Einschalten
            </Button>
          ) : (
            <Button onClick={() => void installieren()} loading={arbeitet}>
              Installieren
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm" data-testid="fernzugriff-dialog">
        {!installiert ? (
          <p className="text-muted-foreground">
            Der Fernzugriff läuft über Tailscale. Das Gerät installiert es einmal selbst; das dauert
            ein bis zwei Minuten und braucht eine Verbindung ins Internet.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">
              Der Fernzugriff läuft über Tailscale. Legen Sie in Ihrem Konto dort einen Schlüssel an
              und fügen Sie ihn hier ein.
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                <a
                  href="https://login.tailscale.com/admin/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Tailscale öffnen <ExternalLink className="size-3" aria-hidden="true" />
                </a>{' '}
                (ein Konto anlegen, falls es keines gibt)
              </li>
              <li>„Generate auth key“ wählen, „Reusable“ anhaken, erzeugen</li>
              <li>Den Schlüssel kopieren und unten einfügen</li>
            </ol>
            <div>
              <Label htmlFor="fernzugriff-schluessel" className="mb-1.5 block text-sm font-medium">
                Schlüssel
              </Label>
              <Input
                id="fernzugriff-schluessel"
                type="password"
                value={schluessel}
                onChange={e => setSchluessel(e.target.value)}
                placeholder="tskey-auth-…"
                className="font-mono"
                autoComplete="off"
              />
            </div>
          </>
        )}
        {fehler && (
          <Alert variant="destructive">
            <AlertDescription>{fehler}</AlertDescription>
          </Alert>
        )}
      </div>
    </Dialogform>
  );
}
