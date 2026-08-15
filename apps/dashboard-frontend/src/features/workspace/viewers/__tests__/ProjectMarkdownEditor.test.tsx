import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProjectMarkdownEditor from '../ProjectMarkdownEditor';

/**
 * Regressionsschutz für den „leerer Editor bei Kaltstart"-Bug (QA-Sweep
 * 2026-08-15): Eine frisch erzeugte / bei kaltem Cache geöffnete .md wurde
 * im WYSIWYG leer angezeigt, weil der Inhalt nur über einen Effekt gesetzt
 * wurde, der die (bei TipTap v3 evtl. neu erzeugte) Instanz verpassen konnte.
 * Der Fix befüllt zusätzlich in `onCreate`. Dieser Test sichert, dass der
 * übergebene Markdown-Inhalt tatsächlich im Editor landet.
 */

// jsdom kennt keine Layout-Messung — ProseMirror braucht Range-Rects.
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

describe('ProjectMarkdownEditor', () => {
  it('rendert den übergebenen Markdown-Inhalt (kein leerer Editor)', async () => {
    render(
      <ProjectMarkdownEditor
        value={'# Übersicht\n\nEindeutiger Marker BLAUWAL-2026 steht hier.'}
        onChange={vi.fn()}
      />
    );

    // Überschrift als echtes <h1> gerendert (nicht der rohe „#"-Text).
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Übersicht' })).toBeInTheDocument();
    });
    // Fließtext-Marker ist sichtbar → Inhalt wurde hydriert.
    expect(screen.getByText(/BLAUWAL-2026/)).toBeInTheDocument();
  });

  it('meldet beim bloßen Öffnen keine Änderung (Hydration-Sperre)', async () => {
    const onChange = vi.fn();
    render(<ProjectMarkdownEditor value={'Nur Text, keine Nutzer-Eingabe.'} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByText(/Nur Text/)).toBeInTheDocument();
    });
    // Öffnen/Hydrieren darf keinen Auto-Save auslösen.
    expect(onChange).not.toHaveBeenCalled();
  });
});
