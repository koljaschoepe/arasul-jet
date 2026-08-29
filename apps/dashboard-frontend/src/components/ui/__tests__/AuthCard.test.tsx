import { render, screen } from '@testing-library/react';
import { AuthCard, AuthError, AUTH_FIELD } from '../AuthCard';

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

  // C1-Merkposten, in H5 nachgezogen: der Titel ist die Wortmarke, keine
  // Seitenueberschrift, und folgt trotzdem der Groesse aus dem Design-System
  // statt eigener Sonderwerte. Seit H5 kommt er aus `Kopf` (`@marken`,
  // mittig) -- die Groesse steht damit in `marken.css` (`--ara-groesse-titel`)
  // und nicht mehr in einer Klassenkette hier. Geprueft wird, dass es GENAU
  // EIN `h1` gibt, dass es der Baustein ist und dass keine
  // Breakpoint-Ausnahme daran haengt.
  test('Titel kommt aus dem Baustein, ohne Breakpoint-Ausnahmen', () => {
    const { container } = render(<AuthCard title="Arasul">Formular</AuthCard>);
    const ueberschriften = container.querySelectorAll('h1');

    expect(ueberschriften).toHaveLength(1);
    const h1 = ueberschriften[0];
    expect(h1?.className).toContain('ara-kopf__titel');
    expect(h1?.className).not.toMatch(/min-\[|max-\[/);
    expect(h1?.closest('.ara-kopf')).toHaveAttribute('data-mittig', 'true');
  });
});

describe('AuthError', () => {
  test('meldet sich als alert und behaelt die uebergebene Kennung', () => {
    render(<AuthError id="login-error">Passwort falsch</AuthError>);

    const kasten = screen.getByRole('alert');
    expect(kasten).toHaveAttribute('id', 'login-error');
    expect(kasten).toHaveTextContent('Passwort falsch');
  });
});

describe('AUTH_FIELD', () => {
  test('gibt dem Feld auf dem Telefon eine fingerbreite Hoehe', () => {
    expect(AUTH_FIELD).toContain('max-md:h-11');
  });
});
