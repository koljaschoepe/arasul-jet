/**
 * Firmenordner: Ordnerbaum, Rechte je Person, letzte Änderungen (Auftrag
 * firmenordner-rechte-im-frontend, 22.09.2026, J33).
 *
 * Die Wege stehen seit PR 765 (Ordner auf zwei Ebenen, Rechte lesen und
 * schreiben, nur vergeben, 409 mit Ausweg) und seit diesem Auftrag die Wurzel
 * (Ebene 0, genau eine, alle lesen, Administratoren schreiben) und das
 * Protokoll je Ordner. Was bis dahin fehlte, war die Oberfläche: ein
 * Administrator legte einen Ordner mit `curl` an und gab ein Recht mit einem
 * zweiten. Für Standardsoftware in einem Unternehmen ist das kein Weg.
 *
 * WARUM IN DEN EINSTELLUNGEN, neben Mitarbeitern und Apps: dieselbe
 * Begründung wie in D3 und D4. Die Aktivitätsleiste trägt die Arbeit, das
 * Zahnrad darunter das Einrichten des Geräts — und wer welchen Ordner sieht,
 * ist Einrichten. Der Mitarbeiter sieht SEINE Ordner im Benutzermenü der
 * Kopfleiste (`features/firmenordner/`), an derselben Stelle wie seine
 * Ausweise.
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg dieser Seite
 * trägt `requireRole('admin')`.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, FolderPlus, FolderTree, ListOrdered, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Feldgruppe,
  Formularseite,
  Kopf,
  Leerzustand,
} from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import type { ApiError } from '@/hooks/useApi';
import { useApi } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { useBenutzer } from './mitarbeiter/useMitarbeiter';
import { formatBytes } from '@/utils/formatting';
import { AenderungenDialog } from './firmenordner/AenderungenDialog';
import { GrenzeDialog } from './firmenordner/GrenzeDialog';
import { OrdnerAnlegenDialog } from './firmenordner/OrdnerAnlegenDialog';
import { OrdnerBaum } from './firmenordner/OrdnerBaum';
import { OrdnerEntfernenDialog } from './firmenordner/OrdnerEntfernenDialog';
import { PapierkorbDialog } from './firmenordner/PapierkorbDialog';
import { RechteMatrix } from './firmenordner/RechteMatrix';
import {
  ORDNER_KEY,
  RECHTE_KEY,
  useOrdner,
  useOrdnerAnlegen,
  useOrdnerLoeschen,
  usePapierkorbUebersicht,
  usePlatz,
  useRechte,
  type Ordner,
} from './firmenordner/useFirmenordner';

export function FirmenordnerSettings() {
  const toast = useToast();
  const api = useApi();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useOrdner();
  const { data: benutzer, isLoading: benutzerLaden } = useBenutzer();
  const anlegen = useOrdnerAnlegen();
  const loeschen = useOrdnerLoeschen();
  const { data: rechte } = useRechte();

  const [anlegenOffen, setAnlegenOffen] = useState(false);
  const [wegwerfen, setWegwerfen] = useState<Ordner | null>(null);
  const [wegwerfenFehler, setWegwerfenFehler] = useState<string | null>(null);
  const [aenderungen, setAenderungen] = useState<Ordner | null>(null);
  const [papierkorbFuer, setPapierkorbFuer] = useState<Ordner | null>(null);
  const [grenzeFuer, setGrenzeFuer] = useState<Ordner | null>(null);
  const [abgleichLaeuft, setAbgleichLaeuft] = useState(false);

  const ordner = data?.ordner ?? [];
  const zustand = data?.zustand ?? null;
  const wurzel = ordner.find(o => o.art === 'wurzel') ?? null;
  const bereiche = ordner.filter(o => o.ebene === 1 && o.art === 'geteilt');

  const handleAnlegen = (neu: Parameters<typeof anlegen.mutate>[0]) => {
    anlegen.mutate(neu, {
      onSuccess: o => {
        setAnlegenOffen(false);
        toast.success(
          o.raum_id
            ? `„${o.kennung}“ angelegt.`
            : `„${o.kennung}“ angelegt. Er kommt bei den Mitarbeitern an, sobald Sie „Jetzt nachholen“ wählen.`
        );
      },
    });
  };

  const handleWurzel = () => {
    anlegen.mutate(
      { kennung: 'firma', name: 'Firma', ebene: 0, art: 'wurzel' },
      {
        onSuccess: () =>
          toast.success(
            'Der Hauptordner „firma“ steht. Alle lesen ihn, Administratoren schreiben.'
          ),
      }
    );
  };

  const handleWegwerfen = (o: Ordner) => {
    setWegwerfenFehler(null);
    loeschen.mutate(
      { id: o.id, kennung: o.kennung },
      {
        onSuccess: () => {
          setWegwerfen(null);
          toast.success(`„${o.kennung}“ ist weg.`);
        },
        onError: err => setWegwerfenFehler((err as ApiError).message),
      }
    );
  };

  const handleAbgleich = async () => {
    setAbgleichLaeuft(true);
    try {
      const res = await api.post<{
        data: { an: boolean; nutzer: number; raeume: number; rechte: number; offen: string[] };
      }>('/firmenordner/abgleich');
      const b = res.data;
      const zahl = (n: number) => n.toLocaleString('de-DE');
      toast.success(
        `Nachgeholt: ${zahl(b.nutzer)} Konten, ${zahl(b.raeume)} Ordner, ${zahl(b.rechte)} Rechte` +
          (b.offen.length ? `; ${zahl(b.offen.length)} noch offen.` : '.')
      );
    } finally {
      setAbgleichLaeuft(false);
      void qc.invalidateQueries({ queryKey: ORDNER_KEY });
      void qc.invalidateQueries({ queryKey: RECHTE_KEY });
    }
  };

  const an = zustand?.an ?? true;
  const { data: papierkorb } = usePapierkorbUebersicht(Boolean(zustand?.an && zustand.erreichbar));
  const { data: platz } = usePlatz(Boolean(zustand?.an && zustand.erreichbar));
  // Die Warnung steht über dem Baum, bevor ein Abgleich an der Grenze scheitert
  // (J33): „knapp" ab 90 % der Grenze oder unter 10 GB frei auf dem Gerät.
  const eng = (platz?.ordner ?? []).filter(p => p.stufe !== 'gut');
  const voll = eng.some(p => p.stufe === 'voll');
  const adressen = zustand?.adressen?.length
    ? zustand.adressen
    : zustand?.adresse
      ? [zustand.adresse]
      : [];

  // Nachholen nur, wenn es etwas nachzuholen gibt (J35): ein Knopf, der immer
  // dasteht, fragt den Administrator, ob er ihn druecken muss -- und er weiss
  // es nicht. Offen ist, was der Dienst noch nicht kennt.
  const offen =
    (zustand?.nutzer_offen ?? 0) +
    (zustand?.rechte_offen ?? 0) +
    ordner.filter(o => !o.raum_id).length;

  // Die Schritte stehen, bis Hauptordner und ein Bereich da sind; danach ist
  // die Rechte-Matrix selbst die Anleitung.
  const eingerichtet = Boolean(wurzel) && bereiche.length > 0;

  return (
    <div className="animate-in fade-in" data-testid="firmenordner-seite">
      <Kopf
        titel="Firmenordner"
        symbol={<FolderTree />}
        beschreibung="Die Ordner der Firma auf dem Gerät, und wer darin liest oder schreibt."
        aktionen={
          an && !isError ? (
            <Button onClick={() => setAnlegenOffen(true)} data-testid="ordner-anlegen-oeffnen">
              <FolderPlus className="size-4" aria-hidden="true" />
              Ordner anlegen
            </Button>
          ) : null
        }
      />

      {isLoading || benutzerLaden ? (
        <SkeletonText lines={5} />
      ) : isError ? (
        <p className="text-sm text-muted-foreground" data-testid="firmenordner-fehler">
          Die Ordner ließen sich nicht laden.
        </p>
      ) : !an ? (
        <Leerzustand
          symbol={<FolderTree />}
          titel="Auf diesem Gerät läuft kein Firmenordner"
          beschreibung="Der Firmenordner ist auf diesem Gerät nicht eingeschaltet. Ihr Betreuer schaltet ihn ein."
        />
      ) : (
        <Formularseite>
          {zustand && !zustand.erreichbar && (
            <Alert variant="destructive" data-testid="firmenordner-nicht-erreichbar">
              <AlertTitle>Der Firmenordner ist gerade nicht erreichbar</AlertTitle>
              <AlertDescription>
                Ordner und Rechte lassen sich trotzdem anlegen. Sobald er wieder antwortet, steht
                hier „Jetzt nachholen“, und was fehlt, kommt bei den Mitarbeitern an.
              </AlertDescription>
            </Alert>
          )}

          {zustand?.erreichbar !== false && offen > 0 && (
            <Alert data-testid="firmenordner-offen">
              <AlertTitle>Noch nicht alles bei den Mitarbeitern angekommen</AlertTitle>
              <AlertDescription>
                <span>
                  {offen === 1 ? 'Eine Änderung' : `${offen.toLocaleString('de-DE')} Änderungen`} an
                  Ordnern, Konten oder Rechten {offen === 1 ? 'ist' : 'sind'} noch nicht im
                  Firmenordner angekommen. Das passiert, wenn er kurz nicht erreichbar war. „Jetzt
                  nachholen“ überträgt sie.
                </span>
                <span className="mt-2 block">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleAbgleich()}
                    disabled={abgleichLaeuft}
                    data-testid="firmenordner-abgleich"
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    {abgleichLaeuft ? 'Holt nach…' : 'Jetzt nachholen'}
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          )}

          {!eingerichtet && (
            <Feldgruppe titel="So richten Sie den Firmenordner ein" symbol={<ListOrdered />}>
              <ol className="flex flex-col gap-ui-3 text-sm" data-testid="firmenordner-schritte">
                <Schritt
                  nummer={1}
                  erledigt={Boolean(wurzel)}
                  titel="Hauptordner anlegen"
                  text="Der oberste Ordner „Firma“. Alle lesen ihn, Administratoren schreiben."
                  kennzeichen="schritt-hauptordner"
                >
                  <Button
                    size="sm"
                    onClick={handleWurzel}
                    disabled={anlegen.isPending}
                    data-testid="wurzel-anlegen"
                  >
                    Hauptordner anlegen
                  </Button>
                </Schritt>
                <Schritt
                  nummer={2}
                  erledigt={bereiche.length > 0}
                  titel="Einen Bereich anlegen"
                  text="Zum Beispiel „Projekte“ oder „Buchhaltung“. Darin lassen sich später Projekte anlegen."
                  kennzeichen="schritt-bereich"
                >
                  <Button size="sm" variant="outline" onClick={() => setAnlegenOffen(true)}>
                    Bereich anlegen
                  </Button>
                </Schritt>
                <Schritt
                  nummer={3}
                  erledigt={false}
                  titel="Rechte vergeben"
                  text="Unten unter „Rechte“ wählen Sie je Mitarbeiter: keine, lesen oder schreiben."
                  kennzeichen="schritt-rechte"
                />
              </ol>
            </Feldgruppe>
          )}

          <Feldgruppe
            titel="Ordner"
            symbol={<FolderTree />}
            beschreibung={`Ein Bereich enthält Projekte; ein Ordner „am Gerät“ bleibt auf dem Gerät und erscheint bei keinem Mitarbeiter. Was ein Mitarbeiter löscht, liegt im Papierkorb seines Bereichs, bis Sie ihn leeren. Jeder Bereich hat eine Grenze, wie viel er aufnimmt${platz ? ` (neue Bereiche: ${formatBytes(platz.vorgabe)})` : ''}; ein Klick auf „Platz“ stellt sie ein. Frühere Fassungen einer Datei stehen daneben und zählen nicht zur Grenze${platz?.revisionen_je_datei ? `; das Gerät behält je Datei die letzten ${platz.revisionen_je_datei}` : ''}.`}
          >
            {eng.length > 0 && (
              <Alert
                variant={voll ? 'destructive' : 'default'}
                data-testid="firmenordner-platz-warnung"
              >
                <AlertTitle>
                  {voll ? 'Ein Bereich ist voll' : 'Ein Bereich wird bald voll'}
                </AlertTitle>
                <AlertDescription>
                  <ul className="flex flex-col gap-1">
                    {eng.map(p => (
                      <li key={String(p.ordner_id)}>
                        „{p.kennung}“:{' '}
                        {p.begrenzt_durch === 'platte'
                          ? `auf dem Gerät sind nur noch ${formatBytes(p.frei)} frei.`
                          : `${formatBytes(p.belegt)} von ${formatBytes(p.grenze)} belegt, frei ${formatBytes(p.frei)}.`}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-1 block">
                    Ein Abgleich, der mehr bringt, wird abgewiesen. Heben Sie die Grenze in der
                    Spalte „Platz“ an
                    {eng.some(p => p.begrenzt_durch === 'platte')
                      ? ' oder sprechen Sie mit Ihrem Betreuer über mehr Platz auf dem Gerät.'
                      : '.'}
                  </span>
                </AlertDescription>
              </Alert>
            )}
            {adressen.length > 0 && (
              <p className="text-sm text-muted-foreground" data-testid="firmenordner-adressen">
                Erreichbar unter{' '}
                <span className="font-mono break-all text-foreground">{adressen[0]}</span>
                {adressen.length > 1 && (
                  <>
                    , im Netz der Firma auch unter{' '}
                    {adressen.slice(1).map((a, i) => (
                      <span key={a}>
                        {i > 0 && ' oder '}
                        <span className="font-mono break-all text-foreground">{a}</span>
                      </span>
                    ))}
                  </>
                )}
                .
              </p>
            )}
            {ordner.length === 0 ? (
              <Leerzustand
                symbol={<FolderTree />}
                titel="Noch kein Ordner"
                beschreibung="Legen Sie einen Bereich an. Rechte darauf gelten für alles darunter; wer nur ein Projekt sehen soll, bekommt es einzeln."
              />
            ) : (
              <OrdnerBaum
                ordner={ordner}
                papierkorb={papierkorb}
                platz={platz?.ordner}
                onGrenze={setGrenzeFuer}
                onAenderungen={setAenderungen}
                onWegwerfen={setWegwerfen}
                onPapierkorb={setPapierkorbFuer}
              />
            )}
          </Feldgruppe>

          <Feldgruppe
            titel="Rechte"
            symbol={<ShieldCheck />}
            beschreibung={
              'Je Mitarbeiter und Ordner eine Stufe: keine, lesen, schreiben. Ein Recht auf einem Bereich gilt für jedes Projekt darin und wird dort nie weniger. ' +
              (wurzel
                ? `Den Hauptordner „${wurzel.kennung}“ lesen alle, Administratoren schreiben. `
                : '') +
              'Ein Ordner am Gerät hat keine Spalte: ihn lesen nur die Apps.'
            }
          >
            <RechteMatrix benutzer={benutzer ?? []} ordner={ordner} />
          </Feldgruppe>
        </Formularseite>
      )}

      <OrdnerAnlegenDialog
        offen={anlegenOffen}
        laeuft={anlegen.isPending}
        bereiche={bereiche}
        onSchliessen={() => setAnlegenOffen(false)}
        onAnlegen={handleAnlegen}
      />
      <OrdnerEntfernenDialog
        fuer={wegwerfen}
        rechte={
          wegwerfen ? (rechte ?? []).filter(r => String(r.ordner_id) === String(wegwerfen.id)) : []
        }
        laeuft={loeschen.isPending}
        fehler={wegwerfenFehler}
        onSchliessen={() => {
          setWegwerfen(null);
          setWegwerfenFehler(null);
        }}
        onWegwerfen={handleWegwerfen}
      />
      <AenderungenDialog fuer={aenderungen} onSchliessen={() => setAenderungen(null)} />
      <PapierkorbDialog fuer={papierkorbFuer} onSchliessen={() => setPapierkorbFuer(null)} />
      <GrenzeDialog
        fuer={grenzeFuer}
        platz={
          grenzeFuer
            ? (platz?.ordner.find(p => String(p.ordner_id) === String(grenzeFuer.id)) ?? null)
            : null
        }
        platteFrei={platz?.platte.frei ?? null}
        onSchliessen={() => setGrenzeFuer(null)}
      />
    </div>
  );
}

/**
 * Ein Schritt der Einrichtung: Nummer, was zu tun ist, und der Knopf dazu --
 * oder ein Haken, wenn er getan ist (J35). Drei Handlungen ohne Reihenfolge
 * standen vorher nebeneinander, und wer zum ersten Mal kam, wusste nicht, wo
 * anfangen.
 */
function Schritt({
  nummer,
  erledigt,
  titel,
  text,
  kennzeichen,
  children,
}: {
  nummer: number;
  erledigt: boolean;
  titel: string;
  text: string;
  kennzeichen: string;
  children?: ReactNode;
}) {
  return (
    <li
      className="flex items-start gap-ui-3"
      data-testid={kennzeichen}
      data-erledigt={erledigt ? 'ja' : 'nein'}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-ui-xs font-semibold"
        aria-hidden="true"
      >
        {erledigt ? <Check className="size-3.5" /> : nummer}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium text-foreground">
          {titel}
          {erledigt && <span className="sr-only"> (erledigt)</span>}
        </span>
        <span className="text-muted-foreground">{text}</span>
        {!erledigt && children && <span className="mt-1">{children}</span>}
      </span>
    </li>
  );
}
