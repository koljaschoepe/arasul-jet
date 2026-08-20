/**
 * OnboardingWizard — erscheint einmal, merkt sich das Wegklicken.
 *
 * Die Prüfungen zum Fortschritt und zum Ergebnis stammen aus Plan 023 C4.
 * Vorher war der Fortschritt ein blauer Punkt zwischen zwei grauen, und kein
 * Schritt sagte, was der Leser danach hat.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingWizard from './OnboardingWizard';

describe('OnboardingWizard', () => {
  beforeEach(() => localStorage.clear());

  it('erscheint beim ersten Start und führt durch die Schritte', async () => {
    render(<OnboardingWizard />);
    expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument();
    expect(screen.getByText('Deine Entwicklungsumgebung')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.getByRole('heading', { name: 'Ein KI-Coder ohne Konto' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(
      screen.getByRole('heading', { name: 'Claude einmal anmelden (optional)' })
    ).toBeInTheDocument();

    // Letzter Schritt → „Los geht's" schließt und merkt es sich.
    await userEvent.click(screen.getByRole('button', { name: /Los geht/ }));
    expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument();
    expect(localStorage.getItem('arasul-onboarding-seen-v1')).toBe('1');
  });

  it('erscheint NICHT mehr, wenn bereits gesehen', () => {
    localStorage.setItem('arasul-onboarding-seen-v1', '1');
    render(<OnboardingWizard />);
    expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument();
  });

  it('„Überspringen" schließt und merkt es sich', async () => {
    render(<OnboardingWizard />);
    await userEvent.click(screen.getByRole('button', { name: 'Überspringen' }));
    expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument();
    expect(localStorage.getItem('arasul-onboarding-seen-v1')).toBe('1');
  });

  // C4: der wievielte Schritt läuft, steht als Text da, nicht nur als Punkt.
  it('nennt den Schritt in Worten, auf jedem Schritt', async () => {
    render(<OnboardingWizard />);
    expect(screen.getByText('Schritt 1 von 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.getByText('Schritt 2 von 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.getByText('Schritt 3 von 3')).toBeInTheDocument();
  });

  // C4: jeder Schritt nennt sein Ergebnis, also was der Leser danach hat.
  it('nennt auf jedem Schritt sein Ergebnis', async () => {
    render(<OnboardingWizard />);
    expect(screen.getByText(/Du weißt, wo gearbeitet wird/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.getByText(/ohne Anmeldung und ohne Internetverbindung/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.getByText(/auch nach einem Neustart des Geräts/)).toBeInTheDocument();
  });

  // C4: was danach kommt, steht mit Namen da, und am Ende steht, dass Schluss ist.
  it('kündigt den nächsten Schritt mit Namen an und meldet das Ende', async () => {
    render(<OnboardingWizard />);
    expect(screen.getByText('Als Nächstes: Ein KI-Coder ohne Konto')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.getByText('Als Nächstes: Claude einmal anmelden (optional)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.getByText('Das war der letzte Schritt.')).toBeInTheDocument();
    expect(screen.queryByText(/Als Nächstes/)).not.toBeInTheDocument();
  });

  // Die Punkte sagen dasselbe wie der Text. Doppelt vorgelesen ist es Lärm.
  it('haelt die Punkte von Vorlesegeraeten fern', () => {
    const { container } = render(<OnboardingWizard />);
    const punkte = container.querySelector('[data-testid="fortschritt-punkte"]');
    expect(punkte).not.toBeNull();
    expect(punkte).toHaveAttribute('aria-hidden', 'true');
    // Genau ein Punkt je Schritt, sonst prueft der Test nur, dass irgendwo
    // irgendein aria-hidden-Element steht.
    expect(punkte!.querySelectorAll('span')).toHaveLength(3);
  });

  // Der Dialog nennt sich nach seinem Schritt, nicht generisch. Sonst hoert ein
  // Vorlesegeraet dreimal dasselbe Wort.
  it('traegt den Titel des laufenden Schritts als Namen', async () => {
    render(<OnboardingWizard />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Deine Entwicklungsumgebung');

    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Ein KI-Coder ohne Konto');
  });

  // aria-modal behauptet, dass hinter dem Dialog nichts bedienbar ist. Ohne
  // Fokusfalle war das falsch: der Tabulator lief in den Arbeitsbereich.
  it('behaelt den Fokus im Dialog', async () => {
    render(<OnboardingWizard />);
    const dialog = screen.getByTestId('onboarding-wizard');
    expect(dialog).toHaveFocus();

    const knoepfe = dialog.querySelectorAll('button');
    const letzter = knoepfe[knoepfe.length - 1] as HTMLElement;
    letzter.focus();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  // Der Fokus liegt beim Oeffnen auf dem Dialog selbst, damit sein Name
  // vorgelesen wird. Der Container ist aber weder erstes noch letztes Ziel, und
  // genau deshalb lief die Umlaufregel an ihm vorbei: Shift+Tab als ALLERERSTE
  // Taste ging rueckwaerts aus dem Dialog heraus.
  it('faengt auch das erste Shift+Tab ab, nicht erst das zweite', async () => {
    render(<OnboardingWizard />);
    const dialog = screen.getByTestId('onboarding-wizard');
    expect(dialog).toHaveFocus();

    await userEvent.tab({ shift: true });

    const knoepfe = dialog.querySelectorAll('button');
    expect(document.activeElement).toBe(knoepfe[knoepfe.length - 1]);
  });

  // „Zurueck" gibt es nur ab Schritt 2. Wer ihn auf Schritt 2 drueckt, loescht
  // damit den Knopf, auf dem sein eigener Fokus sitzt; der Browser setzt ihn
  // dann auf <body>, also aus dem Dialog heraus.
  it('verliert den Fokus nicht, wenn „Zurueck" sich selbst entfernt', async () => {
    render(<OnboardingWizard />);
    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));

    const zurueck = screen.getByRole('button', { name: /Zurück/ });
    zurueck.focus();
    await userEvent.click(zurueck);

    expect(screen.queryByRole('button', { name: /Zurück/ })).not.toBeInTheDocument();
    const dialog = screen.getByTestId('onboarding-wizard');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  // Gegenprobe vorwaerts: das erste Tab landet auf dem ersten Knopf im Dialog,
  // nicht irgendwo dahinter.
  it('faengt auch das erste Tab ab', async () => {
    render(<OnboardingWizard />);
    const dialog = screen.getByTestId('onboarding-wizard');

    await userEvent.tab();

    expect(document.activeElement).toBe(dialog.querySelector('button'));
  });

  // Die Hintergrundflaeche schliesst per Klick, steht aber nicht im
  // Tabulatorlauf: sonst waere die erste Taste eines Tastaturnutzers ein
  // versehentliches Wegklicken des Erst-Starts.
  it('macht die Hintergrundflaeche nicht zur ersten Station', () => {
    render(<OnboardingWizard />);
    expect(screen.queryByRole('button', { name: /schließen/i })).not.toBeInTheDocument();
  });

  it('Escape schließt und merkt es sich', async () => {
    render(<OnboardingWizard />);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument();
    expect(localStorage.getItem('arasul-onboarding-seen-v1')).toBe('1');
  });
});
