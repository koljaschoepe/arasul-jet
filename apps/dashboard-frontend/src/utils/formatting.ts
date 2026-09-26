/**
 * Formatting Utilities
 * Common formatting functions used across components
 */

/**
 * Format a date string to German locale format
 * @param dateString - ISO date string
 * @returns Formatted date string (DD.MM.YYYY, HH:mm)
 */
/** Platzhalter für „kein Wert“ in einer Zelle. */
const KEIN_WERT = '—';

export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Eine Bytezahl in die Groesse, die daneben geschrieben steht (Plan 023 D4).
 *
 * Am 21.08.2026 auf dem Geraet gemessen, alles auf einer Kachel: in der
 * Kopfzeile stand `261 MB`, im Text derselben Kachel `~274 MB`, auf der
 * Detailseite noch einmal `261 MB`. Der Katalogwert ist 274000000 Bytes, und
 * das sind 274 MB. Die 261 entstanden, weil hier durch 1024³ geteilt und
 * trotzdem "MB" darueber geschrieben wurde: das ist MiB mit falschem Etikett.
 *
 * Gerechnet wird jetzt in Tausenderschritten, weil die Quelle es so meint.
 * `size_bytes` kommt aus dem Katalog, und der beschreibt dasselbe Modell im
 * Fliesstext als "~274 MB". Ollama meldet im Pull-Strom ebenfalls Bytes, und
 * Modellanbieter geben ihre Groessen in Tausenderschritten an. Wer 1024er
 * rechnen will, muss auch GiB darueber schreiben, und das liest kein Kunde.
 *
 * Der Arbeitsspeicher folgt einer anderen Regel und hat deshalb eine eigene
 * Funktion (`zuGb` in `utils/modellZustand.ts`): `RAM_LIMIT_LLM=32G` ist fuer
 * Docker 32 GiB, und die Hardware wird ueberall als "32 GB" verkauft.
 */
export const formatBytes = (bytes: number | null | undefined): string => {
  // Null ist eine bekannte Groesse, keine unbekannte: am Anfang eines
  // Downloads ist noch nichts geladen, und "N/A von 16,4 GB" waere Unsinn.
  if (bytes === null || bytes === undefined) return 'unbekannt';
  // Unter einem Kilobyte in Bytes, genau wie `formatBytesBinaer`: "0 KB" sagt
  // fuer eine Datei mit zwoelf Zeichen nichts, "12 B" schon. Zwei
  // Schwesterfunktionen, die bei derselben Zahl verschiedene Einheiten
  // schrieben, waeren in einem PR ueber Einheiten das falsche Vorbild.
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 0 })} MB`;
  }
  return `${(bytes / 1_000).toLocaleString('de-DE', { maximumFractionDigits: 0 })} KB`;
};

/**
 * Dieselbe Bytezahl, aber in 1024er-Schritten (Plan 023 D4).
 *
 * Es gibt genau zwei Zaehlweisen im Produkt, und welche gilt, haengt daran,
 * womit der Kunde die Zahl vergleicht:
 *
 * - `formatBytes`, Tausenderschritte: alles, was jemand anderes ausgedruckt
 *   hat. Modellgroessen aus dem Katalog, Downloads, Aktualisierungsdateien.
 *   Der Anbieter schreibt "274 MB" auf seine Seite, also steht das auch hier.
 * - `formatBytesBinaer`, 1024er-Schritte: alles, was das Betriebssystem sagt.
 *   `df -h` nennt die Platte dieses Geraets "1,8T", nicht "2,0T", und wer im
 *   Terminal nachsieht, soll dieselbe Zahl finden. Dasselbe gilt fuer
 *   Docker-Grenzwerte: `RAM_LIMIT_LLM=32G` sind 32 GiB.
 *
 * Zwei Zaehlweisen sind eine mehr als der Plan verlangt. Eine waere aber
 * falsch: mit Tausenderschritten hiesse dieselbe Platte 2,0 TB und derselbe
 * Grenzwert 34,4 GB, und beides widerspraeche dem, was danebensteht.
 *
 * Fuer den KI-RAM gibt es `zuGb` in `utils/modellZustand.ts`, weil das Budget
 * schon in Megabyte hereinkommt und die Zahl dort ohne Einheit gebraucht wird.
 */
export const formatBytesBinaer = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined) return 'unbekannt';
  if (bytes < 1024) return `${bytes} B`;
  const gib = 1024 ** 3;
  const mib = 1024 ** 2;
  if (bytes >= gib) {
    return `${(bytes / gib).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`;
  }
  if (bytes >= mib) {
    return `${(bytes / mib).toLocaleString('de-DE', { maximumFractionDigits: 0 })} MB`;
  }
  return `${(bytes / 1024).toLocaleString('de-DE', { maximumFractionDigits: 0 })} KB`;
};

/**
 * Eine Laufzeit, wie man sie liest (J35): „2 Tage, 5 Stunden" statt
 * „2d 5h 30m". Zwei Stellen reichen -- wer seit zwei Tagen läuft, fragt
 * nicht nach den Minuten.
 */
export const formatUptime = (seconds: number | null | undefined): string => {
  if (!seconds || seconds < 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const teil = (n: number, eins: string, mehr: string) =>
    n === 1 ? `1 ${eins}` : `${n.toLocaleString('de-DE')} ${mehr}`;

  const parts: string[] = [];
  if (days > 0) parts.push(teil(days, 'Tag', 'Tage'));
  if (hours > 0) parts.push(teil(hours, 'Stunde', 'Stunden'));
  if (days === 0 && (minutes > 0 || parts.length === 0))
    parts.push(teil(minutes, 'Minute', 'Minuten'));

  return parts.slice(0, 2).join(', ');
};

/**
 * Eine Zahl, wie man sie in Deutschland liest (J35): Komma statt Punkt,
 * Punkt als Tausendertrenner. `toFixed` kennt kein Land und schreibt „1.5".
 */
export const formatZahl = (n: number | null | undefined, stellen = 0): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return KEIN_WERT;
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  });
};

/**
 * Format date as relative time in German (e.g., "vor 5 Min.", "vor 2 Std.")
 * @param dateString - ISO date string
 * @returns Relative time string (German locale)
 */
export const formatRelativeDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '–';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'gerade eben';
  if (diffMins < 60) return `vor ${diffMins} Min.`;
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  if (diffDays < 7) return `vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;

  return date.toLocaleString('de-DE');
};

/**
 * Die Fassung, wie ein Mensch sie liest (J35).
 *
 * Aus dem Bau kommt entweder eine Releasenummer (`1.2.0`) oder Datum plus
 * Kurz-SHA (`20260926-dc1272c`, `scripts/lib/fassung.sh`). Die zweite Form
 * ist eine Versionskennung fuer den Betreuer, keine Auskunft fuer eine
 * Kanzlei; vorn steht deshalb „Stand 26.09.2026", und die Kennung selbst
 * steht unter „Technische Angaben".
 */
export const fassungLesbar = (fassung: string | null | undefined): string => {
  if (!fassung) return KEIN_WERT;
  const datiert = /^(\d{4})(\d{2})(\d{2})-[0-9a-f]{4,}$/i.exec(fassung.trim());
  if (datiert) return `Stand ${datiert[3]}.${datiert[2]}.${datiert[1]}`;
  return fassung.trim();
};

/**
 * Eine Groesse im Format von `du -h` („240.1M", „1.5G") auf Deutsch (J35):
 * „240,1 MB". Der Sicherungsbericht schreibt so; was sich nicht lesen laesst,
 * bleibt, wie es kam.
 */
export const duGroesseLesbar = (roh: string | null | undefined): string => {
  if (!roh) return '';
  const m = /^\s*([\d.]+)\s*([KMGT])i?B?\s*$/i.exec(roh);
  if (!m) return roh;
  const zahl = Number(m[1]);
  if (Number.isNaN(zahl)) return roh;
  return `${zahl.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${(m[2] ?? '').toUpperCase()}B`;
};
