/**
 * Die Dokumentanzeige hat drei Zusagen, die ohne Browser messbar sind.
 *
 * 1. OHNE QUELLE STEHT DER LEERZUSTAND DA -- nicht ein leerer Kasten und
 *    keine Leiste, die auf nichts zeigt.
 * 2. EIN BILD IST EIN BILD: ein `img` mit dem Namen als Alt-Text, aus einer
 *    Datei ueber eine Objekt-URL, die beim Abraeumen wieder freigegeben wird.
 * 3. EIN FORMAT, DAS SIE NICHT KENNT, SAGT SIE ANSAGE STATT NICHTS -- als
 *    `alert`, denn eine Anzeige, die wortlos leer bleibt, sieht aus wie ein
 *    Ladefehler des Geraets.
 *
 * Der PDF-Weg (pdf.js, Worker, Zeichnen auf die Leinwand) braucht einen
 * Browser und wird von der Schauseite gemessen (`scripts/test/schauseite.mjs`,
 * Zustand »PDF« mit einem beim Rendern gebauten Dokument).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Dateiablage } from '../muster/Dateiablage';
import { Dokumentanzeige } from '../muster/Dokumentanzeige';

describe('Dokumentanzeige', () => {
  it('zeigt ohne Quelle den Leerzustand und keine Leiste', () => {
    render(<Dokumentanzeige leerHinweis="Noch kein Beleg gewählt." />);
    expect(screen.getByText('Noch kein Beleg gewählt.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('zeigt eine Bild-Adresse als Bild, mit Zoom und Vollbild in der Leiste', () => {
    render(<Dokumentanzeige quelle="/belege/foto.png" name="foto.png" />);
    expect(screen.getByAltText('foto.png')).toHaveAttribute('src', '/belege/foto.png');
    expect(screen.getByRole('button', { name: 'Vergrößern' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vollbild' })).toBeInTheDocument();
  });

  it('macht aus einer Bild-Datei eine Objekt-URL und gibt sie beim Abräumen frei', () => {
    // jsdom kennt `URL.createObjectURL` nicht; der Stub ist hier die Messung.
    const anlegen = vi.fn(() => 'blob:probe');
    const freigeben = vi.fn();
    URL.createObjectURL = anlegen;
    URL.revokeObjectURL = freigeben;
    try {
      const bild = new File(['x'], 'scan.png', { type: 'image/png' });
      const { unmount } = render(<Dokumentanzeige quelle={bild} />);
      expect(anlegen).toHaveBeenCalledWith(bild);
      expect(screen.getByAltText('scan.png')).toHaveAttribute('src', 'blob:probe');
      unmount();
      expect(freigeben).toHaveBeenCalledWith('blob:probe');
    } finally {
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('weist ein unbekanntes Format sichtbar ab, statt leer zu bleiben', () => {
    const fremd = new File(['x'], 'daten.bin', { type: 'application/octet-stream' });
    render(<Dokumentanzeige quelle={fremd} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Dieses Format kann hier nicht angezeigt werden.'
    );
  });

  it('steht in der Dateiablage als Vorschau der gewählten Datei', async () => {
    URL.createObjectURL = () => 'blob:vorschau';
    URL.revokeObjectURL = () => undefined;
    try {
      const bild = new File(['x'], 'beleg.png', { type: 'image/png' });
      render(<Dateiablage dateien={[bild]} aufDateien={() => undefined} />);
      await waitFor(() => expect(screen.getByAltText('beleg.png')).toBeInTheDocument());
      // Der Dateiname ist ein Knopf: er wählt, was unten gezeigt wird.
      expect(screen.getByRole('button', { name: 'beleg.png' })).toBeInTheDocument();
    } finally {
      // Abräumen, SOLANGE der Stub noch steht: das Aufgeben der Objekt-URL
      // läuft im Unmount, und der käme sonst erst nach dem `delete`.
      cleanup();
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });
});
