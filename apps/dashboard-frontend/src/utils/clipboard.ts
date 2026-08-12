/**
 * Robustes In-die-Zwischenablage-Kopieren (Plan 017 Schritt 8).
 *
 * `navigator.clipboard` gibt es nur in einem „secure context". Auf dem Gerät
 * läuft das Dashboard hinter einem selbst-signierten Zertifikat an einer
 * LAN-/Tailscale-IP; hat der Nutzer das Zertifikat nicht als vertrauenswürdig
 * eingestuft, ist `navigator.clipboard` schlicht `undefined` und der Kopieren-
 * Knopf tat bisher still nichts. Deshalb: erst die moderne API versuchen, dann
 * auf das alte `document.execCommand('copy')` über ein verstecktes Textfeld
 * zurückfallen. Gibt zurück, ob es geklappt hat — der Aufrufer kann sonst das
 * manuelle Auswahlfeld anbieten.
 */
export async function copyText(text: string): Promise<boolean> {
  // 1. Moderne API (nur im secure context vorhanden).
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fällt auf execCommand zurück
  }

  // 2. Fallback: verstecktes Textarea markieren + execCommand.
  // Den vorher fokussierten Fokus danach wiederherstellen (Tastatur-/
  // Screenreader-Kontinuität); das Textarea wird IMMER entfernt (finally),
  // auch wenn execCommand wirft statt false zurückzugeben.
  const zuvorFokussiert = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  try {
    ta.value = text;
    // Außerhalb des Sichtfelds, aber selektierbar (nicht display:none — dann
    // ließe sich der Inhalt nicht markieren).
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    if (ta.parentNode) {
      ta.remove();
    }
    zuvorFokussiert?.focus?.();
  }
}
