/**
 * Die Rechte eines Ordners: eine Stufe je Person (M5, Verwaltung Firmenordner).
 *
 * Bis dahin stand hier eine Matrix Menschen mal Ordner, und sie stand
 * zweimal: im Bereich Personen und im Bereich Firmenordner. Jetzt gibt es
 * genau eine Stelle, und sie ist der aufgeklappte Ordner im Baum: wer einen
 * Ordner aufklappt, sieht jede Person mit ihrer Stufe und stellt sie ein. Der
 * Grund für den Ordner und nicht für die Person: Rechte entstehen an einem
 * Ordner (anlegen, wegwerfen, die Grenze), und die Frage des Administrators
 * ist „wer sieht diesen Ordner?", nicht „was sieht diese Person?".
 *
 * In der Zelle steht die Stufe als Wort: „keine", „lesen", „schreiben".
 * „keine" ist keine Zeile (der Ordner ist für die Person unsichtbar, auch sein
 * Name). Ein Ordner am Gerät und die Wurzel haben keine Stufen je Person: die
 * Wurzel lesen alle, Administratoren schreiben, den anderen lesen nur die Apps.
 *
 * VERERBT VON EBENE 1 AUF 2. Wer auf einem Bereich ein Recht hat, hat es auf
 * jedem Projekt darin, ohne eigene Zeile. Die Zelle eines Projekts sagt das
 * („wie oben: lesen") und bietet trotzdem MEHR an (schreiben). WENIGER weist
 * das Backend mit 409 ab, und der Satz mit dem Ausweg steht dann unter der
 * Liste, an der Stelle, an der geklickt wurde.
 */
import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { anzeigeName, type Benutzer } from '../personen/usePersonen';
import { ordnerWeg } from './ordnerWeg';
import {
  rechtVon,
  useRechtSetzen,
  useRechte,
  type Ordner,
  type Recht,
  type RechtZeile,
} from './useFirmenordner';
import { fehlertext } from '@/utils/fehlertext';

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
        aria-label={`Recht von ${anzeigeName(b)} auf ${ordnerWeg(o)}`}
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

export function RechteJeOrdner({ o, benutzer }: { o: Ordner; benutzer: Benutzer[] }) {
  const { data: rechte, isLoading, isError } = useRechte();
  const setzen = useRechtSetzen();
  const [fehler, setFehler] = useState<string | null>(null);

  if (isLoading) return <SkeletonText lines={3} />;
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="rechte-fehler-laden">
        Die Rechte ließen sich nicht laden.
      </p>
    );
  }

  const alleRechte = rechte ?? [];
  const setze = (b: Benutzer, recht: Recht | null) => {
    setFehler(null);
    setzen.mutate(
      { ordnerId: o.id, benutzerId: b.id, recht },
      {
        onError: err => setFehler(fehlertext(err, undefined, 'Das Recht ließ sich nicht setzen.')),
      }
    );
  };

  return (
    <div className="flex flex-col gap-ui-3" data-testid={`rechte-${o.kennung}`}>
      {fehler && (
        <Alert variant="destructive" data-testid="rechte-fehler">
          <AlertTitle>Das ging nicht</AlertTitle>
          <AlertDescription>{fehler}</AlertDescription>
        </Alert>
      )}
      <ul className="rounded-md border border-border">
        {benutzer.map(b => (
          <li
            key={String(b.id)}
            data-testid={`stufe-${o.kennung}-${b.username}`}
            className="flex flex-wrap items-center gap-3 border-b border-border p-ui-3 last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-sm text-foreground wrap-anywhere">
              {anzeigeName(b)}
              {b.role === 'admin' && (
                <span className="ml-2 text-xs text-muted-foreground">Verwaltung</span>
              )}
            </span>
            <Zelle
              o={o}
              b={b}
              rechte={alleRechte}
              laeuft={setzen.isPending}
              setzen={recht => setze(b, recht)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
