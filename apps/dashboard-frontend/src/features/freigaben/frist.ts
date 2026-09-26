/**
 * Wie lange bleibt Zeit? (Phase D2)
 *
 * Eine Frist ist das einzige Feld einer Freigabe, das sich von selbst ändert,
 * und deshalb steht sie als DAUER da und nicht als Zeitpunkt. „Noch 47 Minuten"
 * beantwortet die Frage, die jemand vor dem Knopf hat; „28.08.2026, 14:12 Uhr"
 * verlangt, dass er sie selbst ausrechnet.
 *
 * Zwei Genauigkeiten, und die Grenze liegt bei einer Stunde: darunter zählen
 * Minuten (die Frist der Abnahme ist zwölf Sekunden lang, die des
 * Beispiel-Flows eine Stunde), darüber genügen Stunden und Tage. Wer bei drei
 * Tagen Restzeit die Minuten mitliest, liest eine Zahl, die sich beim Hinsehen
 * schon geändert hat.
 *
 * Als eigene Datei, weil sie eine reine Funktion ist und der Test sie ohne
 * React prüfen kann.
 */

/** Ist die Frist so knapp, dass die Zeile Aufmerksamkeit verdient? */
const KNAPP_MS = 60 * 60 * 1000;

/**
 * Die Restzeit bis `frist`, in Worten.
 *
 * @param frist ISO-Zeitpunkt aus `approvals.frist`
 * @param jetzt Vergleichszeitpunkt (der Test setzt ihn, sonst „jetzt")
 */
export function restzeit(frist: string, jetzt: number = Date.now()): string {
  const ziel = new Date(frist).getTime();
  if (!Number.isFinite(ziel)) return 'ohne Frist';

  const rest = ziel - jetzt;
  // Abgelaufen, aber noch in der Liste: der Zeitgeber im Backend schreibt den
  // Status erst, wenn der Lauf ihn braucht. Die Zeile stehen zu lassen und zu
  // schweigen wäre die schlechtere Form -- wer hier drückt, bekommt 409.
  if (rest <= 0) return 'Frist abgelaufen';

  const minuten = Math.floor(rest / 60_000);
  if (minuten < 1) return 'noch unter einer Minute';
  if (minuten < 60) return `noch ${minuten} ${minuten === 1 ? 'Minute' : 'Minuten'}`;

  const stunden = Math.floor(minuten / 60);
  if (stunden < 24) return `noch ${stunden} ${stunden === 1 ? 'Stunde' : 'Stunden'}`;

  const tage = Math.floor(stunden / 24);
  return `noch ${tage} ${tage === 1 ? 'Tag' : 'Tage'}`;
}

/** Läuft diese Frist innerhalb der nächsten Stunde ab? */
export function istKnapp(frist: string, jetzt: number = Date.now()): boolean {
  const ziel = new Date(frist).getTime();
  if (!Number.isFinite(ziel)) return false;
  return ziel - jetzt < KNAPP_MS;
}

/**
 * Wie lange wartet eine Anfrage schon? (J35, 26.09.2026)
 *
 * Die Gegenrichtung zur Restzeit, mit denselben Stufen. Wer entscheidet, will
 * wissen, wie lange jemand anderes schon auf ihn wartet; wer eingereicht hat,
 * will wissen, ob „liegt noch" eine Stunde heißt oder drei Tage.
 *
 * @param angefragt ISO-Zeitpunkt aus `approvals.angefragt_am`
 * @param jetzt Vergleichszeitpunkt (der Test setzt ihn, sonst „jetzt")
 */
export function wartetSeit(angefragt: string, jetzt: number = Date.now()): string {
  const beginn = new Date(angefragt).getTime();
  if (!Number.isFinite(beginn)) return 'wartet';

  const minuten = Math.floor(Math.max(0, jetzt - beginn) / 60_000);
  if (minuten < 1) return 'wartet seit eben';
  if (minuten < 60) return `wartet seit ${minuten === 1 ? 'einer Minute' : `${minuten} Minuten`}`;

  const stunden = Math.floor(minuten / 60);
  if (stunden < 24) return `wartet seit ${stunden === 1 ? 'einer Stunde' : `${stunden} Stunden`}`;

  const tage = Math.floor(stunden / 24);
  return `wartet seit ${tage === 1 ? 'einem Tag' : `${tage} Tagen`}`;
}

/** Namen in einem Satz: „a", „a oder b", „a, b oder c" — wie das Backend. */
export function oderListe(namen: string[]): string {
  if (namen.length <= 1) return namen.join('');
  return `${namen.slice(0, -1).join(', ')} oder ${namen[namen.length - 1]}`;
}
