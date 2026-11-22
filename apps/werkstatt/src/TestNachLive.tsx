/**
 * Test nach Live (J44, M7): was in der Testfassung neuer ist als live, je App
 * mit Änderungstext und der Zahl umgesetzter Meldungen. Ein Klick schaltet
 * live -- über denselben Weg wie in der Verwaltung (`POST
 * /api/apps/:id/schalten`): Arasul sichert vorher die Daten der App, schaltet
 * und geht selbst zurück, wenn die neue Fassung nicht startet. Darunter der
 * Rückweg auf die Fassung davor, ebenfalls derselbe Weg.
 */
import { useState, type ReactNode } from 'react';
import { ArrowUpFromLine, Undo2 } from '@marken/symbole';
import {
  Icon,
  Bestaetigung,
  Button,
  Karte,
  Kopf,
  Leerzustand,
  Ladezustand,
  Meldung as Hinweis,
} from '@marken';
import { useSchalten } from './daten';
import { ApiFehler } from './api';
import { anzahl, wartetAufLive, zeit, zurueckMoeglich } from './logik';
import { fest, fliesstext, leise, spalte, text, titel, zeile } from './stil';
import type { AppStand } from './typen';

type Vorhaben = { app: AppStand; ziel: 'live' | 'zurueck' } | null;
type Ausgang = { art: 'erfolg' | 'fehler'; titel: string; text: string } | null;

function satzFuer(v: NonNullable<Vorhaben>): string {
  const { app } = v;
  if (v.ziel === 'zurueck') {
    return `${app.name} geht zurück auf Fassung ${app.live?.vorige_version}. Das ist ein Tausch: dieselbe Rückfrage bringt ${app.live?.version} wieder.`;
  }
  return app.live
    ? `Arasul sichert zuerst die Daten von ${app.name}, schaltet dann Fassung ${app.test?.version} live und geht selbst auf ${app.live.version} zurück, wenn die neue Fassung nicht startet. Das dauert etwa zwei Minuten.`
    : `${app.name} ${app.test?.version} geht zum ersten Mal live. Startet die Fassung nicht, bleibt die App nur im Test.`;
}

export function TestNachLive({
  apps,
  laedt,
  fehler,
  werkzeuge,
}: {
  apps: readonly AppStand[];
  /** Werkzeuge, die jede Ansicht trägt (Neu laden), aus dem Rahmen der Werkstatt. */
  werkzeuge?: ReactNode;
  laedt: boolean;
  fehler: string | null;
}) {
  const schalten = useSchalten();
  const [vorhaben, setVorhaben] = useState<Vorhaben>(null);
  const [ausgang, setAusgang] = useState<Ausgang>(null);
  const wartend = wartetAufLive(apps);
  const zurueck = zurueckMoeglich(apps);

  const ausfuehren = () => {
    if (!vorhaben) return;
    const v = vorhaben;
    setAusgang(null);
    schalten.mutate(
      { appId: v.app.id, ziel: v.ziel },
      {
        onSuccess: daten =>
          setAusgang({
            art: 'erfolg',
            titel: v.ziel === 'live' ? `${v.app.name} ist live` : `${v.app.name} ist zurück`,
            text: `Es läuft jetzt Fassung ${daten.version}.`,
          }),
        onError: e => {
          const hilfe =
            e instanceof ApiFehler && typeof (e.details as { hilfe?: unknown })?.hilfe === 'string'
              ? ` ${(e.details as { hilfe: string }).hilfe}`
              : '';
          setAusgang({
            art: 'fehler',
            titel: `${v.app.name} wurde nicht geschaltet`,
            text: e.message + hilfe,
          });
        },
        onSettled: () => setVorhaben(null),
      }
    );
  };

  return (
    <div style={spalte(2)} data-testid="werkstatt-live">
      <Kopf
        titel="Test nach Live"
        werkzeuge={werkzeuge}
        beschreibung="Was in der Testfassung neuer ist als live. Ein Klick schaltet live, mit Sicherung vorher und Rückweg."
      />
      {ausgang && (
        <Hinweis art={ausgang.art} titel={ausgang.titel} kennzeichen="werkstatt-schalt-ausgang">
          {ausgang.text}
        </Hinweis>
      )}
      {fehler ? (
        <Hinweis
          art="fehler"
          titel="Die Apps ließen sich nicht laden."
          kennzeichen="werkstatt-fehler"
        >
          {fehler}
        </Hinweis>
      ) : laedt ? (
        <Ladezustand meldung="Lädt die Fassungen…" />
      ) : wartend.length === 0 ? (
        <Leerzustand
          symbol={<Icon symbol={ArrowUpFromLine} groesse="gross" />}
          titel="Alles ist live"
          beschreibung="Keine App hat im Test eine Fassung, die live noch fehlt."
        />
      ) : (
        <div style={spalte(3)}>
          {wartend.map(app => (
            <Karte key={app.id} kennzeichen={`werkstatt-wartet-${app.id}`}>
              <div style={spalte(2)}>
                <div style={{ ...zeile(2), justifyContent: 'space-between' }}>
                  <p style={titel}>{app.name}</p>
                  <Button
                    type="button"
                    variant="solid"
                    disabled={schalten.isPending}
                    onClick={() => setVorhaben({ app, ziel: 'live' })}
                    data-testid={`werkstatt-live-schalten-${app.id}`}
                  >
                    {schalten.isPending && schalten.variables?.appId === app.id
                      ? 'Sichert und schaltet…'
                      : 'Live schalten'}
                  </Button>
                </div>
                <p style={text}>
                  Test <span style={fest}>{app.test?.version}</span>
                  {' · '}
                  {app.live ? (
                    <>
                      live <span style={fest}>{app.live.version}</span>
                    </>
                  ) : (
                    'noch nicht live'
                  )}
                </p>
                {app.test?.aenderungstext ? (
                  <p style={fliesstext} data-testid={`werkstatt-aenderung-${app.id}`}>
                    {app.test.aenderungstext}
                  </p>
                ) : (
                  <p style={leise}>Zu dieser Fassung hat der Entwickler nichts geschrieben.</p>
                )}
                <p style={leise}>
                  Eingespielt {zeit(app.test?.eingespielt_am)} ·{' '}
                  {anzahl(app.meldungen.umgesetzt, 'Meldung umgesetzt', 'Meldungen umgesetzt')} ·{' '}
                  {anzahl(app.meldungen.offen, 'offen', 'offen')}
                </p>
                {app.letzte_schaltung &&
                  app.letzte_schaltung.ergebnis !== 'live' &&
                  app.letzte_schaltung.satz && (
                    <p style={leise}>Zuletzt: {app.letzte_schaltung.satz}</p>
                  )}
              </div>
            </Karte>
          ))}
        </div>
      )}

      {!laedt && !fehler && zurueck.length > 0 && (
        <div style={spalte(2)} data-testid="werkstatt-zurueck-liste">
          <p style={titel}>Zuletzt live geschaltet</p>
          {zurueck.map(app => (
            <div key={app.id} style={{ ...zeile(2), justifyContent: 'space-between' }}>
              <p style={text}>
                {app.name}: <span style={fest}>{app.live?.version}</span> seit{' '}
                {zeit(app.letzte_schaltung?.am)}, davor{' '}
                <span style={fest}>{app.live?.vorige_version}</span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={schalten.isPending}
                onClick={() => setVorhaben({ app, ziel: 'zurueck' })}
                data-testid={`werkstatt-zurueck-${app.id}`}
              >
                <Icon symbol={Undo2} /> Zurück
              </Button>
            </div>
          ))}
        </div>
      )}

      <Bestaetigung
        offen={vorhaben !== null}
        beiSchliessen={() => {
          if (!schalten.isPending) setVorhaben(null);
        }}
        beiBestaetigen={ausfuehren}
        titel={
          vorhaben?.ziel === 'zurueck'
            ? `${vorhaben.app.name} zurückschalten?`
            : `${vorhaben?.app.name ?? ''} live schalten?`
        }
        frage={vorhaben ? satzFuer(vorhaben) : ''}
        jaText={vorhaben?.ziel === 'zurueck' ? 'Zurückschalten' : 'Live schalten'}
        laeuft={schalten.isPending}
      />
    </div>
  );
}
