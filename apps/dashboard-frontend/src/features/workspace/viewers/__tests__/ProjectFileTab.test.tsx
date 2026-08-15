/**
 * ProjectFileTab — Viewer-Routing (Plan 019 · Phase 3).
 *
 * Kernzusage: Binärdateien landen nicht mehr pauschal auf der Download-Karte —
 * PDFs öffnen im PdfViewer, Bilder im ImageViewer, alles andere behält die
 * Download-Karte. Die schweren Viewer (pdf.js) sind hier gemockt, weil sie in
 * jsdom nicht rendern (Canvas/Worker).
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectFileTab from '../ProjectFileTab';

const apiGet = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get: apiGet, put: vi.fn() }) }));
const toastInfo = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: toastInfo, warning: vi.fn() }),
}));
vi.mock('@/hooks/useReportTabDirty', () => ({ useReportTabDirty: vi.fn() }));
const closeTabMock = vi.fn();
vi.mock('@/stores/workspaceStore', () => ({
  useWorkspaceStore: (sel: (s: unknown) => unknown) =>
    sel({ updateTabTitle: vi.fn(), closeTab: closeTabMock }),
}));
vi.mock('../PdfViewer', () => ({
  default: () => <div data-testid="pdf-viewer">PDF-Viewer</div>,
}));
vi.mock('../ImageViewer', () => ({
  default: () => <div data-testid="image-viewer">Bild-Viewer</div>,
}));

function mockBinaer(groesse = 8 * 1024 * 1024) {
  apiGet.mockResolvedValue({ data: { inhalt: null, binaer: true, zuGross: false, groesse } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjectFileTab Viewer-Routing', () => {
  it('öffnet eine PDF im PdfViewer statt der Download-Karte', async () => {
    mockBinaer();
    render(<ProjectFileTab projectId="p1" filePath="Kunde/hackathon.pdf" tabId="t1" />);
    expect(await screen.findByTestId('pdf-viewer')).toBeInTheDocument();
    expect(screen.queryByText('Herunterladen')).not.toBeInTheDocument();
  });

  it('öffnet ein Bild im ImageViewer', async () => {
    mockBinaer(12 * 1024 * 1024);
    render(<ProjectFileTab projectId="p1" filePath="Kunde/scan.png" tabId="t2" />);
    expect(await screen.findByTestId('image-viewer')).toBeInTheDocument();
  });

  it('öffnet eine SVG im ImageViewer, obwohl readFile sie als Text liefert', async () => {
    // Regression: SVG ist Text (kein NUL-Byte) → inhalt ist ein String, NICHT
    // null. Das Routing muss nach Endung greifen, nicht nach der Binär-Kennung.
    apiGet.mockResolvedValue({
      data: {
        inhalt: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        binaer: false,
        zuGross: false,
        groesse: 120,
      },
    });
    render(<ProjectFileTab projectId="p1" filePath="Kunde/logo.svg" tabId="t4" />);
    expect(await screen.findByTestId('image-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('project-file-editor')).not.toBeInTheDocument();
  });

  it('behält für andere Binärdateien die Download-Karte', async () => {
    mockBinaer();
    render(<ProjectFileTab projectId="p1" filePath="Kunde/archiv.zip" tabId="t3" />);
    expect(await screen.findByText('Herunterladen')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('image-viewer')).not.toBeInTheDocument();
  });

  // F-03: veralteter Tab auf gelöschte Datei → 404 schließt den Tab automatisch.
  it('schließt den Tab automatisch, wenn die Datei 404 liefert (F-03)', async () => {
    apiGet.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    render(<ProjectFileTab projectId="p1" filePath="notizen/geloescht.md" tabId="t5" />);
    await vi.waitFor(() => expect(closeTabMock).toHaveBeenCalledWith('t5'));
    expect(toastInfo).toHaveBeenCalled();
  });

  it('zeigt bei anderen Fehlern (500) den Fehlerzustand statt zu schließen', async () => {
    apiGet.mockRejectedValue(Object.assign(new Error('Serverfehler'), { status: 500 }));
    render(<ProjectFileTab projectId="p1" filePath="notizen/x.md" tabId="t6" />);
    expect(await screen.findByText('Serverfehler')).toBeInTheDocument();
    expect(closeTabMock).not.toHaveBeenCalled();
  });
});
