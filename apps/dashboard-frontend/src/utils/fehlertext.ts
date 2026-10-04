/**
 * Was ein Mensch in einer Meldung liest (J36, 02.10.2026).
 *
 * Das Backend schreibt seine Fehler für Maschinen und Entwickler: manche
 * deutsch („Diesen Ausweis gibt es nicht."), viele englisch („Resource not
 * found"), und wo nichts vorlag, steht dort „HTTP 500". Ein Mitarbeiter, der
 * einen Urlaubsantrag stellt, hat damit nichts anzufangen. Der Toast zeigt
 * deshalb nur einen Satz, den ein Mensch lesen kann: einen deutschen Satz des
 * Backends bleibt, was nach Technik klingt, wird durch einen Satz zum Status
 * ersetzt. Die Ausnahme (`Error.message`) behält den Originaltext für Logs
 * und Tests.
 */

/** Ein Satz je Status, für alles, was kein verständlicher deutscher Text trägt. */
const NACH_STATUS: Record<number, string> = {
  400: 'Die Eingabe passt nicht. Bitte prüfen Sie sie und versuchen Sie es noch einmal.',
  403: 'Dafür fehlt Ihnen die Berechtigung.',
  404: 'Das gibt es nicht mehr.',
  409: 'Das hat sich inzwischen geändert. Bitte laden Sie neu und versuchen Sie es noch einmal.',
  413: 'Die Datei ist zu groß.',
  429: 'Zu viele Versuche. Bitte warten Sie einen Moment.',
  503: 'Das Gerät kann das gerade nicht. Bitte versuchen Sie es gleich noch einmal.',
};

const ALLGEMEIN = 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.';

/**
 * Umlaut, deutsches Anführungszeichen oder ein häufiges deutsches Wort: dann
 * hat jemand den Satz für Menschen geschrieben.
 */
const DEUTSCH =
  /[äöüßÄÖÜ„]|\b(nicht|kein|keine|keinen|ist|sind|wird|wurde|gibt|Sie|Ihr|Ihre|bitte|und|oder|der|die|das|dem|den|für|mit|auf|zu|noch|nur|eine|ein|kann|muss|darf|hat|schon|bereits|mehr|als|im|vom|zum|zur|ohne|bei)\b/;

/**
 * Spuren von Technik, auch mitten in einem deutschen Satz: ein Statuscode,
 * ein Systemfehler (ECONNREFUSED), eine Adresse mit Port, ein Pfad, ein
 * Bezeichner mit Unterstrich, Klammern aus JSON oder HTML, ein Stapel.
 * „Container app-x ist nicht erreichbar (ECONNREFUSED 172.18.0.5:3000)" ist
 * deutsch und trotzdem nichts für einen Mitarbeiter. Eine Uhrzeit (14:30)
 * und das Wort „null" bleiben erlaubt.
 */
const TECHNIK =
  /^HTTP\s*\d{3}|\b[45]\d{2}\b|\bE[A-Z]{3,}\b|\d+\.\d+\.\d+\.\d+|[a-z][\w.-]*:\d{2,5}\b|\/[\w.-]+\/|\b[a-z]+_[a-z_]+\b|[{}<>[\]]|\w+Error\b|\bat\s+\S+\s+\(|\bundefined\b/;

/**
 * Der Satz für den Toast oder die Zeile unter einem Formular — die eine
 * Funktion für jede Fehleranzeige.
 *
 * @param fehler Text aus dem Backend (oder `HTTP <Status>`, wenn keiner da
 *   war) oder gleich die geworfene Ausnahme; deren `status` gilt, wenn kein
 *   eigener mitkommt
 * @param status HTTP-Status der Antwort
 * @param sonst Satz, wenn weder Text noch Status etwas taugen
 */
export function fehlertext(fehler: unknown, status?: number, sonst: string = ALLGEMEIN): string {
  let nachricht: unknown = fehler;
  if (fehler !== null && typeof fehler === 'object') {
    const e = fehler as { message?: unknown; status?: unknown };
    nachricht = e.message;
    if (status === undefined && typeof e.status === 'number') status = e.status;
  }
  const text = typeof nachricht === 'string' ? nachricht.trim() : '';
  if (text !== '' && !TECHNIK.test(text) && DEUTSCH.test(text)) return text;
  const nachStatus = status === undefined ? undefined : NACH_STATUS[status];
  return nachStatus ?? sonst;
}
