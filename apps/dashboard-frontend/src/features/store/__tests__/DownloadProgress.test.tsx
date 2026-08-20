/**
 * Fortschritt in Prozent UND Megabyte (Plan 023 D3).
 *
 * Bis zum 21.08.2026 zeigte die Anzeige nur einen Prozentwert. Ollama meldet
 * in jeder Zeile des Pull-Stroms `completed` und `total` in Bytes, und
 * `llm_installed_models` hat seit Migration 083 zwei Spalten dafuer; beides
 * wurde fallen gelassen. Bei einem Modell von 16 GB ist "12 %" der
 * Unterschied zwischen "gleich fertig" und "geh einen Kaffee holen".
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DownloadProgress from '../DownloadProgress';

describe('DownloadProgress', () => {
  it('nennt die Menge neben dem Prozentwert, deutsch geschrieben', () => {
    render(
      <DownloadProgress
        downloadState={{
          progress: 12,
          phase: 'download',
          status: 'Lädt',
          bytesCompleted: 1_970_000_000,
          bytesTotal: 16_400_000_000,
        }}
      />
    );
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('2 GB von 16,4 GB')).toBeInTheDocument();
  });

  it('schreibt kleine Modelle in Megabyte', () => {
    render(
      <DownloadProgress
        downloadState={{
          progress: 50,
          phase: 'download',
          bytesCompleted: 137_000_000,
          bytesTotal: 274_000_000,
        }}
      />
    );
    // 274000000 Bytes sind 274 MB. Der Katalog schreibt genau das in den Text
    // von nomic-embed-text; eine Rechnung mit 1024 machte daraus 261.
    expect(screen.getByText('137 MB von 274 MB')).toBeInTheDocument();
  });

  // "0 MB von 16,4 GB" neben einem Balken, der sich bewegt, sieht nach
  // Stillstand aus. Der Anfang eines Pulls ist genau dieser Fall.
  it('schreibt die ersten Kilobyte auch als Kilobyte', () => {
    render(
      <DownloadProgress
        downloadState={{
          progress: 2,
          phase: 'download',
          bytesCompleted: 480_000,
          bytesTotal: 16_400_000_000,
        }}
      />
    );
    expect(screen.getByText('480 KB von 16,4 GB')).toBeInTheDocument();
  });

  it('zeigt nichts, solange Ollama noch am Manifest haengt', () => {
    render(<DownloadProgress downloadState={{ progress: 1, phase: 'init' }} />);
    expect(screen.getByText('1%')).toBeInTheDocument();
    expect(screen.queryByText(/ von /)).not.toBeInTheDocument();
  });

  it('auch in der kompakten Form', () => {
    render(
      <DownloadProgress
        compact
        downloadState={{
          progress: 30,
          phase: 'download',
          bytesCompleted: 5_000_000_000,
          bytesTotal: 16_400_000_000,
        }}
      />
    );
    expect(screen.getByText('5 GB von 16,4 GB')).toBeInTheDocument();
  });
});
