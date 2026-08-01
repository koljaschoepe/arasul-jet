/**
 * ChangeSummary Tests (Plan 011, Schritt 16).
 * Zusammenfassung mit Zählung, Aufklappen der Liste, Vorher/Nachher je Zeile,
 * Hinweis statt Vorschau bei Binär/zu groß, „nichts anzeigen" bei leer.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChangeSummary from './ChangeSummary';
import type { FlowRunChange } from '@/hooks/useFlowRun';

const changes: FlowRunChange[] = [
  { pfad: 'neu.md', art: 'neu', vorher: null, nachher: '# Frisch' },
  { pfad: 'alt.txt', art: 'geaendert', vorher: 'davor', nachher: 'danach' },
  { pfad: 'weg.log', art: 'geloescht', vorher: 'Inhalt', nachher: null },
];

test('rendert nichts bei leerer Liste', () => {
  const { container } = render(<ChangeSummary changes={[]} />);
  expect(container).toBeEmptyDOMElement();
});

test('zeigt Anzahl und Zusammenfassung nach Art', () => {
  render(<ChangeSummary changes={changes} />);
  const s = screen.getByTestId('change-summary');
  expect(s).toHaveTextContent('Datei-Änderungen (3)');
  expect(s).toHaveTextContent('1 neu · 1 geändert · 1 gelöscht');
});

test('die Liste ist erst nach dem Aufklappen sichtbar', async () => {
  const user = userEvent.setup();
  render(<ChangeSummary changes={changes} />);
  expect(screen.queryByTestId('change-list')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Datei-Änderungen/ }));
  expect(screen.getAllByTestId('change-row')).toHaveLength(3);
});

test('eine Zeile zeigt Vorher und Nachher nach dem Aufklappen', async () => {
  const user = userEvent.setup();
  render(<ChangeSummary changes={changes} />);
  await user.click(screen.getByRole('button', { name: /Datei-Änderungen/ }));
  await user.click(screen.getByRole('button', { name: /alt\.txt/ }));
  const detail = screen.getByTestId('change-detail');
  expect(detail).toHaveTextContent('davor');
  expect(detail).toHaveTextContent('danach');
});

test('zeigt einen Hinweis statt Vorschau bei fehlendem Inhalt', async () => {
  const user = userEvent.setup();
  render(
    <ChangeSummary
      changes={[
        { pfad: 'bild.png', art: 'neu', vorher: null, nachher: null, hinweis: 'Binärdatei' },
      ]}
    />
  );
  await user.click(screen.getByRole('button', { name: /Datei-Änderungen/ }));
  await user.click(screen.getByRole('button', { name: /bild\.png/ }));
  expect(screen.getByTestId('change-detail')).toHaveTextContent('Binärdatei');
});

// --- Artefakt öffnen (2026-08-01): Ablage-Dateien sind klickbar ---

vi.mock('@/stores/workspaceStore', () => {
  const openTab = vi.fn();
  return {
    useWorkspaceStore: (sel: (s: { openTab: typeof openTab }) => unknown) => sel({ openTab }),
    __openTab: openTab,
  };
});

test('Ablage-Datei bekommt einen Öffnen-Knopf, gelöschte nicht', async () => {
  const user = userEvent.setup();
  const store = (await import('@/stores/workspaceStore')) as unknown as {
    __openTab: ReturnType<typeof vi.fn>;
  };
  const mitProjekt: FlowRunChange[] = [
    {
      pfad: 'angebot.md',
      art: 'neu',
      vorher: null,
      nachher: '# Angebot',
      projekt: { projectId: 'p1', pfad: 'kunden/mueller/angebot.md' },
    },
    {
      pfad: 'weg.log',
      art: 'geloescht',
      vorher: 'x',
      nachher: null,
      projekt: { projectId: 'p1', pfad: 'weg.log' },
    },
    { pfad: 'ohne.md', art: 'neu', vorher: null, nachher: 'y' },
  ];
  render(<ChangeSummary changes={mitProjekt} />);
  await user.click(screen.getByTestId('change-summary').querySelector('button')!);

  const knoepfe = screen.getAllByTestId('change-open');
  expect(knoepfe).toHaveLength(1);
  await user.click(knoepfe[0]!);
  expect(store.__openTab).toHaveBeenCalledWith({
    type: 'projektdatei',
    projectId: 'p1',
    filePath: 'kunden/mueller/angebot.md',
    title: 'angebot.md',
  });
});
