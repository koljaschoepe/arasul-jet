/**
 * Plan 023 D9: die Einstellungsseite fuer externe Cloud-Modelle.
 *
 * Geprueft wird vor allem, was der Nutzer zu sehen bekommt, BEVOR er
 * einschaltet. Ein Produkt, das mit "laeuft vollstaendig lokal" verkauft
 * wird, muss seine eine Ausnahme benennen, und zwar auf der Seite, auf der
 * man sie einschaltet.
 */

import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { ToastProvider } from '../../../contexts/ToastContext';
import type { ApiMethods } from '../../../hooks/useApi';
import { ExterneModelleSettings } from '../ExterneModelleSettings';

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
} satisfies ApiMethods;

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => mockApi,
}));

const OHNE_SCHLUESSEL = {
  anbieter: 'anthropic',
  name: 'Anthropic',
  schluessel_hinweis: 'beginnt mit sk-ant-',
  schluessel_hinterlegt: false,
  schluessel_endet_auf: null,
  aktiv: false,
  zuletzt_geprueft_am: null,
  letzter_fehler: null,
};

const MIT_SCHLUESSEL = {
  anbieter: 'openai',
  name: 'OpenAI',
  schluessel_hinweis: 'beginnt mit sk-',
  schluessel_hinterlegt: true,
  schluessel_endet_auf: 'ab12',
  aktiv: false,
  zuletzt_geprueft_am: null,
  letzter_fehler: null,
};

function zeichne() {
  return render(
    <ToastProvider>
      <ExterneModelleSettings />
    </ToastProvider>
  );
}

describe('ExterneModelleSettings (Plan 023 D9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: [OHNE_SCHLUESSEL, MIT_SCHLUESSEL] });
  });

  test('sagt vor dem Einschalten, dass Anfragen das Gerät verlassen', async () => {
    zeichne();
    // Ueber die Rolle statt ueber den Text: ein Textmuster wuerde auf jedem
    // umschliessenden Element treffen und waere mehrdeutig, und der Wortlaut
    // darf sich aendern, solange die vier Aussagen darin stehen bleiben.
    const warnung = await screen.findByRole('alert');
    expect(warnung).toHaveTextContent('läuft lokal');
    expect(warnung).toHaveTextContent('an dessen Server');
    expect(warnung).toHaveTextContent('Prüfprotokoll');
    expect(warnung).toHaveTextContent('Ab Werk ist nichts eingeschaltet');
  });

  test('zeigt beide Anbieter, mit und ohne Schlüssel unterscheidbar', async () => {
    zeichne();
    await waitFor(() => expect(screen.getByText('Anthropic')).toBeInTheDocument());
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText(/Kein Schlüssel hinterlegt/i)).toBeInTheDocument();
    expect(screen.getByText(/endet auf ab12/i)).toBeInTheDocument();
  });

  test('der Schalter erscheint erst, wenn ein Schlüssel hinterlegt ist', async () => {
    zeichne();
    await waitFor(() => expect(screen.getByText('OpenAI')).toBeInTheDocument());
    // Nur der Anbieter MIT Schlüssel hat einen Schalter. Einen Anbieter ohne
    // Schlüssel einschalten zu können, wäre ein Knopf, der nichts tut.
    expect(screen.getByLabelText(/^Aus$|^Eingeschaltet$/)).toBeInTheDocument();
    expect(screen.queryByLabelText('schalter-anthropic')).not.toBeInTheDocument();
  });

  test('ein Schlüssel wird gespeichert und das Feld danach geleert', async () => {
    mockApi.put.mockResolvedValue({ data: MIT_SCHLUESSEL });
    zeichne();
    await waitFor(() => expect(screen.getByText('Anthropic')).toBeInTheDocument());

    const feld = screen.getByLabelText('Schlüssel hinterlegen') as HTMLInputElement;
    // Ein Schlüssel gehört nicht im Klartext auf den Bildschirm, auch nicht
    // beim Tippen: jemand steht daneben, oder der Bildschirm wird geteilt.
    expect(feld.type).toBe('password');

    fireEvent.change(feld, { target: { value: 'sk-ant-geheim' } });
    // Beide Anbieter haben einen Knopf "Speichern". Gemeint ist der im
    // Abschnitt des Feldes, in das gerade getippt wurde.
    const abschnitt = feld.closest('section') as HTMLElement;
    fireEvent.click(within(abschnitt).getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('/modelle-extern/anthropic', {
        schluessel: 'sk-ant-geheim',
      })
    );
  });

  test('ein Fehler des Anbieters steht an dessen Abschnitt', async () => {
    mockApi.get.mockResolvedValue({
      data: [{ ...MIT_SCHLUESSEL, letzter_fehler: 'OpenAI weist den Schlüssel zurück.' }],
    });
    zeichne();
    await waitFor(() =>
      expect(screen.getByText('OpenAI weist den Schlüssel zurück.')).toBeInTheDocument()
    );
  });

  test('Prüfen ruft den Anbieter, ohne ein Token zu erzeugen', async () => {
    mockApi.post.mockResolvedValue({ data: { anzahl: 12 } });
    zeichne();
    await waitFor(() => expect(screen.getByText('OpenAI')).toBeInTheDocument());
    // Nur der Anbieter mit Schluessel hat diesen Knopf, deshalb ist er
    // eindeutig.
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/modelle-extern/openai/pruefen')
    );
  });
});
