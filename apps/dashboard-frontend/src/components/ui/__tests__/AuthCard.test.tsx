import { render, screen } from '@testing-library/react';
import { AuthCard, AuthFehler, AUTH_FELD } from '../AuthCard';

describe('AuthCard', () => {
  test('setzt genau ein h1 mit dem uebergebenen Titel', () => {
    const { container } = render(<AuthCard title="Arasul">Formular</AuthCard>);

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Arasul' })).toBeInTheDocument();
  });

  test('zeigt Beschreibung und Fusszeile nur, wenn sie da sind', () => {
    const { rerender } = render(<AuthCard title="Arasul">Formular</AuthCard>);
    expect(screen.queryByText('Edge-KI')).not.toBeInTheDocument();
    expect(screen.queryByText('Hilfe')).not.toBeInTheDocument();

    rerender(
      <AuthCard title="Arasul" description="Edge-KI" footer={<span>Hilfe</span>}>
        Formular
      </AuthCard>
    );
    expect(screen.getByText('Edge-KI')).toBeInTheDocument();
    expect(screen.getByText('Hilfe')).toBeInTheDocument();
  });

  test('zeigt das Maskottchen nur auf Wunsch', () => {
    const { rerender, container } = render(<AuthCard title="Arasul">Formular</AuthCard>);
    expect(container.querySelector('svg, img')).toBeNull();

    rerender(
      <AuthCard mascot title="Arasul">
        Formular
      </AuthCard>
    );
    expect(container.querySelector('svg, img')).not.toBeNull();
  });

  // C1-Merkposten: der Titel ist die Wortmarke, keine Seitenueberschrift, und
  // folgt trotzdem der Groesse aus dem Design-System statt eigener Sonderwerte.
  test('Titel traegt die Groesse des Design-Systems, ohne Breakpoint-Ausnahmen', () => {
    const { container } = render(<AuthCard title="Arasul">Formular</AuthCard>);
    const h1 = container.querySelector('h1');

    expect(h1?.className).toContain('text-2xl');
    expect(h1?.className).not.toMatch(/min-\[|max-\[/);
  });
});

describe('AuthFehler', () => {
  test('meldet sich als alert und behaelt die uebergebene Kennung', () => {
    render(<AuthFehler id="login-error">Passwort falsch</AuthFehler>);

    const kasten = screen.getByRole('alert');
    expect(kasten).toHaveAttribute('id', 'login-error');
    expect(kasten).toHaveTextContent('Passwort falsch');
  });
});

describe('AUTH_FELD', () => {
  test('gibt dem Feld auf dem Telefon eine fingerbreite Hoehe', () => {
    expect(AUTH_FELD).toContain('max-md:h-11');
  });
});
