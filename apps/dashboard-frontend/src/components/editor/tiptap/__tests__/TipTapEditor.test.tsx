import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import TipTapEditor from '../TipTapEditor';

// jsdom kennt keine Layout-Messung: ProseMirror ruft beim Fokus/Scroll
// `getClientRects()`/`getBoundingClientRect()` auf einer Range auf. Ohne Shim
// wirft das („not a function"). Ein Dummy-Rect genügt für die Editor-Logik.
beforeAll(() => {
  const rect = {
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  const rectList = {
    length: 1,
    item: () => rect,
    0: rect,
    [Symbol.iterator]: function* () {
      yield rect;
    },
  } as unknown as DOMRectList;
  Range.prototype.getClientRects = () => rectList;
  Range.prototype.getBoundingClientRect = () => rect;
});

// useApi mocken — der Editor lädt/speichert über GET/PUT /documents/:id/content.
const mockApi = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
vi.mock('@/hooks/useApi', () => ({ useApi: () => mockApi }));

// useConfirm liefert normalerweise einen Portal-Dialog — im Test neutralisieren.
vi.mock('@/hooks/useConfirm', () => ({
  default: () => ({ confirm: vi.fn().mockResolvedValue(true), ConfirmDialog: null }),
}));

function renderEditor() {
  return render(
    <TipTapEditor embedded documentId="doc1" filename="notiz.md" token="" onClose={vi.fn()} />
  );
}

describe('TipTapEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockApi.get as Mock).mockResolvedValue({ content: 'Hallo Welt' });
    (mockApi.put as Mock).mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('zeigt die volle Formatierungs-Toolbar (inkl. Listen, Ausrichtung, Link)', async () => {
    renderEditor();

    // Auf das Laden warten — danach ist die Toolbar da.
    expect(await screen.findByLabelText('Fett')).toBeInTheDocument();

    // Inline-Marks
    expect(screen.getByLabelText('Kursiv')).toBeInTheDocument();
    expect(screen.getByLabelText('Unterstrichen')).toBeInTheDocument();
    expect(screen.getByLabelText('Durchgestrichen')).toBeInTheDocument();
    expect(screen.getByLabelText('Inline-Code')).toBeInTheDocument();

    // Überschriften + Fließtext
    expect(screen.getByLabelText('Fließtext')).toBeInTheDocument();
    expect(screen.getByLabelText('Überschrift 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Überschrift 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Überschrift 3')).toBeInTheDocument();

    // Listen + Blöcke
    expect(screen.getByLabelText('Aufzählung')).toBeInTheDocument();
    expect(screen.getByLabelText('Nummerierte Liste')).toBeInTheDocument();
    expect(screen.getByLabelText('Zitat')).toBeInTheDocument();
    expect(screen.getByLabelText('Code-Block')).toBeInTheDocument();

    // Text-Ausrichtung
    expect(screen.getByLabelText('Linksbündig')).toBeInTheDocument();
    expect(screen.getByLabelText('Zentriert')).toBeInTheDocument();
    expect(screen.getByLabelText('Rechtsbündig')).toBeInTheDocument();

    // Link
    expect(screen.getByLabelText('Link einfügen oder bearbeiten')).toBeInTheDocument();
    expect(screen.getByLabelText('Link entfernen')).toBeInTheDocument();
  });

  it('macht aus dem Absatz eine sichtbare Aufzählungsliste (<ul>)', async () => {
    const { container } = renderEditor();
    await screen.findByLabelText('Aufzählung');

    // Vorher kein <ul> im Editor-Inhalt.
    expect(container.querySelector('.tiptap-content ul')).toBeNull();

    fireEvent.click(screen.getByLabelText('Aufzählung'));

    await waitFor(() => {
      expect(container.querySelector('.tiptap-content ul li')).not.toBeNull();
    });
  });

  it('speichert automatisch (PUT) ~1,2 s nach einer Änderung', async () => {
    renderEditor();
    await screen.findByLabelText('Aufzählung');

    // Kein Autosave beim reinen Laden (Hydration-Guard).
    expect(mockApi.put).not.toHaveBeenCalled();

    vi.useFakeTimers();
    // Änderung auslösen → Debounce-Timer startet.
    fireEvent.click(screen.getByLabelText('Aufzählung'));
    // Vor Ablauf des Debounce: noch nicht gespeichert.
    await vi.advanceTimersByTimeAsync(500);
    expect(mockApi.put).not.toHaveBeenCalled();
    // Nach Ablauf (~1,2 s): genau ein Autosave über den bestehenden PUT-Pfad.
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith(
        '/documents/doc1/content',
        expect.objectContaining({ content: expect.any(String) }),
        expect.anything()
      );
    });
  });
});
