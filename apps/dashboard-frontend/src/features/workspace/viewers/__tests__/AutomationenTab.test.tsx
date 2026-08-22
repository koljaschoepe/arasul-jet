/**
 * Plan 023 H4: der Tab gleicht n8n an, und zwar zur richtigen Zeit.
 *
 * WIE angeglichen wird, steht in `n8nDesign.ts` und wird dort geprüft. Hier
 * geht es nur um das WANN: beim Laden des Rahmens und bei jedem Themawechsel.
 * Ein Themawechsel, der den Rahmen neu lädt, wäre der falsche Weg — n8n würde
 * dabei einen offenen Workflow verlieren.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// vi.mock wird nach oben gezogen; die Funktion muss deshalb ueber vi.hoisted
// entstehen, sonst greift der Verweis ins Leere.
const { gleicheN8nAn } = vi.hoisted(() => ({
  gleicheN8nAn: vi.fn().mockReturnValue(true),
}));
vi.mock('../n8nDesign', async () => {
  const echt = await vi.importActual<typeof import('../n8nDesign')>('../n8nDesign');
  return { ...echt, gleicheN8nAn };
});

vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: vi.fn().mockResolvedValue({}) }),
}));

let thema: 'black' | 'dark' | 'light' = 'black';
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: thema }) }));

import AutomationenTab from '../AutomationenTab';

describe('AutomationenTab (Plan 023 H4)', () => {
  beforeEach(() => {
    gleicheN8nAn.mockClear();
    thema = 'black';
  });

  it('gleicht an, sobald der Rahmen geladen ist', async () => {
    render(<AutomationenTab />);
    const rahmen = await screen.findByTestId('n8n-frame');
    gleicheN8nAn.mockClear();
    fireEvent.load(rahmen);
    await waitFor(() => expect(gleicheN8nAn).toHaveBeenCalled());
    // Schwarzes Arasul-Thema wird zu dunklem n8n.
    expect(gleicheN8nAn.mock.calls.at(-1)?.[2]).toBe('dark');
  });

  it('zieht bei einem Themawechsel nach, ohne den Rahmen neu zu laden', async () => {
    const { rerender } = render(<AutomationenTab />);
    const rahmen = await screen.findByTestId('n8n-frame');
    const schluessel = rahmen.getAttribute('src');

    thema = 'light';
    gleicheN8nAn.mockClear();
    rerender(<AutomationenTab />);

    await waitFor(() => expect(gleicheN8nAn).toHaveBeenCalled());
    expect(gleicheN8nAn.mock.calls.at(-1)?.[2]).toBe('light');
    // Derselbe Rahmen: ein Neuladen wuerde einen offenen Workflow verlieren.
    expect(screen.getByTestId('n8n-frame').getAttribute('src')).toBe(schluessel);
  });
});
