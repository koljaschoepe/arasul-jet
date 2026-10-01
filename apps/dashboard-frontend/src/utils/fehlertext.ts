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

/** Umlaut oder ein häufiges deutsches Wort: dann hat jemand den Satz für Menschen geschrieben. */
const DEUTSCH =
  /[äöüßÄÖÜ]|\b(nicht|kein|keine|keinen|ist|sind|wird|wurde|gibt|Sie|Ihr|Ihre|bitte|und|oder|der|die|das|dem|den|für|mit|auf|zu|noch|nur|eine|ein)\b/;

/**
 * Der Satz für den Toast.
 *
 * @param nachricht Text aus dem Backend (oder `HTTP <Status>`, wenn keiner da war)
 * @param status HTTP-Status der Antwort
 */
export function fehlertext(nachricht: string | null | undefined, status?: number): string {
  const text = (nachricht ?? '').trim();
  const technisch = text === '' || /^HTTP\s*\d{3}/i.test(text) || /\b[45]\d{2}\b/.test(text);
  if (!technisch && DEUTSCH.test(text)) return text;
  if (status !== undefined && NACH_STATUS[status]) return NACH_STATUS[status];
  return ALLGEMEIN;
}
