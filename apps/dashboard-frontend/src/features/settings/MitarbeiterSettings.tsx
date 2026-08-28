/**
 * Mitarbeiter: Liste, Startpasswort, Freigabe-Matrix (Phase D3 des Umbaus vom
 * 26.08.2026).
 *
 * Die Wege dahinter stehen seit C1 und C2. Was bis D3 fehlte, war die
 * Oberfläche: ein Administrator legte einen Mitarbeiter mit `curl` an und gab
 * ihm eine App mit einem zweiten `curl` frei. Für Standardsoftware, die in
 * einem Unternehmen steht, ist das kein Weg.
 *
 * WARUM DIE SEITE IN DEN EINSTELLUNGEN LIEGT und nicht als eigener Knopf in der
 * Aktivitätsleiste: die Leiste trägt die Ansichten, mit denen jemand ARBEITET
 * (Apps, Modelle), und darunter das Zahnrad für alles, womit er das GERÄT
 * einrichtet. Menschen anlegen und Apps freigeben gehört zum zweiten. Die
 * Sektionsliste der Einstellungen ist außerdem schon da, schon nur für
 * Administratoren (`nurFuerAdmin('settings')`, D1) und schon tief verlinkbar
 * (`/workspace/settings?tab=benutzer`) — ein eigener Eintrag in der Leiste
 * hätte eine zweite Sidebar-Ansicht gebraucht, ohne dass es dafür etwas zu
 * zeigen gäbe.
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg auf dieser Seite
 * trägt `requireRole('admin')` und antwortet einem Mitarbeiter mit 403, ob die
 * Seite für ihn sichtbar ist oder nicht.
 */
import { useState } from 'react';
import { KeyRound, ShieldCheck, Trash2, UserPlus, Users, UserX } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section, SectionList } from '@/components/ui/Section';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import useConfirm from '@/hooks/useConfirm';
import { formatDate } from '@/utils/formatting';
import { FreigabeMatrix } from './mitarbeiter/FreigabeMatrix';
import { MitarbeiterAnlegenDialog } from './mitarbeiter/MitarbeiterAnlegenDialog';
import { PasswortSetzenDialog } from './mitarbeiter/PasswortSetzenDialog';
import {
  useAktivSetzen,
  useBenutzer,
  useBenutzerAnlegen,
  useBenutzerLoeschen,
  usePasswortSetzen,
  type Benutzer,
} from './mitarbeiter/useMitarbeiter';

export function MitarbeiterSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const { data: benutzer, isLoading, isError } = useBenutzer();
  const anlegen = useBenutzerAnlegen();
  const passwortSetzen = usePasswortSetzen();
  const aktivSetzen = useAktivSetzen();
  const loeschen = useBenutzerLoeschen();

  const [anlegenOffen, setAnlegenOffen] = useState(false);
  const [passwortFuer, setPasswortFuer] = useState<Benutzer | null>(null);

  const liste = benutzer ?? [];
  // Über `String(...)`: die Kennung kommt als `int8` und damit als Zeichenkette
  // (siehe `useMitarbeiter.ts`). Genau dieser Vergleich hat im Backend zwei
  // Schutzwälle still ausgehebelt.
  const istIchSelbst = (b: Benutzer) => String(b.id) === String(user?.id ?? '');

  const handleAnlegen = (neu: Parameters<typeof anlegen.mutate>[0]) => {
    anlegen.mutate(neu, {
      onSuccess: angelegt => {
        setAnlegenOffen(false);
        toast.success(
          `${angelegt.username} angelegt. Das Startpasswort wird beim ersten Anmelden gewechselt.`
        );
      },
    });
  };

  const handlePasswort = (passwort: string) => {
    if (!passwortFuer) return;
    const name = passwortFuer.username;
    passwortSetzen.mutate(
      { id: passwortFuer.id, password: passwort },
      {
        onSuccess: () => {
          setPasswortFuer(null);
          toast.success(`Startpasswort für ${name} gesetzt. Seine Sitzungen sind beendet.`);
        },
      }
    );
  };

  const handleAktiv = async (b: Benutzer) => {
    if (b.is_active) {
      const ok = await confirm({
        title: `${b.username} stilllegen?`,
        message:
          'Er kommt danach nicht mehr herein. Seine Läufe und Protokolle bleiben stehen, ' +
          'und du kannst ihn jederzeit wieder zulassen.',
        confirmText: 'Stilllegen',
        confirmVariant: 'warning',
      });
      if (!ok) return;
    }
    aktivSetzen.mutate(
      { id: b.id, aktiv: !b.is_active },
      {
        onSuccess: () =>
          toast.success(
            b.is_active ? `${b.username} stillgelegt` : `${b.username} wieder zugelassen`
          ),
      }
    );
  };

  const handleLoeschen = async (b: Benutzer) => {
    const ok = await confirm({
      title: `${b.username} endgültig löschen?`,
      message:
        'Das Konto und die zugehörigen Daten werden gelöscht, und das ist nicht umkehrbar. ' +
        'Wer nur aussperren will, legt ihn besser still.',
      confirmText: 'Endgültig löschen',
    });
    if (!ok) return;
    loeschen.mutate(b.id, {
      onSuccess: () => toast.success(`${b.username} gelöscht`),
    });
  };

  return (
    <div className="animate-in fade-in" data-testid="mitarbeiter-seite">
      {ConfirmDialog}

      <PageHeader
        title="Mitarbeiter"
        icon={<Users />}
        description="Wer sich am Gerät anmelden darf, und welche Apps er sieht."
        action={
          <Button onClick={() => setAnlegenOffen(true)} data-testid="mitarbeiter-anlegen-oeffnen">
            <UserPlus className="size-4" aria-hidden="true" />
            Menschen anlegen
          </Button>
        }
      />

      <SectionList>
        <Section
          title="Menschen am Gerät"
          icon={<Users />}
          description="Ein vom Administrator gesetztes Passwort ist ein Startpasswort und wird beim ersten Anmelden gewechselt."
        >
          {isLoading ? (
            <SkeletonText lines={4} />
          ) : isError ? (
            <p className="text-sm text-muted-foreground" data-testid="mitarbeiter-fehler">
              Die Liste ließ sich nicht laden.
            </p>
          ) : (
            <div className="overflow-x-auto">
              {/* Die Tabelle rollt in SICH, nicht die Seite (Phase D4, Fund
                  der D3-Abnahme). Ohne die Mindestbreite quetscht `w-full`
                  sechs Spalten in eine schmale Mitte, bis vom Namen nichts
                  mehr uebrig ist; mit ihr bleibt jede Spalte lesbar und der
                  Rest wandert unter den waagerechten Balken dieses Kastens. */}
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
                        <span className="text-foreground">{b.username}</span>
                        {!b.is_active && (
                          <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-ui-xs font-medium text-warning">
                            stillgelegt
                          </span>
                        )}
                        {istIchSelbst(b) && (
                          <span className="ml-2 text-ui-xs text-muted-foreground">du</span>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">{b.email || '—'}</td>
                      <td className="p-2 text-muted-foreground">
                        {b.role === 'admin' ? 'Administrator' : 'Mitarbeiter'}
                      </td>
                      <td className="p-2">
                        {/* Was hier steht, ist keine Geheimnis-Preisgabe: es
                            sagt nur, ob ein Zweiter das Passwort kennt. Genau
                            deshalb muss es gewechselt werden. */}
                        {b.passwort_vom_admin ? (
                          <span
                            className="text-warning"
                            data-testid={`startpasswort-${b.username}`}
                            title="Wird beim nächsten Anmelden gewechselt."
                          >
                            Startpasswort
                          </span>
                        ) : (
                          <span className="text-muted-foreground">eigenes</span>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {b.last_login ? formatDate(b.last_login) : 'noch nie'}
                      </td>
                      <td className="p-2">
                        <div className="flex justify-end gap-1">
                          {/* Für das eigene Konto steht hier nichts: alle drei
                              Wege lehnt das Backend für einen selbst ab (das
                              eigene Passwort wechselt man unter Sicherheit,
                              gelöscht wird man über den Datenschutz). Knöpfe,
                              die sicher scheitern, sind eine Sackgasse. */}
                          {!istIchSelbst(b) && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPasswortFuer(b)}
                                data-testid={`passwort-${b.username}`}
                                title="Startpasswort setzen"
                              >
                                <KeyRound className="size-4" aria-hidden="true" />
                                <span className="sr-only">Passwort setzen</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleAktiv(b)}
                                disabled={aktivSetzen.isPending}
                                data-testid={`aktiv-${b.username}`}
                                title={b.is_active ? 'Stilllegen' : 'Wieder zulassen'}
                              >
                                {b.is_active ? (
                                  <UserX className="size-4" aria-hidden="true" />
                                ) : (
                                  <ShieldCheck className="size-4" aria-hidden="true" />
                                )}
                                <span className="sr-only">
                                  {b.is_active ? 'Stilllegen' : 'Wieder zulassen'}
                                </span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleLoeschen(b)}
                                disabled={loeschen.isPending}
                                data-testid={`loeschen-${b.username}`}
                                title="Löschen"
                              >
                                <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                                <span className="sr-only">Löschen</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title="Freigaben"
          icon={<ShieldCheck />}
          description="Ein Häkchen heißt: dieser Mensch sieht diese App. Auch ein Administrator sieht nur, was für ihn freigegeben ist."
        >
          {isLoading ? <SkeletonText lines={3} /> : <FreigabeMatrix benutzer={liste} />}
        </Section>
      </SectionList>

      <MitarbeiterAnlegenDialog
        offen={anlegenOffen}
        laeuft={anlegen.isPending}
        onSchliessen={() => setAnlegenOffen(false)}
        onAnlegen={handleAnlegen}
      />
      <PasswortSetzenDialog
        fuer={passwortFuer}
        laeuft={passwortSetzen.isPending}
        onSchliessen={() => setPasswortFuer(null)}
        onSetzen={handlePasswort}
      />
    </div>
  );
}
