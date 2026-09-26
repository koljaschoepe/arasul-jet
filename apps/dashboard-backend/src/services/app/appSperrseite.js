/**
 * Die Seite, die ein Mensch sieht, wenn eine App ihm nicht offensteht
 * (J35, 26.09.2026, Auftrag freigabe-sagt-wer-entscheidet).
 *
 * Bis dahin bekam ein Browser unter `/apps/<id>/` ohne Freigabe dasselbe wie
 * ein `fetch`: `{"error":{"code":"FORBIDDEN",...}}` — rohes JSON, im Rahmen
 * der Shell oder in einem eigenen Tab, und darin ein Satz fuer Entwickler
 * („auch fuer sich selbst: eine Sonderregel fuer Administratoren gibt es
 * nicht"). Eine Grenze, die aussieht wie ein Absturz, ist keine Grenze,
 * sondern ein Fehler — und genau so hat sie der Mitarbeiter gelesen.
 *
 * NUR FUER DIE SEITE, NIE FUER DIE SCHNITTSTELLE: dieselbe Unterscheidung wie
 * beim fehlenden Anmelden in `routes/appAusliefern.js`. Ein Programm, das
 * HTML bekommt, wo es JSON erwartet, meldet einen Fehler, der nach seinem
 * eigenen aussieht. Entschieden wird deshalb am `Accept` der Anfrage — ein
 * Browser, der eine Seite laedt, nennt `text/html` vor allem anderen; `curl`
 * und `fetch` nennen `*\/*` und bekommen weiter JSON.
 *
 * EIN SATZ UND EIN WEG ZURUECK. Keine Kennung, kein Fehlercode, keine
 * Erklaerung, wie die Regel lautet — wer davorsteht, will wissen, ob er etwas
 * falsch gemacht hat (nein) und wer es aendern kann (ein Administrator).
 *
 * WARUM DIE FARBEN HIER STEHEN und nicht aus `theme.css` kommen: die Seite
 * kommt aus dem Backend-Container, und der hat die Bibliothek nicht. Es sind
 * die fuenf Tokens, die eine Seite aus nichts als einem Satz braucht, in
 * beiden Themes, mit ihrem Namen aus `packages/marken/src/theme.css`. Der
 * Link zielt auf `_top`: die Seite steht meist im Rahmen der Shell, und die
 * Uebersicht in einem iframe waere eine Shell in der Shell.
 */

const TOKENS = {
  hell: {
    background: '#f6f6f6',
    foreground: '#1a1a1a',
    card: '#ffffff',
    primary: '#1e6aa4',
    'muted-foreground': '#666666',
  },
  dunkel: {
    background: '#141414',
    foreground: '#e6e6e6',
    card: '#181818',
    primary: '#81a1c1',
    'muted-foreground': 'rgba(228, 228, 228, 0.55)',
  },
};

function variablen(werte) {
  return Object.entries(werte)
    .map(([name, wert]) => `--${name}: ${wert};`)
    .join(' ');
}

function escape(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Welcher Satz zu welchem Fehler gehoert. `null` heisst: diesen Fehler kennt
 * die Seite nicht, er geht als JSON an den Fehlerbehandler wie bisher.
 *
 * @param {{statusCode:number, code:string, grund?:string}} fehler
 * @param {{kennung:string, stand:'live'|'test'}} pfad
 * @returns {{satz:string, weg?:{href:string, text:string}}|null}
 */
function satzFuer(fehler, pfad) {
  if (fehler.grund === 'nur_tester') {
    return {
      satz: 'Den Teststand dieser App sehen nur ihre Tester.',
      weg: { href: `/apps/${pfad.kennung}/`, text: 'Zur freigegebenen Fassung' },
    };
  }
  if (fehler.grund === 'ohne_seite') {
    return { satz: 'Diese App hat keine eigene Seite, sie arbeitet im Hintergrund.' };
  }
  if (fehler.statusCode === 403) {
    return {
      satz: 'Diese App ist für Sie nicht freigegeben, ein Administrator kann das ändern.',
    };
  }
  if (fehler.code === 'APP_DATEIEN_FEHLEN') {
    return {
      satz: 'Diese App ist auf dem Gerät gerade nicht vollständig, ein Administrator spielt sie neu ein.',
    };
  }
  if (fehler.statusCode === 404) {
    return { satz: 'Diese App gibt es auf diesem Gerät nicht.' };
  }
  return null;
}

/**
 * Die Seite selbst.
 *
 * @param {object} was
 * @param {string} was.satz
 * @param {{href:string, text:string}} [was.weg]  ein zweiter Weg neben der Uebersicht
 * @param {'light'|'dark'} [was.theme]
 */
function sperrseite({ satz, weg = null, theme = 'light' }) {
  const dunkel = theme === 'dark';
  const zweiter = weg ? `<a href="${escape(weg.href)}" target="_top">${escape(weg.text)}</a>` : '';
  return `<!doctype html>
<html lang="de"${dunkel ? ' data-theme="dark"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nicht verfügbar – Arasul</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<style>
  :root { ${variablen(TOKENS.hell)} }
  [data-theme='dark'] { ${variablen(TOKENS.dunkel)} }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center; padding: 1.5rem;
    box-sizing: border-box; background: var(--background); color: var(--foreground);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    font-size: 0.9375rem; line-height: 1.5;
  }
  main { max-width: 28rem; text-align: center; }
  .marke { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-foreground); margin: 0 0 1rem; }
  p.satz { margin: 0 0 1.25rem; font-size: 1rem; }
  nav { display: flex; gap: 1.25rem; justify-content: center; flex-wrap: wrap; }
  a { color: var(--primary); font-weight: 500; text-decoration: none; }
  a:hover, a:focus-visible { text-decoration: underline; }
</style>
</head>
<body>
<main data-sperrseite>
<p class="marke">Arasul</p>
<p class="satz">${escape(satz)}</p>
<nav><a href="/workspace" target="_top">Zur Übersicht</a>${zweiter}</nav>
</main>
</body>
</html>
`;
}

/**
 * Will diese Anfrage eine Seite sehen? Nur dann gibt es HTML statt JSON.
 * Eine Datei der App (`assets/x.js`) und die Schnittstelle bleiben JSON.
 */
function willSeite(req, { istSchnittstelle, istDatei }) {
  if (istSchnittstelle || istDatei) {
    return false;
  }
  return req.accepts(['json', 'html']) === 'html';
}

module.exports = { sperrseite, satzFuer, willSeite, TOKENS };
