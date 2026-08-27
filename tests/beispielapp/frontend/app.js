// Der Aufruf geht an einen RELATIVEN Pfad. Das ist der Grund, warum dieselbe
// Datei im Livestand (/apps/beispielapp/) und im Teststand
// (/apps/beispielapp/test/) funktioniert, ohne zu wissen, in welchem sie
// gerade laeuft: `api/hallo` loest sich gegen das Verzeichnis der Seite auf.
document.getElementById('pfad').textContent = location.pathname;

function zeigen(feld, text) {
  document.getElementById(feld).textContent = text;
}

function holen(weg) {
  return fetch(weg, { headers: { accept: 'application/json' } }).then(antwort =>
    antwort.json().then(inhalt => ({ code: antwort.status, inhalt }))
  );
}

// `api/me` beantwortet Arasul selbst, nicht der Container dieser App (Phase
// C4). Eine App darf ganz ohne Backend auskommen; dann waere hier sonst
// niemand, der sagen koennte, wer angemeldet ist.
holen('api/me')
  .then(({ inhalt }) => zeigen('name', inhalt.data ? inhalt.data.benutzer : '—'))
  .catch(() => zeigen('name', '—'));

holen('api/hallo')
  .then(({ code, inhalt }) => zeigen('antwort', `HTTP ${code}\n${JSON.stringify(inhalt, null, 2)}`))
  .catch(fehler => zeigen('antwort', `Das Backend antwortet nicht: ${fehler.message}`));

// Der API-Schluessel, den das Geraet beim Einspielen in den Container gesetzt
// hat. Zu sehen ist nur, OB er gilt — der Schluessel selbst verlaesst den
// Container nicht.
holen('api/schluessel')
  .then(({ inhalt }) =>
    zeigen(
      'schluessel',
      inhalt.antwort === 200
        ? 'gilt (die externe Schnittstelle antwortet 200)'
        : `antwortet ${inhalt.antwort === null ? 'gar nicht, es ist keiner gesetzt' : inhalt.antwort}`
    )
  )
  .catch(fehler => zeigen('schluessel', `nicht zu pruefen: ${fehler.message}`));
