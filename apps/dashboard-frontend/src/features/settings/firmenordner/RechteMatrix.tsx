/**
 * Die Rechte-Matrix: Menschen mal Ordner (Auftrag
 * firmenordner-rechte-im-frontend, 22.09.2026).
 *
 * Dieselbe Form wie die Freigabe-Matrix aus D3, aus demselben Grund: eine
 * Zeile sagt, was ein Mensch hat, eine Spalte, wer einen Ordner sieht. In der
 * Zelle steht keine Farbe und kein Häkchen, sondern die Stufe als Wort —
 * „keine", „lesen", „schreiben" —, weil es hier drei sind und nicht zwei.
 *
 * VIER STUFEN, UND NUR ZWEI STEHEN IN EINER ZELLE. „keine" ist keine Zeile
 * (der Ordner ist für diesen Menschen unsichtbar, auch sein Name), „lesen"
 * und „schreiben" sind eine. Die vierte, „am Gerät", ist eine Art des
 * Ordners und keine Stufe je Person: so ein Ordner hat KEINE Spalte —
 * niemand bekommt ihn, und ein Auswahlfeld, das sicher mit 400 scheitert,
 * wäre eine Sackgasse. Die Wurzel hat auch keine: jeder aktive Mensch liest
 * sie, Administratoren schreiben, das folgt aus der Rolle und steht als Satz
 * über der Matrix.
 *
 * VERERBT VON EBENE 1 AUF 2. Wer auf einem Bereich ein Recht hat, hat es auf
 * jedem Projekt darin, ohne eigene Zeile. Die Zelle eines Projekts sagt das
 * („wie oben: lesen") und bietet trotzdem MEHR an (schreiben) — das ist der
 * Normalfall. WENIGER weist das Backend mit 409 ab, und der Satz mit dem
 * Ausweg steht dann unter der Matrix, an der Stelle, an der geklickt wurde,
 * und nicht in einer Meldung, die nach fünf Sekunden weg ist.
 *
 * BEI 390 PX IST EINE MATRIX KEINE (D5). Unter 900 px steht dieselbe Auskunft
 * als Liste: eine Gruppe je Ordner, darin die Menschen. Nur eine der beiden
 * Formen steht im Dokument.
 */
import { useState } from 'react';
import { FolderTree } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Leerzustand,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useSchmalesFenster,
} from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import type { ApiError } from '@/hooks/useApi';
import type { Benutzer } from '../mitarbeiter/useMitarbeiter';
import { ordnerWeg } from './OrdnerBaum';
import {
  alsBaum,
  rechtVon,
  useRechte,
  useRechtSetzen,
  type Ordner,
  type Recht,
  type RechtZeile,
} from './useFirmenordner';

const KEINE = 'keine';

/** Die Stufe, die ein Mensch auf dem Ordner DARÜBER hat — oder `null`. */
function geerbt(rechte: RechtZeile[], o: Ordner, b: Benutzer): Recht | null {
  if (o.ebene !== 2 || o.eltern_id === null) return null;
  return rechtVon(rechte, o.eltern_id, b.id)?.recht ?? null;
}

function Zelle({
  o,
  b,
  rechte,
  laeuft,
  setzen,
}: {
  o: Ordner;
  b: Benutzer;
  rechte: RechtZeile[];
  laeuft: boolean;
  setzen: (recht: Recht | null) => void;
}) {
  const eigen = rechtVon(rechte, o.id, b.id)?.recht ?? null;
  const oben = geerbt(rechte, o, b);
  const zelle = `${o.kennung}-${b.username}`;
  return (
    <Select
      value={eigen ?? KEINE}
      disabled={laeuft}
      onValueChange={wert => setzen(wert === KEINE ? null : (wert as Recht))}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Recht von ${b.username} auf ${ordnerWeg(o)}`}
        data-testid={`recht-${zelle}`}
        className="min-w-28"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* „keine" heißt bei einem Projekt, dessen Bereich der Mensch schon
            hat: was oben gilt. Eine eigene Zeile darunter, die weniger gibt,
            nimmt das Backend nicht an. */}
        <SelectItem value={KEINE} data-testid={`recht-${zelle}-keine`}>
          {oben ? `wie oben: ${oben}` : 'keine'}
        </SelectItem>
        <SelectItem value="lesen" data-testid={`recht-${zelle}-lesen`}>
          lesen
        </SelectItem>
        <SelectItem value="schreiben" data-testid={`recht-${zelle}-schreiben`}>
          schreiben
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

export function RechteMatrix({ benutzer, ordner }: { benutzer: Benutzer[]; ordner: Ordner[] }) {
  const schmal = useSchmalesFenster();
  const { data: rechte, isLoading, isError } = useRechte();
  const setzen = useRechtSetzen();
  const [fehler, setFehler] = useState<string | null>(null);

  if (isLoading) {
    return <SkeletonText lines={4} />;
  }
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="rechte-fehler-laden">
        Die Rechte ließen sich nicht laden.
      </p>
    );
  }

  const alleRechte = rechte ?? [];
  // Nur die Ordner mit einer Spalte: geteilte. Die Wurzel und „am Gerät"
  // haben keine (siehe Kopf).
  const spalten = alsBaum(ordner).filter(o => o.art === 'geteilt');

  if (spalten.length === 0) {
    return (
      <Leerzustand
        symbol={<FolderTree />}
        titel="Noch kein geteilter Ordner"
        beschreibung="Legen Sie einen Bereich an, dann steht er hier als Spalte, und je Mensch lässt sich eine Stufe wählen."
      />
    );
  }

  const setze = (o: Ordner, b: Benutzer, recht: Recht | null) => {
    setFehler(null);
    setzen.mutate(
      { ordnerId: o.id, benutzerId: b.id, recht },
      {
        onError: err => {
          const e = err as ApiError;
          setFehler(e.message || 'Das Recht ließ sich nicht setzen.');
        },
      }
    );
  };

  const meldung = fehler && (
    <Alert variant="destructive" data-testid="rechte-fehler">
      <AlertTitle>Das ging nicht</AlertTitle>
      <AlertDescription>{fehler}</AlertDescription>
    </Alert>
  );

  if (schmal) {
    return (
      <div className="flex flex-col gap-ui-3" data-testid="rechte-matrix">
        {meldung}
        {spalten.map(o => (
          <section key={String(o.id)} className="rounded-md border border-border">
            <h3 className="border-b border-border p-ui-3 font-mono text-sm font-semibold text-foreground">
              {ordnerWeg(o)}
              <span className="ml-2 font-sans font-normal text-muted-foreground">{o.name}</span>
            </h3>
            <ul>
              {benutzer.map(b => (
                <li
                  key={String(b.id)}
                  className="flex flex-wrap items-center gap-3 border-b border-border p-ui-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-sm text-foreground">
                    {b.username}
                    {b.role === 'admin' && (
                      <span className="ml-2 text-ui-xs text-muted-foreground">Admin</span>
                    )}
                  </span>
                  <Zelle
                    o={o}
                    b={b}
                    rechte={alleRechte}
                    laeuft={setzen.isPending}
                    setzen={recht => setze(o, b, recht)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ui-3" data-testid="rechte-matrix">
      {meldung}
      <div className="overflow-x-auto">
        <table className="w-full min-w-fit border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="p-2 text-left font-medium text-muted-foreground">
                Mensch
              </th>
              {spalten.map(o => (
                <th
                  key={String(o.id)}
                  scope="col"
                  className="p-2 text-left font-mono font-medium text-foreground"
                  title={o.name}
                >
                  {ordnerWeg(o)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {benutzer.map(b => (
              <tr key={String(b.id)} className="border-b border-border last:border-b-0">
                <th scope="row" className="p-2 text-left font-normal">
                  <span className="text-foreground">{b.username}</span>
                  {b.role === 'admin' && (
                    <span className="ml-2 text-ui-xs text-muted-foreground">Admin</span>
                  )}
                </th>
                {spalten.map(o => (
                  <td key={String(o.id)} className="p-2 align-middle">
                    <Zelle
                      o={o}
                      b={b}
                      rechte={alleRechte}
                      laeuft={setzen.isPending}
                      setzen={recht => setze(o, b, recht)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
