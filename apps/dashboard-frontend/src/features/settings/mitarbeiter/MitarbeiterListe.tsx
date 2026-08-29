/**
 * Die Menschen am Gerät, in zwei Formen (Phase D5, Fund der D4-Abnahme).
 *
 * BEI 390 PX STAND DIE VERWALTUNG NICHT. Die Tabelle aus D3 hat sechs Spalten
 * und trägt deshalb eine Mindestbreite von 42 rem; darunter rollt sie in
 * ihrem Kasten waagerecht. Auf einem Arbeitsplatz ist das richtig (Spalten
 * untereinander lassen sich vergleichen), am Telefon ist es eine Tabelle, von
 * der man immer nur ein Drittel sieht.
 *
 * Deshalb zwei Formen und EIN Satz Daten: unter 900 px eine Liste, in der
 * jeder Mensch untereinander steht, darüber die Tabelle. Die Grenze ist
 * dieselbe, unter der die Shell schon ihre dritte Spalte einklappt
 * (`useSchmalesFenster`); es gibt keinen zweiten Schwellenwert im Produkt.
 *
 * Nicht beides gleichzeitig im Dokument mit `hidden`: die Kennungen der
 * Abnahme (`mitarbeiter-<name>`, `passwort-<name>`) wären dann doppelt da, und
 * ein Klick träfe die unsichtbare Hälfte.
 */
import type { ReactNode } from 'react';
import { useSchmalesFenster } from '@marken';
import { formatDate } from '@/utils/formatting';
import type { Benutzer } from './useMitarbeiter';

interface ListeProps {
  liste: Benutzer[];
  istIchSelbst: (b: Benutzer) => boolean;
  /** Die drei Knöpfe je Zeile. Sie leben beim Aufrufer, samt Mutationen. */
  aktionen: (b: Benutzer) => ReactNode;
}

/** Name plus die zwei Vermerke, die an ihm hängen. */
function Name({ b, ichSelbst }: { b: Benutzer; ichSelbst: boolean }) {
  return (
    <>
      <span className="text-foreground">{b.username}</span>
      {!b.is_active && (
        <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-ui-xs font-medium text-warning">
          stillgelegt
        </span>
      )}
      {ichSelbst && <span className="ml-2 text-ui-xs text-muted-foreground">du</span>}
    </>
  );
}

/**
 * Was hier steht, ist keine Geheimnis-Preisgabe: es sagt nur, ob ein Zweiter
 * das Passwort kennt. Genau deshalb muss es gewechselt werden.
 */
function Passwort({ b }: { b: Benutzer }) {
  return b.passwort_vom_admin ? (
    <span
      className="text-warning"
      data-testid={`startpasswort-${b.username}`}
      title="Wird beim nächsten Anmelden gewechselt."
    >
      Startpasswort
    </span>
  ) : (
    <span className="text-muted-foreground">eigenes</span>
  );
}

const rolleWort = (b: Benutzer) => (b.role === 'admin' ? 'Administrator' : 'Mitarbeiter');

export function MitarbeiterListe({ liste, istIchSelbst, aktionen }: ListeProps) {
  const schmal = useSchmalesFenster();

  if (schmal) {
    return (
      <ul className="rounded-md border border-border" data-testid="mitarbeiter-liste">
        {liste.map(b => (
          <li
            key={String(b.id)}
            data-testid={`mitarbeiter-${b.username}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
          >
            <span className="w-full text-sm font-medium">
              <Name b={b} ichSelbst={istIchSelbst(b)} />
            </span>
            <span className="w-full truncate text-xs text-muted-foreground">{b.email || '—'}</span>
            <span className="text-xs text-muted-foreground">{rolleWort(b)}</span>
            <span className="text-xs">
              <Passwort b={b} />
            </span>
            <span className="text-xs text-muted-foreground">
              zuletzt {b.last_login ? formatDate(b.last_login) : 'nie'}
            </span>
            <span className="ml-auto flex gap-1">{aktionen(b)}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Die Tabelle rollt in SICH, nicht die Seite (Phase D4, Fund der
          D3-Abnahme). Ohne die Mindestbreite quetscht `w-full` sechs Spalten
          in eine schmale Mitte, bis vom Namen nichts mehr uebrig ist. */}
      <table
        className="w-full min-w-[42rem] border-collapse text-sm"
        data-testid="mitarbeiter-liste"
      >
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="p-2 font-medium">
              Name
            </th>
            <th scope="col" className="p-2 font-medium">
              E-Mail
            </th>
            <th scope="col" className="p-2 font-medium">
              Rolle
            </th>
            <th scope="col" className="p-2 font-medium">
              Passwort
            </th>
            <th scope="col" className="p-2 font-medium">
              Zuletzt angemeldet
            </th>
            <th scope="col" className="p-2 text-right font-medium">
              <span className="sr-only">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {liste.map(b => (
            <tr
              key={String(b.id)}
              data-testid={`mitarbeiter-${b.username}`}
              className="border-b border-border last:border-b-0"
            >
              <td className="p-2">
                <Name b={b} ichSelbst={istIchSelbst(b)} />
              </td>
              <td className="p-2 text-muted-foreground">{b.email || '—'}</td>
              <td className="p-2 text-muted-foreground">{rolleWort(b)}</td>
              <td className="p-2">
                <Passwort b={b} />
              </td>
              <td className="p-2 text-muted-foreground">
                {b.last_login ? formatDate(b.last_login) : 'noch nie'}
              </td>
              <td className="p-2">
                <div className="flex justify-end gap-1">{aktionen(b)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
