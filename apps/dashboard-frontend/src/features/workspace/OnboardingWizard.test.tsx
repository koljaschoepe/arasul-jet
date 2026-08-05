/**
 * OnboardingWizard — erscheint einmal, merkt sich das Wegklicken.
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
    expect(
      screen.getByRole('heading', { name: 'Lokaler Coder — kein Login nötig' })
    ).toBeInTheDocument();
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
});
