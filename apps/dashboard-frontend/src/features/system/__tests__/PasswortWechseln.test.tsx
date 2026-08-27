/**
 * Der erzwungene Startpasswort-Wechsel (Phase D1).
 *
 * Phase C2 hat den Weg gebaut, auf dem ein Administrator ein Passwort setzt.
 * Danach kannte ein Zweiter es. Diese Seite steht zwischen der Anmeldung und
 * der Shell, solange `passwortWechselNoetig` gilt — und sie hat ausdrücklich
 * kein „Später": ein Knopf zum Wegklicken wäre der Knopf, den jeder drückt.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PasswortWechseln from '../PasswortWechseln';

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

const gewechselt = vi.fn();
const abgemeldet = vi.fn();

function zeige() {
  return render(<PasswortWechseln onGewechselt={gewechselt} onAbmelden={abgemeldet} />);
}

async function fuelleAus(alt: string, neu: string, wiederholung = neu) {
  fireEvent.change(await screen.findByLabelText('Bisheriges Passwort'), { target: { value: alt } });
  fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: neu } });
  fireEvent.change(screen.getByLabelText('Neues Passwort wiederholen'), {
    target: { value: wiederholung },
  });
}

describe('PasswortWechseln', () => {
  beforeEach(() => {
    gewechselt.mockReset();
    abgemeldet.mockReset();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.get.mockResolvedValue({
      requirements: {
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: true,
        requireSpecialChars: false,
      },
    });
    apiMock.post.mockResolvedValue({ success: true });
  });

  it('bietet kein „Später": nur wechseln oder abmelden', async () => {
    zeige();
    await screen.findByLabelText('Bisheriges Passwort');
    expect(screen.queryByText(/später|überspringen/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Abmelden'));
    expect(abgemeldet).toHaveBeenCalled();
  });

  it('sagt vorher, was am Passwort noch fehlt, und bleibt so lange gesperrt', async () => {
    zeige();
    await fuelleAus('start', 'kurz');
    expect(screen.getByText(/Es fehlt noch:/)).toHaveTextContent('mindestens 8 Zeichen');
    expect(screen.getByRole('button', { name: 'Passwort ändern' })).toBeDisabled();
  });

  it('meldet zwei verschiedene Eingaben, statt sie abzuschicken', async () => {
    zeige();
    await fuelleAus('start', 'geheim99', 'geheim98');
    expect(screen.getByText('Die beiden Eingaben stimmen nicht überein.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passwort ändern' })).toBeDisabled();
  });

  it('wechselt über /auth/change-password und meldet es nach oben', async () => {
    zeige();
    await fuelleAus('start', 'geheim99');
    fireEvent.click(screen.getByRole('button', { name: 'Passwort ändern' }));

    await waitFor(() => expect(gewechselt).toHaveBeenCalled());
    expect(apiMock.post).toHaveBeenCalledWith(
      '/auth/change-password',
      { currentPassword: 'start', newPassword: 'geheim99' },
      { showError: false }
    );
  });

  it('sagt beim falschen alten Passwort, WAS falsch war', async () => {
    apiMock.post.mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }));
    zeige();
    await fuelleAus('falsch', 'geheim99');
    fireEvent.click(screen.getByRole('button', { name: 'Passwort ändern' }));

    await waitFor(() =>
      expect(screen.getByText('Das bisherige Passwort stimmt nicht.')).toBeInTheDocument()
    );
    expect(gewechselt).not.toHaveBeenCalled();
  });
});
