/**
 * Die Beispielapp -- React, ohne Bau (Phase D7, 28.08.2026).
 *
 * Bis D6 war das hier eine HTML-Seite mit vier `getElementById` und zwoelf
 * Zeilen eigenem CSS. Seit D7 gilt: eine App auf diesem Geraet ist React-Code
 * und benutzt das Designsystem, das auch die Shell benutzt -- der Mensch sieht
 * beides in EINEM Rahmen uebereinander, und zwei Erscheinungsbilder auf einem
 * Bildschirm sind kein Geschmack, sondern ein Fehler.
 *
 * KEIN BAUSCHRITT, UND DAS BLEIBT SO. Die Beispielapp hat keine
 * Abhaengigkeiten, kein `npm install`, keinen Eintrag im Wurzel-Lockfile: sie
 * laedt `marken.js`, und darin liegen React, React-DOM und die sechs Bausteine
 * zusammen. Deshalb steht hier `h(Karte, {...})` und nicht `<Karte …/>` -- JSX
 * braucht einen Uebersetzer, und im Browser uebersetzt einer nur mit `eval`,
 * was die Content-Security-Policy dieses Geraets verbietet. Eine App MIT Bau
 * (die Vorlage des Ara-Kits, Phase E5) zieht dieselbe Bibliothek als Quelle
 * und schreibt JSX.
 *
 * Alle Aufrufe gehen an RELATIVE Pfade. Das ist der Grund, warum dieselbe
 * Datei im Livestand (`/apps/beispielapp/`) und im Teststand
 * (`/apps/beispielapp/test/`) laeuft, ohne zu wissen, in welchem sie gerade
 * ist: `api/hallo` loest sich gegen das Verzeichnis der Seite auf.
 */
import {
  h,
  rendern,
  useEffect,
  useState,
  Feld,
  Formular,
  Karte,
  Knopf,
  Kopf,
  Liste,
  ListenEintrag,
  Meldung,
} from './marken.js';

/** Ein Weg dieser App, als Antwort mit Code und Inhalt. */
async function holen(weg, einstellungen = {}) {
  const antwort = await fetch(weg, {
    headers: { accept: 'application/json', ...(einstellungen.headers || {}) },
    ...einstellungen,
  });
  const inhalt = await antwort.json().catch(() => null);
  return { code: antwort.status, inhalt };
}

/**
 * Ein Kasten, der einen Weg holt und drei Zustaende kennt: geholt, leer,
 * kaputt. Der dritte ist der Grund fuer diesen Baustein -- ohne ihn steht
 * beim Fehler dasselbe da wie beim Laden, und niemand weiss, worauf er
 * wartet.
 */
function Weg({ titel, weg, zeigen }) {
  const [stand, setStand] = useState({ laedt: true });

  useEffect(() => {
    let lebt = true;
    holen(weg)
      .then(a => lebt && setStand({ ...a, laedt: false }))
      .catch(f => lebt && setStand({ fehler: f.message, laedt: false }));
    return () => {
      lebt = false;
    };
  }, [weg]);

  if (stand.laedt) return h(Karte, { titel }, 'wird geholt …');
  if (stand.fehler) {
    return h(
      Karte,
      { titel },
      h(Meldung, { art: 'fehler', titel: 'Der Weg antwortet nicht' }, stand.fehler)
    );
  }
  return h(Karte, { titel, hinweis: `HTTP ${stand.code}` }, zeigen(stand.inhalt, stand.code));
}

/** Wer angemeldet ist. `api/me` beantwortet ARASUL, nicht der Container. */
function WerIstDa() {
  return h(Weg, {
    titel: 'Wer ist da',
    weg: 'api/me',
    zeigen: inhalt =>
      h(
        Liste,
        null,
        h(ListenEintrag, { titel: 'Angemeldet', hinweis: inhalt?.data?.benutzer ?? '—' }),
        h(ListenEintrag, { titel: 'Rolle', hinweis: inhalt?.data?.rolle ?? '—' }),
        h(ListenEintrag, { titel: 'Stand', hinweis: inhalt?.data?.stand ?? '—' }),
        h(ListenEintrag, { titel: 'Diese Seite liegt unter', hinweis: location.pathname })
      ),
  });
}

/**
 * Das eigene Backend. Der Pfad in der Antwort ist die eigentliche Aussage: es
 * sieht `/hallo` und nicht `/apps/beispielapp/api/hallo` -- Traefik schneidet
 * das Praefix ab, und eine App muss nicht wissen, unter welchem Namen sie
 * haengt.
 */
function EigenesBackend() {
  return h(Weg, {
    titel: 'Das eigene Backend',
    weg: 'api/hallo',
    zeigen: inhalt =>
      h(
        Liste,
        null,
        h(ListenEintrag, { titel: 'App', hinweis: inhalt?.app ?? '—' }),
        h(ListenEintrag, { titel: 'Pfad, den der Container sieht', hinweis: inhalt?.pfad ?? '—' }),
        h(ListenEintrag, { titel: 'Nutzer aus der Forward-Auth', hinweis: inhalt?.nutzer ?? '—' })
      ),
  });
}

/**
 * Der Schluessel, den das Geraet beim Einspielen gesetzt hat. Zu sehen ist
 * nur, OB er gilt -- der Schluessel selbst verlaesst den Container nicht.
 */
function Schluessel() {
  return h(Weg, {
    titel: 'Der API-Schlüssel dieser App',
    weg: 'api/schluessel',
    zeigen: inhalt =>
      inhalt?.antwort === 200
        ? h(
            Meldung,
            { art: 'erfolg', titel: 'Er gilt' },
            'Die externe Schnittstelle antwortet auf ihn mit 200.'
          )
        : h(
            Meldung,
            { art: 'warnung', titel: 'Er antwortet nicht mit 200' },
            inhalt?.antwort == null
              ? 'Es ist keiner gesetzt.'
              : `Die Schnittstelle antwortet mit ${inhalt.antwort}.`
          ),
  });
}

/**
 * Einen Flow starten und nachsehen, wie weit er ist.
 *
 * Zwei Aufrufe und nicht einer, weil ein Flow Minuten laufen kann und die
 * Zeitgrenzen von Forward-Auth, Traefik und Browser dazwischen alle kuerzer
 * sind (Phase C6).
 */
function FlowStarten() {
  const [woche, setWoche] = useState('34');
  const [lauf, setLauf] = useState(null);
  const [zustand, setZustand] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  const starten = () => {
    setLaeuft(true);
    setFehler('');
    setZustand('');
    holen(`api/flow?flow=wochenbericht&woche=${encodeURIComponent(woche)}`, { method: 'POST' })
      .then(({ code, inhalt }) => {
        setLaeuft(false);
        if (code >= 400 || !inhalt?.lauf) {
          setFehler(`Das Geraet antwortet mit HTTP ${code}.`);
          return;
        }
        setLauf(inhalt.lauf);
      })
      .catch(f => {
        setLaeuft(false);
        setFehler(f.message);
      });
  };

  // Nachfragen, solange ein Lauf offen ist. Der Zeitgeber haengt am Lauf und
  // nicht an einem Knopf: wer den Bericht abwartet, soll nichts druecken.
  useEffect(() => {
    if (lauf === null) return undefined;
    let lebt = true;
    const fragen = () => {
      holen(`api/flow?lauf=${lauf}`).then(({ inhalt }) => {
        if (!lebt) return;
        setZustand(inhalt?.status ?? 'unbekannt');
      });
    };
    fragen();
    const uhr = setInterval(fragen, 3000);
    return () => {
      lebt = false;
      clearInterval(uhr);
    };
  }, [lauf]);

  return h(
    Karte,
    { titel: 'Ein Flow aus dem eigenen Paket' },
    h(
      Formular,
      {
        onAbsenden: starten,
        aktionen: h(
          Knopf,
          { art: 'haupt', typ: 'absenden', gesperrt: laeuft },
          laeuft ? 'Einen Moment …' : 'Wochenbericht starten'
        ),
      },
      h(
        Feld,
        {
          kennung: 'woche',
          beschriftung: 'Kalenderwoche',
          hinweis: 'Das Argument, das der Flow bekommt.',
        },
        h('input', {
          id: 'woche',
          value: woche,
          onChange: e => setWoche(e.target.value),
        })
      )
    ),
    fehler ? h(Meldung, { art: 'fehler', titel: 'Der Flow ist nicht gestartet' }, fehler) : null,
    lauf !== null
      ? h(
          Meldung,
          { art: 'hinweis', titel: `Lauf ${lauf}` },
          zustand ? `Zustand: ${zustand}` : 'wird gefragt …'
        )
      : null
  );
}

function App() {
  return h(
    'main',
    { className: 'ara-strom' },
    h(Kopf, {
      titel: 'Beispielapp',
      beschreibung:
        'Die kleinste App, die beide Wege belegt: eine Seite, die Arasul ausliefert, ' +
        'und eine Schnittstelle aus dem eigenen Container. Gebaut aus dem Designsystem ' +
        'des Geräts.',
    }),
    h(WerIstDa),
    h(EigenesBackend),
    h(Schluessel),
    h(FlowStarten)
  );
}

rendern(h(App), document.getElementById('app'));
