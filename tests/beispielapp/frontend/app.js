// Der Aufruf geht an einen RELATIVEN Pfad. Das ist der Grund, warum dieselbe
// Datei im Livestand (/apps/beispielapp/) und im Teststand
// (/apps/beispielapp/test/) funktioniert, ohne zu wissen, in welchem sie
// gerade laeuft: `api/hallo` loest sich gegen das Verzeichnis der Seite auf.
document.getElementById('pfad').textContent = location.pathname;

fetch('api/hallo', { headers: { accept: 'application/json' } })
  .then(antwort => antwort.json().then(inhalt => ({ code: antwort.status, inhalt })))
  .then(({ code, inhalt }) => {
    document.getElementById('antwort').textContent =
      `HTTP ${code}\n${JSON.stringify(inhalt, null, 2)}`;
  })
  .catch(fehler => {
    document.getElementById('antwort').textContent =
      `Das Backend antwortet nicht: ${fehler.message}`;
  });
