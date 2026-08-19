/**
 * Werksreset (Plan 023 B5), Oberfläche.
 *
 * Die drei Dinge, die hier schiefgehen können und teuer sind:
 * ein Klick löst aus, die Vorschau kommt nach dem Auslösen, oder die Sperre bei
 * nicht eingeordneten Tabellen bleibt unsichtbar. Genau die stehen hier.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Werksreset } from '../Werksreset';

const get = vi.fn();
const post = vi.fn();

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({ get, post, put: vi.fn(), patch: vi.fn(), del: vi.fn(), request: vi.fn() }),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

const VORSCHAU = {
  stufe: 'inhalte',
  modelleLoeschen: false,
  geraetename: 'orin-vorfuehrer',
  tabellen: [
    { name: 'public.chat_messages', zweck: 'Chatnachrichten', zeilen: 412 },
    { name: 'public.documents', zweck: 'Dokumente', zeilen: 0 },
  ],
  zeilenGesamt: 412,
  ordner: [],
  n8nWirdGeleert: false,
  unbekannteTabellen: [],
  durchfuehrbar: true,
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue(VORSCHAU);
  post.mockResolvedValue({ stufe: 'inhalte', zeilenGesamt: 412, dauerMs: 900, tabellen: { a: 1 } });
});

test('ohne Vorschau gibt es keinen Auslöser', () => {
  render(<Werksreset />);
  expect(screen.queryByRole('button', { name: /jetzt ausführen/i })).not.toBeInTheDocument();
});

test('der Auslöser bleibt gesperrt, bis der Gerätename genau stimmt', async () => {
  const nutzer = userEvent.setup();
  render(<Werksreset />);

  await nutzer.click(screen.getByRole('button', { name: /Vorschau anzeigen/i }));
  const knopf = await screen.findByRole('button', { name: /jetzt ausführen/i });
  expect(knopf).toBeDisabled();

  const feld = screen.getByLabelText(/Gerätenamen eintippen/i);
  await nutzer.type(feld, 'orin-vorfuehr');
  expect(knopf).toBeDisabled();

  await nutzer.type(feld, 'er');
  await waitFor(() => expect(knopf).toBeEnabled());

  await nutzer.click(knopf);
  expect(post).toHaveBeenCalledWith(
    '/werksreset',
    { stufe: 'inhalte', modelleLoeschen: false, bestaetigung: 'orin-vorfuehrer' },
    expect.objectContaining({ signal: expect.anything() })
  );
});

test('zeigt vorher, was verschwindet, und zählt leere Bereiche nicht mit', async () => {
  const nutzer = userEvent.setup();
  render(<Werksreset />);
  await nutzer.click(screen.getByRole('button', { name: /Vorschau anzeigen/i }));

  expect(await screen.findByText(/412 Zeilen in 1 Tabellen/)).toBeInTheDocument();
  expect(screen.getByText('Chatnachrichten')).toBeInTheDocument();
  expect(screen.queryByText('Dokumente')).not.toBeInTheDocument();
});

test('bei nicht eingeordneten Tabellen gibt es keinen Auslöser, sondern eine Begründung', async () => {
  get.mockResolvedValue({
    ...VORSCHAU,
    durchfuehrbar: false,
    unbekannteTabellen: ['public.spaeter_dazugekommen'],
  });
  const nutzer = userEvent.setup();
  render(<Werksreset />);
  await nutzer.click(screen.getByRole('button', { name: /Vorschau anzeigen/i }));

  expect(await screen.findByText(/gesperrt/i)).toBeInTheDocument();
  expect(screen.getByText('public.spaeter_dazugekommen')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /jetzt ausführen/i })).not.toBeInTheDocument();
});

test('ein Stufenwechsel wirft die Vorschau weg', async () => {
  const nutzer = userEvent.setup();
  render(<Werksreset />);
  await nutzer.click(screen.getByRole('button', { name: /Vorschau anzeigen/i }));
  await screen.findByRole('button', { name: /jetzt ausführen/i });

  await nutzer.click(screen.getByRole('button', { name: /Auslieferungszustand/i }));

  expect(screen.queryByRole('button', { name: /jetzt ausführen/i })).not.toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(1);
});

/**
 * Nach dem Ausfuehren ist die Datenbank geleert, auch wenn ein Nachbarsystem
 * nicht mitgezogen hat. Genau dann darf hier kein gruener Haken stehen: wenn
 * das Entwerten des Erstpassworts scheitert, legt bootstrap.js beim naechsten
 * Neustart den alten Zugang mit dem alten Passwort wieder an.
 */
test('meldet gescheiterte Teilschritte, statt Erfolg zu behaupten', async () => {
  post.mockResolvedValue({
    stufe: 'auslieferung',
    zeilenGesamt: 90,
    dauerMs: 1200,
    tabellen: { a: 1 },
    erstpasswort: { ok: false, fehler: 'EACCES: permission denied' },
    n8n: { ok: true },
  });
  const nutzer = userEvent.setup();
  render(<Werksreset />);

  await nutzer.click(screen.getByRole('button', { name: /Vorschau anzeigen/i }));
  await nutzer.type(await screen.findByLabelText(/Gerätenamen eintippen/i), 'orin-vorfuehrer');
  await nutzer.click(screen.getByRole('button', { name: /jetzt ausführen/i }));

  expect(await screen.findByText(/1 Schritte sind nicht durchgelaufen/)).toBeInTheDocument();
  expect(screen.getByText(/alte Passwort steht noch in der .env/)).toBeInTheDocument();
  expect(screen.getByText(/EACCES/)).toBeInTheDocument();
  expect(screen.queryByText(/startet die Ersteinrichtung/)).not.toBeInTheDocument();
});

test('gibt dem Reset mehr Zeit als die üblichen 30 Sekunden', async () => {
  const nutzer = userEvent.setup();
  render(<Werksreset />);
  await nutzer.click(screen.getByRole('button', { name: /Vorschau anzeigen/i }));
  await nutzer.type(await screen.findByLabelText(/Gerätenamen eintippen/i), 'orin-vorfuehrer');
  await nutzer.click(screen.getByRole('button', { name: /jetzt ausführen/i }));

  expect(post.mock.calls[0]?.[2]).toHaveProperty('signal');
});
