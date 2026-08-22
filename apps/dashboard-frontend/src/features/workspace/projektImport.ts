/**
 * Projekt aus einem Ordner oder aus GitHub anlegen (Plan 023 G2).
 *
 * Beide Wege setzen nur zusammen, was es schon gibt: das Projekt entsteht wie
 * immer über `POST /projects`, und danach wird der Inhalt hineingelegt. Für den
 * Ordner ist das der Ablage-Upload je Datei, für GitHub die Kopplung plus ein
 * erster Sync. Ein eigener Endpunkt wäre eine dritte Stelle, an der dieselbe
 * Ablage befüllt wird.
 *
 * Die Logik steht hier und nicht im Dialog, weil sie sich sonst nur über einen
 * gezeichneten Dialog prüfen ließe: die Pfadableitung aus `webkitRelativePath`
 * ist der Teil, an dem ein Ordnerimport still falsch wird.
 */

/** Was ein Aufrufer über den Fortschritt erfährt. */
export interface ImportFortschritt {
  /** Bereits verarbeitete Dateien. */
  fertig: number;
  /** Insgesamt zu verarbeitende Dateien. */
  gesamt: number;
  /** Name der Datei, die gerade läuft. */
  aktuell: string;
}

export interface OrdnerErgebnis {
  hochgeladen: number;
  /** Dateien, die nicht ankamen, mit Grund. Der Import bricht deshalb nicht ab. */
  fehler: Array<{ pfad: string; grund: string }>;
}

/**
 * Zielordner aus dem `webkitRelativePath` einer Datei ableiten.
 *
 * Der Browser liefert bei einem Verzeichnis-Upload immer den gewählten Ordner
 * als erstes Segment: wer `Projekte/kunde-a` wählt, bekommt
 * `kunde-a/vertraege/2026.pdf`. Dieses erste Segment gehört NICHT ins Ziel — es
 * ist das Projekt selbst. Sonst läge alles eine Ebene zu tief, unter einem
 * Ordner mit dem Namen des Quellordners.
 *
 * @param relativerPfad `webkitRelativePath` der Datei
 * @returns Zielordner relativ zur Projektwurzel, '' für die Wurzel
 */
export function zielOrdner(relativerPfad: string): string {
  const teile = String(relativerPfad || '')
    .split('/')
    .filter(t => t !== '' && t !== '.');
  // Erstes Segment (der gewählte Ordner) und letztes (der Dateiname) fallen weg.
  return teile.slice(1, -1).join('/');
}

/**
 * Soll diese Datei mitkommen?
 *
 * `.git` fliegt raus: der Ordnerimport ist kein Klon, und eine mitgeschleppte
 * halbe Git-Verwaltung im Projektordner würde eine spätere GitHub-Kopplung
 * verwirren (der Sync prüft genau dort auf ein vorhandenes Repository).
 * `.DS_Store` und `node_modules` fliegen raus, weil sie niemand meint.
 */
export function nimmMit(relativerPfad: string): boolean {
  const teile = String(relativerPfad || '').split('/');
  return !teile.some(t => t === '.git' || t === 'node_modules' || t === '.DS_Store');
}

/** Kürzt eine Fehlermeldung auf etwas, das in eine Zeile passt. */
function grundText(err: unknown): string {
  const roh = err instanceof Error ? err.message : String(err ?? '');
  return roh.slice(0, 160) || 'unbekannter Fehler';
}

/**
 * Alle Dateien eines gewählten Ordners in die Ablage des Projekts legen.
 *
 * Nacheinander, nicht parallel: das Gerät rechnet nebenher ein Sprachmodell,
 * und jeder Upload stößt am Ende einen Ordner-Abgleich an. Zwanzig gleichzeitige
 * Uploads brächten nichts außer zwanzig gleichzeitigen Abgleichen.
 *
 * Eine einzelne gescheiterte Datei bricht den Import NICHT ab. Bei dreihundert
 * Dateien wäre das die schlechtere Wahl: der Nutzer stünde mit einem halb
 * gefüllten Projekt da und wüsste nicht, wo es aufgehört hat. Stattdessen läuft
 * alles durch, und am Ende steht, was fehlt.
 */
export async function ordnerHochladen(
  projektId: string,
  dateien: File[],
  hochladen: (projektId: string, form: FormData) => Promise<unknown>,
  melde?: (f: ImportFortschritt) => void
): Promise<OrdnerErgebnis> {
  const fehler: OrdnerErgebnis['fehler'] = [];
  let hochgeladen = 0;
  const gesamt = dateien.length;

  for (let i = 0; i < gesamt; i += 1) {
    const datei = dateien[i];
    if (!datei) continue;
    const rel = (datei as File & { webkitRelativePath?: string }).webkitRelativePath || datei.name;
    melde?.({ fertig: i, gesamt, aktuell: datei.name });
    const form = new FormData();
    form.append('file', datei);
    const ordner = zielOrdner(rel);
    if (ordner) form.append('ordner', ordner);
    try {
      await hochladen(projektId, form);
      hochgeladen += 1;
    } catch (err) {
      fehler.push({ pfad: rel, grund: grundText(err) });
    }
  }
  melde?.({ fertig: gesamt, gesamt, aktuell: '' });
  return { hochgeladen, fehler };
}

/** Dateien eines Verzeichnis-Uploads filtern und sortieren. */
export function ordnerDateien(liste: FileList | File[] | null): File[] {
  if (!liste) return [];
  const alle = Array.from(liste as ArrayLike<File>);
  return alle.filter(d => {
    const rel = (d as File & { webkitRelativePath?: string }).webkitRelativePath || d.name;
    return nimmMit(rel);
  });
}

/** Name des gewählten Ordners, als Vorschlag für den Projektnamen. */
export function ordnerName(liste: File[]): string {
  const erste = liste[0];
  if (!erste) return '';
  const rel = (erste as File & { webkitRelativePath?: string }).webkitRelativePath || '';
  return rel.split('/')[0] ?? '';
}

/**
 * Projektname aus einer Repository-Adresse ableiten.
 *
 * `https://github.com/org/mein-repo.git` wird zu `mein-repo`. Nur ein
 * Vorschlag: der Nutzer kann ihn überschreiben.
 */
export function repoName(url: string): string {
  const roh = String(url || '').trim();
  if (!roh) return '';
  const ohneEnde = roh.replace(/\.git$/i, '').replace(/\/+$/, '');
  const letztes = ohneEnde.split('/').pop() ?? '';
  // SSH-Kurzform git@github.com:org/repo hat kein / vor dem Namen.
  return letztes.split(':').pop() ?? '';
}
