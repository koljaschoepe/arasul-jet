/**
 * Ein Bild für das Profil vorbereiten: quadratisch zugeschnitten auf 256 px
 * Kantenlänge und als WebP (JPEG, wo der Browser kein WebP schreibt) in einen
 * Data-URL gepackt. Aus einem 6-MB-Foto werden so wenige Zehntel-MB; das Gerät
 * nimmt höchstens 512 KB an.
 */
const KANTE = 256;

export async function bildVerkleinern(datei: File): Promise<string> {
  if (!datei.type.startsWith('image/')) {
    throw new Error('Bitte wählen Sie eine Bilddatei.');
  }
  const bitmap = await createImageBitmap(datei);
  try {
    const seite = Math.min(bitmap.width, bitmap.height);
    const x = (bitmap.width - seite) / 2;
    const y = (bitmap.height - seite) / 2;
    const leinwand = document.createElement('canvas');
    leinwand.width = KANTE;
    leinwand.height = KANTE;
    const ctx = leinwand.getContext('2d');
    if (!ctx) throw new Error('Das Bild ließ sich nicht verarbeiten.');
    ctx.drawImage(bitmap, x, y, seite, seite, 0, 0, KANTE, KANTE);
    const webp = leinwand.toDataURL('image/webp', 0.85);
    return webp.startsWith('data:image/webp') ? webp : leinwand.toDataURL('image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}
