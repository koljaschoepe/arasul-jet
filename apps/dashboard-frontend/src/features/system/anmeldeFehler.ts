/**
 * Was die Anmeldeseite sagt, wenn eine Anmeldung scheitert (J34, 27.09.2026).
 *
 * Unterschieden wird nach dem CODE des Backends, nicht nach dem Status: ein
 * 403 ist ein gesperrtes Konto, ein stillgelegtes, eine abgewiesene Herkunft
 * (`ORIGIN_NOT_ALLOWED`) oder ein CSRF-Fehler. Bis J34 hieß jeder 403
 * „gesperrt" — unter `https://arasul` wies die CORS-Regel die Anmeldung ab,
 * und die Seite schickte einen Menschen mit einem gesunden Konto zum
 * Administrator. „Gesperrt" steht deshalb NUR nach `ACCOUNT_LOCKED`, und jeder
 * technische Grund sagt ausdrücklich, dass mit dem Konto alles in Ordnung ist.
 */

export interface AnmeldeFehler {
  status?: number;
  code?: string;
  name?: string;
}

const KONTO_IN_ORDNUNG = 'Mit dem Konto ist alles in Ordnung.';

export function anmeldeFehlerText(fehler: AnmeldeFehler, zeitUm = false): string {
  if (zeitUm || fehler.name === 'TimeoutError' || fehler.status === 408) {
    return `Das Gerät hat nicht rechtzeitig geantwortet. ${KONTO_IN_ORDNUNG} Bitte gleich noch einmal versuchen.`;
  }
  switch (fehler.code) {
    case 'ACCOUNT_LOCKED':
      return 'Dieses Konto ist nach zu vielen falschen Passwörtern für 15 Minuten gesperrt. Danach geht es wieder; sofort hilft der Administrator.';
    case 'ACCOUNT_DISABLED':
      return 'Dieses Konto ist stillgelegt. Bitte den Administrator ansprechen.';
    case 'ORIGIN_NOT_ALLOWED':
      return `Das Gerät nimmt unter dieser Adresse keine Anmeldung an. ${KONTO_IN_ORDNUNG} Bitte das Gerät unter der Adresse öffnen, die der Administrator genannt hat.`;
    default:
      break;
  }
  if (fehler.status === 401) {
    return 'Benutzername oder Passwort ist falsch.';
  }
  if (fehler.status === 429) {
    return 'Zu viele Anmeldeversuche. Bitte einen Moment warten und erneut versuchen.';
  }
  if (typeof fehler.status === 'number' && fehler.status >= 500) {
    return `Das Gerät ist gerade nicht bereit. ${KONTO_IN_ORDNUNG} Bitte in einer Minute noch einmal versuchen.`;
  }
  if (fehler.status === undefined) {
    return `Keine Verbindung zum Gerät. ${KONTO_IN_ORDNUNG} Bitte die Netzwerkverbindung prüfen.`;
  }
  // Jeder andere Status (ein 403 ohne engeren Code, ein 400 …) ist ein
  // technischer Grund und keine Aussage über das Konto.
  return `Die Anmeldung ist aus technischen Gründen gescheitert. ${KONTO_IN_ORDNUNG} Bitte die Seite neu laden und noch einmal versuchen.`;
}
