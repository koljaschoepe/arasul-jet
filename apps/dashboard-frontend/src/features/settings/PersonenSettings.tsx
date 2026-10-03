/**
 * Personen: anlegen, Startpasswort, sperren, Verwaltung, Freigaben (M5,
 * Auftrag verwaltung-personen; ersetzt den Reiter „Mitarbeiter" aus Phase D3).
 *
 * Der Bereich ist in sich geschlossen: er zieht seine Daten selbst, kennt die
 * Einstellungen nicht und lässt sich später in die Verwaltung des neuen
 * Rahmens hängen, ohne dass sich etwas an ihm ändert. Heute steht er an der
 * Stelle des alten Mitarbeiter-Reiters (`?tab=benutzer`).
 *
 * Eine Person entsteht aus Vorname, Nachname und E-Mail. Das Startpasswort
 * erzeugt das Gerät und zeigt es einmal (kopieren oder als Zettel drucken); die
 * Person wählt bei der ersten Anmeldung ein eigenes. Sperren kommt vor Löschen:
 * es nimmt den Zugang und beendet die angemeldeten Rechner, Entscheidungen und
 * Läufe bleiben stehen. Der Schalter „Verwaltung" macht zum Administrator; der
 * letzte bleibt, und das weist das Backend ab, nicht nur diese Oberfläche.
 *
 * Freigaben sind zwei Tabellen mit fester erster Spalte: Apps (Schalter) und
 * Ordner (Stufe).
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg auf dieser Seite
 * trägt `requireRole('admin')` und antwortet einem Mitarbeiter mit 403.
 */
import { useState } from 'react';
import { KeyRound, ShieldCheck, Trash2, UserPlus, UserX, Users } from 'lucide-react';
import { Kopf, Button, Switch, Feldgruppe, Formularseite } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import useConfirm from '@/hooks/useConfirm';
import { FreigabeMatrix } from './personen/FreigabeMatrix';
import { PersonenListe } from './personen/PersonenListe';
import { PersonAnlegenDialog } from './personen/PersonAnlegenDialog';
import { StartpasswortDialog, type StartpasswortZettel } from './personen/StartpasswortDialog';
import {
  anzeigeName,
  useAktivSetzen,
  useBenutzer,
  useBenutzerLoeschen,
  useNeuesStartpasswort,
  usePersonAnlegen,
  useVerwaltungSetzen,
  type Benutzer,
  type NeuePerson,
} from './personen/usePersonen';
import { RechteMatrix } from './firmenordner/RechteMatrix';
import { useOrdner } from './firmenordner/useFirmenordner';

export function PersonenSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const { data: benutzer, isLoading, isError } = useBenutzer();
  const { data: ordnerDaten } = useOrdner();
  const anlegen = usePersonAnlegen();
  const neuesStartpasswort = useNeuesStartpasswort();
  const aktivSetzen = useAktivSetzen();
  const verwaltungSetzen = useVerwaltungSetzen();
  const loeschen = useBenutzerLoeschen();

  const [anlegenOffen, setAnlegenOffen] = useState(false);
  const [zettel, setZettel] = useState<StartpasswortZettel | null>(null);

  const liste = benutzer ?? [];
  // Über `String(...)`: die Kennung kommt als `int8` und damit als Zeichenkette
  // (siehe `usePersonen.ts`). Genau dieser Vergleich hat im Backend zwei
  // Schutzwälle still ausgehebelt.
  const istIchSelbst = (b: Benutzer) => String(b.id) === String(user?.id ?? '');
  // Der letzte aktive Administrator behält das Recht; das Backend weist ab, der
  // Schalter steht hier nur gar nicht erst zur Wahl.
  const aktiveAdmins = liste.filter(b => b.role === 'admin' && b.is_active);
  const istLetzterAdmin = (b: Benutzer) =>
    b.role === 'admin' && b.is_active && aktiveAdmins.length <= 1;

  const handleAnlegen = (neu: NeuePerson) => {
    anlegen.mutate(neu, {
      onSuccess: ({ person, startpasswort }) => {
        setAnlegenOffen(false);
        setZettel({
          name: anzeigeName(person),
          email: person.email ?? person.username,
          startpasswort,
        });
      },
    });
  };

  const handleNeuesStartpasswort = async (b: Benutzer) => {
    const ok = await confirm({
      title: `Neues Startpasswort für ${anzeigeName(b)}?`,
      message:
        'Das bisherige Passwort gilt danach nicht mehr, und alle angemeldeten Rechner ' +
        'der Person werden abgemeldet.',
      confirmText: 'Neu erzeugen',
      confirmVariant: 'warning',
    });
    if (!ok) return;
    neuesStartpasswort.mutate(b.id, {
      onSuccess: startpasswort =>
        setZettel({ name: anzeigeName(b), email: b.email ?? b.username, startpasswort }),
    });
  };

  const handleAktiv = async (b: Benutzer) => {
    if (b.is_active) {
      const ok = await confirm({
        title: `${anzeigeName(b)} sperren?`,
        message:
          'Die Person kommt danach nicht mehr herein, angemeldete Rechner werden abgemeldet. ' +
          'Entscheidungen und Läufe bleiben stehen, und Sie können sie jederzeit wieder zulassen.',
        confirmText: 'Sperren',
        confirmVariant: 'warning',
      });
      if (!ok) return;
    }
    aktivSetzen.mutate(
      { id: b.id, aktiv: !b.is_active },
      {
        onSuccess: () =>
          toast.success(
            b.is_active ? `${anzeigeName(b)} gesperrt` : `${anzeigeName(b)} wieder zugelassen`
          ),
      }
    );
  };

  const handleLoeschen = async (b: Benutzer) => {
    const ok = await confirm({
      title: `${anzeigeName(b)} endgültig löschen?`,
      message:
        'Das Konto und die zugehörigen Daten werden gelöscht, und das ist nicht umkehrbar. ' +
        'Wer nur aussperren will, sperrt besser.',
      confirmText: 'Endgültig löschen',
    });
    if (!ok) return;
    loeschen.mutate(b.id, {
      onSuccess: () => toast.success(`${anzeigeName(b)} gelöscht`),
    });
  };

  return (
    <div className="animate-in fade-in" data-testid="personen-seite">
      {ConfirmDialog}

      <Kopf
        titel="Personen"
        symbol={<Users />}
        aktionen={
          <Button onClick={() => setAnlegenOffen(true)} data-testid="person-anlegen-oeffnen">
            <UserPlus className="size-4" aria-hidden="true" />
            Person anlegen
          </Button>
        }
      />

      <Formularseite>
        <Feldgruppe titel="Personen" symbol={<Users />}>
          {isLoading ? (
            <SkeletonText lines={4} />
          ) : isError ? (
            <p className="text-sm text-muted-foreground" data-testid="personen-fehler">
              Die Liste ließ sich nicht laden.
            </p>
          ) : (
            <PersonenListe
              liste={liste}
              istIchSelbst={istIchSelbst}
              verwaltung={b => (
                <Switch
                  checked={b.role === 'admin'}
                  disabled={verwaltungSetzen.isPending || istLetzterAdmin(b)}
                  aria-label={`Verwaltung für ${anzeigeName(b)}`}
                  title={istLetzterAdmin(b) ? 'Der letzte Administrator bleibt.' : undefined}
                  data-testid={`verwaltung-${b.username}`}
                  onCheckedChange={an => verwaltungSetzen.mutate({ id: b.id, verwaltung: an })}
                />
              )}
              aktionen={b =>
                /* Für das eigene Konto stehen hier keine Knöpfe: das Backend
                   lehnt alle für einen selbst ab (das eigene Passwort wechselt
                   man bei der Anmeldung, gelöscht wird man über den
                   Datenschutz). Knöpfe, die sicher scheitern, sind eine
                   Sackgasse. */
                istIchSelbst(b) ? null : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleNeuesStartpasswort(b)}
                      disabled={neuesStartpasswort.isPending}
                      data-testid={`startpasswort-neu-${b.username}`}
                      title="Neues Startpasswort"
                    >
                      <KeyRound className="size-4" aria-hidden="true" />
                      <span className="sr-only">Neues Startpasswort</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleAktiv(b)}
                      disabled={aktivSetzen.isPending}
                      data-testid={`aktiv-${b.username}`}
                      title={b.is_active ? 'Sperren' : 'Wieder zulassen'}
                    >
                      {b.is_active ? (
                        <UserX className="size-4" aria-hidden="true" />
                      ) : (
                        <ShieldCheck className="size-4" aria-hidden="true" />
                      )}
                      <span className="sr-only">{b.is_active ? 'Sperren' : 'Wieder zulassen'}</span>
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
                )
              }
            />
          )}
        </Feldgruppe>

        <Feldgruppe titel="Freigaben: Apps" symbol={<ShieldCheck />}>
          {isLoading ? <SkeletonText lines={3} /> : <FreigabeMatrix benutzer={liste} />}
        </Feldgruppe>

        {ordnerDaten?.zustand?.an !== false && (
          <Feldgruppe titel="Freigaben: Ordner" symbol={<ShieldCheck />}>
            {isLoading ? (
              <SkeletonText lines={3} />
            ) : (
              <RechteMatrix benutzer={liste} ordner={ordnerDaten?.ordner ?? []} />
            )}
          </Feldgruppe>
        )}
      </Formularseite>

      <PersonAnlegenDialog
        offen={anlegenOffen}
        laeuft={anlegen.isPending}
        onSchliessen={() => setAnlegenOffen(false)}
        onAnlegen={handleAnlegen}
      />
      <StartpasswortDialog zettel={zettel} onFertig={() => setZettel(null)} />
    </div>
  );
}
