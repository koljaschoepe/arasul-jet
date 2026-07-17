/**
 * CreateProjectDialog — Netzwerkmodus-Auswahl inkl. Infrastruktur-Option
 *
 * Sichert: drei Modus-Optionen (Isoliert/Intern/Infrastruktur), Warnhinweis
 * bei Infrastruktur, korrektes network_mode im POST-Payload.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateProjectDialog from './CreateProjectDialog';
import { createMockApi, createMockToast } from '../../__tests__/helpers/renderWithProviders';

const mockApi = createMockApi();
const mockToast = createMockToast();

vi.mock('../../hooks/useApi', () => ({
  useApi: () => mockApi,
  default: () => mockApi,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => mockToast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('CreateProjectDialog — Netzwerkmodi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockApi.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      project: { id: 'p1', name: 'Testprojekt', network_mode: 'infrastructure' },
    });
  });

  function renderDialog(onCreated = vi.fn()) {
    render(<CreateProjectDialog open={true} onClose={vi.fn()} onCreated={onCreated} />);
    return { onCreated };
  }

  test('zeigt alle drei Modus-Optionen an', () => {
    renderDialog();

    expect(screen.getByText('Abgeschottet')).toBeInTheDocument();
    expect(screen.getByText('Am System')).toBeInTheDocument();
    expect(screen.getByText('Voller Zugriff')).toBeInTheDocument();
  });

  test('Infrastruktur-Option nennt Repo-/Docker-Zugriff und Admin-Beschränkung', () => {
    renderDialog();

    expect(screen.getByText(/Plattform-Repo/)).toBeInTheDocument();
    expect(screen.getByText(/Nur für Administratoren/)).toBeInTheDocument();
  });

  test('Auswahl von Infrastruktur zeigt den Warnhinweis', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByText(/Host-Vollzugriff/)).not.toBeInTheDocument();
    await user.click(screen.getByText('Voller Zugriff'));
    expect(screen.getByText(/Host-Vollzugriff/)).toBeInTheDocument();
  });

  test('sendet network_mode "infrastructure" im POST-Payload', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderDialog();

    await user.type(screen.getByLabelText('Projektname'), 'Testprojekt');
    await user.click(screen.getByText('Voller Zugriff'));
    await user.click(screen.getByRole('button', { name: /Erstellen/ }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/sandbox/projects',
        expect.objectContaining({ name: 'Testprojekt', network_mode: 'infrastructure' }),
        expect.anything()
      );
    });
    expect(onCreated).toHaveBeenCalled();
  });

  test('Standard bleibt "isolated", wenn kein Modus gewählt wird', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Projektname'), 'Testprojekt');
    await user.click(screen.getByRole('button', { name: /Erstellen/ }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/sandbox/projects',
        expect.objectContaining({ network_mode: 'isolated' }),
        expect.anything()
      );
    });
  });
});
