/**
 * RunCard Tests (Plan 011, Schritt 15).
 * Kopfzeile mit Befehl + Status, Schritt-Zeilen, Antwort, sichtbarer
 * Abbrechen-Knopf nur während der Lauf läuft, Verbinden beim Einhängen.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RunCard from './RunCard';
import type { SkillRunState } from '@/hooks/useSkillRun';

const verbinden = vi.fn();
const abbrechen = vi.fn();
let runState: SkillRunState;

vi.mock('@/hooks/useSkillRun', () => ({
  useSkillRun: () => ({ ...runState, verbinden, abbrechen }),
}));

const apiGet = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get: apiGet }) }));

function base(overrides: Partial<SkillRunState> = {}): SkillRunState {
  return {
    runId: 7,
    skillName: 'recherche',
    args: { thema: 'Klimawandel' },
    status: 'laeuft',
    steps: [],
    result: null,
    error: null,
    changes: [],
    verbunden: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runState = base();
});

test('verbindet sich beim Einhängen mit der Lauf-ID', () => {
  render(<RunCard runId={7} />);
  expect(verbinden).toHaveBeenCalledWith(7);
});

test('Kopfzeile zeigt Befehl, Argumente und Status; Abbrechen ist sichtbar', () => {
  render(<RunCard runId={7} />);
  const karte = screen.getByTestId('run-card');
  expect(karte).toHaveTextContent('/recherche');
  expect(karte).toHaveTextContent('Klimawandel');
  expect(karte).toHaveTextContent('läuft');
  expect(screen.getByLabelText('Lauf abbrechen')).toBeInTheDocument();
});

test('Abbrechen ruft den Hook', async () => {
  const user = userEvent.setup();
  render(<RunCard runId={7} />);
  await user.click(screen.getByLabelText('Lauf abbrechen'));
  expect(abbrechen).toHaveBeenCalledTimes(1);
});

test('ein beendeter Lauf zeigt kein Abbrechen, aber die Antwort', () => {
  runState = base({ status: 'fertig', result: 'Die Recherche ergab …', verbunden: false });
  render(<RunCard runId={7} />);
  expect(screen.queryByLabelText('Lauf abbrechen')).not.toBeInTheDocument();
  expect(screen.getByTestId('run-result')).toHaveTextContent('Die Recherche ergab …');
  expect(screen.getByTestId('run-card')).toHaveTextContent('fertig');
});

test('die Antwort wird als Markdown gezeigt — Codeblock mit Kopier-Knopf (Schritt 19)', () => {
  runState = base({
    status: 'fertig',
    result: '# Ergebnis\n\n```js\nconst a = 1;\n```',
    verbunden: false,
  });
  render(<RunCard runId={7} />);
  // Überschrift als echtes Element, nicht als roher `#`-Text.
  expect(screen.getByRole('heading', { name: 'Ergebnis' })).toBeInTheDocument();
  // Codeblock trägt den Kopier-Knopf.
  expect(screen.getByLabelText('Code kopieren')).toBeInTheDocument();
});

test('Schritte erscheinen als Zeilen', () => {
  runState = base({
    steps: [
      {
        kind: 'werkzeug',
        name: 'rag_suche',
        input: { frage: 'Umsatz' },
        status: 'fertig',
        position: 0,
      },
      {
        kind: 'subagent',
        name: 'leser',
        input: { auftrag: 'lesen' },
        status: 'laeuft',
        position: 1,
      },
    ],
  });
  render(<RunCard runId={7} />);
  expect(screen.getAllByTestId('run-step')).toHaveLength(2);
  expect(screen.getByText('sucht: Umsatz')).toBeInTheDocument();
  expect(screen.getByText('leser · lesen')).toBeInTheDocument();
});

test('die Datei-Änderungen erscheinen in der Karte', () => {
  runState = base({
    status: 'fertig',
    verbunden: false,
    changes: [{ pfad: 'bericht.md', art: 'neu', vorher: null, nachher: '# Titel' }],
  });
  render(<RunCard runId={7} />);
  expect(screen.getByTestId('change-summary')).toHaveTextContent('Datei-Änderungen (1)');
});

test('ein Fehler wird angezeigt', () => {
  runState = base({ status: 'fehler', error: 'Modell nicht erreichbar', verbunden: false });
  render(<RunCard runId={7} />);
  expect(screen.getByTestId('run-error')).toHaveTextContent('Modell nicht erreichbar');
});

test('das erste Aufklappen eines Schritts lädt die Rohdaten nach', async () => {
  const user = userEvent.setup();
  apiGet.mockResolvedValue({ data: { steps: [{ position: 0, raw_output: 'Rohtext' }] } });
  runState = base({
    steps: [
      {
        kind: 'werkzeug',
        name: 'web_lesen',
        input: { url: 'x' },
        output: 'kurz',
        status: 'fertig',
        position: 0,
      },
    ],
  });
  render(<RunCard runId={7} />);
  await user.click(screen.getByTestId('run-step').querySelector('button')!);
  expect(apiGet).toHaveBeenCalledWith('/skills/laeufe/7?raw=1', { showError: false });
});
