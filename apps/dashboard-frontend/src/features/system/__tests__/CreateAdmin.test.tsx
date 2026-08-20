/**
 * Erst-Start: das erste Administrator-Konto anlegen.
 *
 * Die Datei entsteht mit Plan 023 C3. Vorher hatte der Bildschirm, auf dem der
 * Kunde seinen Benutzernamen zum ersten Mal waehlt, ueberhaupt keinen Test.
 * Genau dort schlug F-01 am staerksten durch: der Platzhalter schlug „z. B.
 * admin" vor, also den geratenen Namen, an der einzigen Stelle, an der die Wahl
 * noch frei ist.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateAdmin from '../CreateAdmin';

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi, default: () => mockApi }));

describe('CreateAdmin', () => {
  const onCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // F-01. `\badmin\b` und nicht `/admin/i`, damit „Administrator" in der
  // Fusszeile weiter erlaubt bleibt.
  test('schlaegt keinen Benutzernamen vor, auch nicht als Platzhalter', () => {
    const { container } = render(<CreateAdmin onCreated={onCreated} />);

    expect(container.innerHTML).not.toMatch(/\badmin\b/i);
    expect(screen.getByLabelText(/^benutzername$/i)).not.toHaveAttribute('placeholder');
  });

  // F-20. Die Seite hat vorher gesiezt („Legen Sie Ihr Administrator-Konto an")
  // und das Geraet „Box" genannt.
  test('duzt und nennt das Geraet beim Namen', () => {
    const { container } = render(<CreateAdmin onCreated={onCreated} />);

    expect(screen.getByText(/lege dein administrator-konto an/i)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/\bBox\b/);
    expect(container.innerHTML).not.toMatch(/Legen Sie|Ihr Administrator/);
  });

  test('setzt genau eine Ueberschrift und nennt das Produkt', () => {
    const { container } = render(<CreateAdmin onCreated={onCreated} />);

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/willkommen bei/i);
  });

  test('Knopf bleibt gesperrt, solange ein Feld leer ist', async () => {
    const user = userEvent.setup();
    render(<CreateAdmin onCreated={onCreated} />);

    const knopf = screen.getByRole('button', { name: /konto anlegen/i });
    expect(knopf).toBeDisabled();

    await user.type(screen.getByLabelText(/^benutzername$/i), 'kolja');
    await user.type(screen.getByLabelText(/^passwort$/i), 'geheimgeheim');
    expect(knopf).toBeDisabled();

    await user.type(screen.getByLabelText(/passwort bestätigen/i), 'geheimgeheim');
    expect(knopf).not.toBeDisabled();
  });

  test('legt das Konto an und reicht Token und Nutzer weiter', async () => {
    const antwort = { token: 'tok', user: { id: 1, username: 'kolja' } };
    mockApi.post.mockResolvedValueOnce(antwort);

    const user = userEvent.setup();
    render(<CreateAdmin onCreated={onCreated} />);

    await user.type(screen.getByLabelText(/^benutzername$/i), 'kolja');
    await user.type(screen.getByLabelText(/^passwort$/i), 'geheimgeheim');
    await user.type(screen.getByLabelText(/passwort bestätigen/i), 'geheimgeheim');
    await user.click(screen.getByRole('button', { name: /konto anlegen/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/auth/setup',
        { username: 'kolja', password: 'geheimgeheim' },
        expect.anything()
      );
      expect(localStorage.getItem('arasul_token')).toBe('tok');
      expect(onCreated).toHaveBeenCalledWith(antwort);
    });
  });

  // Zwei Fehler in einem. Erstens hing das Formular: @hookform/resolvers 3.10
  // prueft `Array.isArray(fehler.errors)`, und zod 4 hat diesen Alias entfernt
  // (nur noch `issues`). Der Resolver warf die ZodError weiter, statt sie in
  // formState zu schreiben; `handleSubmit` blieb haengen, `isSubmitting` blieb
  // wahr, und der Knopf stand fuer immer auf „Konto wird angelegt …". Zweitens
  // wurde nur `errors.confirmPassword` ueberhaupt angezeigt: ein zu kurzes
  // Passwort blieb auch danach unkommentiert.
  //
  // Aufgefallen ist das nicht beim Suchen, sondern weil diese Datei vorher
  // nicht existierte. Login trifft es nicht: dort kann die Pruefung nicht
  // fehlschlagen, weil der Knopf bis zur Eingabe beider Felder gesperrt ist.
  test('meldet ein zu kurzes Passwort und bleibt bedienbar', async () => {
    const user = userEvent.setup();
    render(<CreateAdmin onCreated={onCreated} />);

    await user.type(screen.getByLabelText(/^benutzername$/i), 'kolja');
    await user.type(screen.getByLabelText(/^passwort$/i), 'kurz');
    await user.type(screen.getByLabelText(/passwort bestätigen/i), 'kurz');
    await user.click(screen.getByRole('button', { name: /konto anlegen/i }));

    await waitFor(() => {
      expect(screen.getByText('Mindestens 8 Zeichen')).toBeInTheDocument();
    });
    expect(mockApi.post).not.toHaveBeenCalled();
    const knopf = screen.getByRole('button', { name: /konto anlegen/i });
    expect(knopf).not.toBeDisabled();
    expect(knopf).not.toHaveAttribute('aria-busy', 'true');
  });

  test('meldet ungleiche Passwoerter, ohne den Server zu fragen', async () => {
    const user = userEvent.setup();
    render(<CreateAdmin onCreated={onCreated} />);

    await user.type(screen.getByLabelText(/^benutzername$/i), 'kolja');
    await user.type(screen.getByLabelText(/^passwort$/i), 'geheimgeheim');
    await user.type(screen.getByLabelText(/passwort bestätigen/i), 'geheimanders');
    await user.click(screen.getByRole('button', { name: /konto anlegen/i }));

    await waitFor(() => {
      expect(screen.getByText(/stimmen nicht überein/i)).toBeInTheDocument();
    });
    expect(mockApi.post).not.toHaveBeenCalled();
    // Der Knopf darf nicht auf „Konto wird angelegt …" stehen bleiben.
    const knopf = screen.getByRole('button', { name: /konto anlegen/i });
    expect(knopf).not.toBeDisabled();
    expect(knopf).not.toHaveAttribute('aria-busy', 'true');
  });
});
