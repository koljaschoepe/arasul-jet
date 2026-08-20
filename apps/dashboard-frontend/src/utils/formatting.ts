/**
 * Formatting Utilities
 * Common formatting functions used across components
 */

/**
 * Format a date string to German locale format
 * @param dateString - ISO date string
 * @returns Formatted date string (DD.MM.YYYY, HH:mm)
 */
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
  if (bytes === null || bytes === undefined) return 'N/A';
  if (bytes === 0) return '0 KB';
  // Unter einem Kilobyte in Bytes: "0 KB" sagt fuer eine Datei mit zwoelf
  // Zeichen nichts, "12 B" schon.
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
  if (bytes === null || bytes === undefined) return 'N/A';
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
 * Format uptime in seconds to human-readable format
 * @param seconds - Uptime in seconds
 * @returns Formatted uptime (e.g., "2d 5h 30m")
 */
export const formatUptime = (seconds: number | null | undefined): string => {
  if (!seconds || seconds < 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(' ');
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
