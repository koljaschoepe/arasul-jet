/**
 * ComposerCard Tests (Plan 004, Schritt 4 · Slash-Menü Plan 011, Schritt 13)
 *
 * Fokus: sichtbares Anhang-Feedback, native Formulierung UND das Flow-Menü,
 * das die alte Flow-Agenten-Palette ablöst — Filtern, Pfeiltasten, Enter
 * übernimmt, Stift bearbeitet, feste Befehle /flows und /neuer-flow.
 */
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ComposerCard, { ordnerBeschriftung, type ComposerModel } from './ComposerCard';
import type { Flow } from '@/types/flows';

// Ordner-Scope kommt aus dem workspaceStore — hier ohne aktiven Scope mocken.
vi.mock('@/stores/workspaceStore', () => ({
  useWorkspaceStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ chatScope: null, setChatScope: vi.fn() }),
}));

// Der ArgumentPicker (Schritt 14) liest über useApi/React Query — hier flach.
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: vi.fn().mockResolvedValue({ data: [] }) }),
}));

const models: ComposerModel[] = [{ id: 'qwen3:7b', name: 'Qwen3 7B' }];

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onCancel: vi.fn(),
    isLoading: false,
    attachedFiles: [] as File[],
    onRemoveFile: vi.fn(),
    attachedImages: [] as { file: File; base64: string }[],
    onRemoveImage: vi.fn(),
    onPickFile: vi.fn(),
    models,
    selectedModel: '',
    onSelectModel: vi.fn(),
    ...overrides,
  };
}

describe('ComposerCard', () => {
  test('nutzt einen nativen Platzhalter', () => {
    render(<ComposerCard {...makeProps()} />);
    expect(screen.getByPlaceholderText('Nachricht schreiben …')).toBeInTheDocument();
  });

  test('ohne Anhänge erscheint keine Chip-Leiste', () => {
    render(<ComposerCard {...makeProps()} />);
    expect(screen.queryByTestId('composer-chips')).not.toBeInTheDocument();
  });

  test('angehängte Datei erscheint als entfernbarer Chip über dem Eingabefeld', async () => {
    const user = userEvent.setup();
    const onRemoveFile = vi.fn();
    const file = new File(['x'], 'quartalsbericht.pdf', { type: 'application/pdf' });

    render(<ComposerCard {...makeProps({ attachedFiles: [file], onRemoveFile })} />);

    expect(screen.getByTestId('composer-chips')).toBeInTheDocument();
    expect(screen.getByText('quartalsbericht.pdf')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Anhang entfernen'));
    expect(onRemoveFile).toHaveBeenCalledTimes(1);
  });

  const flows: Flow[] = [
    { name: 'recherche', beschreibung: 'Recherchiert im Web', argumente: [] },
    { name: 'zusammenfassen', beschreibung: 'Fasst Dokumente zusammen', argumente: [] },
  ];

  test('/ öffnet das Flow-Menü samt festen Befehlen', () => {
    render(<ComposerCard {...makeProps({ value: '/', flows })} />);
    expect(screen.getByTestId('flow-menu')).toBeInTheDocument();
    expect(screen.getByText('/recherche')).toBeInTheDocument();
    expect(screen.getByText('/zusammenfassen')).toBeInTheDocument();
    // Feste Befehle sind immer dabei.
    expect(screen.getByText('/flows')).toBeInTheDocument();
    expect(screen.getByText('/neuer-flow')).toBeInTheDocument();
  });

  test('/rech filtert auf den passenden Flow', () => {
    render(<ComposerCard {...makeProps({ value: '/rech', flows })} />);
    expect(screen.getByText('/recherche')).toBeInTheDocument();
    expect(screen.queryByText('/zusammenfassen')).not.toBeInTheDocument();
    // Kein fester Befehl beginnt mit „rech".
    expect(screen.queryByText('/neuer-flow')).not.toBeInTheDocument();
  });

  test('Auswahl setzt /<name> und schließt das Menü', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/rech', flows, onChange })} />);
    await user.click(screen.getByText('/recherche'));
    expect(onChange).toHaveBeenCalledWith('/recherche ');
  });

  test('keine Menü ohne / und keine bei Leerzeichen (Eingabe-Modus)', () => {
    const { rerender } = render(<ComposerCard {...makeProps({ value: 'hallo', flows })} />);
    expect(screen.queryByTestId('flow-menu')).not.toBeInTheDocument();
    rerender(<ComposerCard {...makeProps({ value: '/recherche finde', flows })} />);
    expect(screen.queryByTestId('flow-menu')).not.toBeInTheDocument();
  });

  test('Enter bei offenem Menü übernimmt den aktiven Eintrag (statt zu senden)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSend = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/rech', flows, onChange, onSend })} />);
    await user.click(screen.getByLabelText('Nachricht an die KI'));
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('/recherche ');
    expect(onSend).not.toHaveBeenCalled();
  });

  test('Pfeil-runter wählt den nächsten Eintrag, Enter übernimmt ihn', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/', flows, onChange })} />);
    await user.click(screen.getByLabelText('Nachricht an die KI'));
    await user.keyboard('{ArrowDown}{Enter}');
    // Erster ist recherche, ein Schritt runter → zusammenfassen.
    expect(onChange).toHaveBeenCalledWith('/zusammenfassen ');
  });

  test('/flows löst die Übersicht aus', async () => {
    const user = userEvent.setup();
    const onOpenFlowOverview = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/flows', flows, onOpenFlowOverview })} />);
    // Innerhalb des Menüs klicken — der Textarea-Wert „/flows" trägt denselben
    // Text und würde sonst mitmatchen.
    await user.click(within(screen.getByTestId('flow-menu')).getByText('/flows'));
    expect(onOpenFlowOverview).toHaveBeenCalledTimes(1);
  });

  test('/neuer-flow löst den Anlege-Weg aus', async () => {
    const user = userEvent.setup();
    const onCreateFlow = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/neuer-flow', flows, onCreateFlow })} />);
    await user.click(within(screen.getByTestId('flow-menu')).getByText('/neuer-flow'));
    expect(onCreateFlow).toHaveBeenCalledTimes(1);
  });

  test('nach einem festen Befehl öffnet / das Menü wieder (Regression)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ComposerCard
        {...makeProps({ value: '/flows', flows, onChange, onOpenFlowOverview: vi.fn() })}
      />
    );
    await user.click(within(screen.getByTestId('flow-menu')).getByText('/flows'));
    // Der Befehl leert das Feld (onChange('')). Danach tippt der Nutzer wieder „/":
    rerender(<ComposerCard {...makeProps({ value: '/', flows, onChange })} />);
    expect(screen.getByTestId('flow-menu')).toBeInTheDocument();
  });

  test('Stift-Symbol bearbeitet den Flow, ohne ihn zu übernehmen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onEditFlow = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/rech', flows, onChange, onEditFlow })} />);
    await user.click(screen.getByLabelText(/bearbeiten/i));
    expect(onEditFlow).toHaveBeenCalledWith('recherche');
    // Bearbeiten ist NICHT dasselbe wie Übernehmen.
    expect(onChange).not.toHaveBeenCalledWith('/recherche ');
  });

  test('keine Menü bei angehängter Datei', () => {
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    render(<ComposerCard {...makeProps({ value: '/', flows, attachedFiles: [file] })} />);
    expect(screen.queryByTestId('flow-menu')).not.toBeInTheDocument();
  });

  test('angehängte Bilder erscheinen je als eigener Chip', async () => {
    const user = userEvent.setup();
    const onRemoveImage = vi.fn();
    const images = [
      { file: new File(['a'], 'foto-a.png', { type: 'image/png' }), base64: 'data:a' },
      { file: new File(['b'], 'foto-b.png', { type: 'image/png' }), base64: 'data:b' },
    ];

    render(<ComposerCard {...makeProps({ attachedImages: images, onRemoveImage })} />);

    expect(screen.getByText('foto-a.png')).toBeInTheDocument();
    expect(screen.getByText('foto-b.png')).toBeInTheDocument();
    expect(screen.getAllByTestId('composer-chip')).toHaveLength(2);

    await user.click(screen.getAllByLabelText('Bild entfernen')[1]!);
    expect(onRemoveImage).toHaveBeenCalledWith(1);
  });
});

// --- Argument-Eingabe (Plan 011, Schritt 14) --------------------------------
// Diese Fälle brauchen die echte kontrollierte Schleife (onChange → value),
// weil die Argument-Eingabe den Feldwert selbst fortschreibt.

const argFlows: Flow[] = [
  {
    name: 'recherche',
    beschreibung: 'Web-Recherche',
    argumente: [{ name: 'thema', typ: 'freitext', beschreibung: '', pflicht: true }],
  },
  {
    name: 'stil',
    beschreibung: 'Mit fester Auswahl',
    argumente: [
      { name: 'ton', typ: 'auswahl', beschreibung: '', pflicht: true, optionen: ['kurz', 'lang'] },
    ],
  },
  {
    name: 'wissen',
    beschreibung: 'Zwei Argumente',
    argumente: [
      { name: 'frage', typ: 'freitext', beschreibung: '', pflicht: true },
      { name: 'raum', typ: 'freitext', beschreibung: '', pflicht: true },
    ],
  },
];

/** Kontrollierte Harness: spiegelt onChange in value zurück (wie der echte Chat). */
function Harness() {
  const [value, setValue] = useState('/');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ComposerCard {...makeProps({ value, onChange: setValue, flows: argFlows })} />
    </QueryClientProvider>
  );
}

describe('ComposerCard · Argument-Eingabe (Schritt 14)', () => {
  test('nach Flow-Auswahl steht der graue Argument-Hinweis im Feld', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('/recherche'));
    const hints = screen.getByTestId('argument-hints');
    expect(hints).toHaveTextContent('/recherche');
    expect(hints).toHaveTextContent('<thema>');
  });

  test('Tippen überschreibt den grauen Hinweis', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('/recherche'));
    await user.type(screen.getByLabelText('Nachricht an die KI'), 'Klimawandel');
    // Sobald getippt wird, verschwindet der Platzhalter des aktiven Arguments.
    expect(screen.queryByTestId('argument-hints')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nachricht an die KI')).toHaveValue('/recherche Klimawandel');
  });

  test('Tab springt zum nächsten Argument', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('/wissen'));
    const ta = screen.getByLabelText('Nachricht an die KI');
    await user.type(ta, 'was kostet strom');
    await user.tab();
    // Zweites Argument ist jetzt aktiv und grau sichtbar.
    expect(screen.getByTestId('argument-hints')).toHaveTextContent('<raum>');
    expect(ta).toHaveValue('/wissen was kostet strom ');
  });

  test('ein Auswahl-Argument öffnet direkt den Picker', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('/stil'));
    const picker = await screen.findByTestId('argument-picker');
    expect(within(picker).getByText('kurz')).toBeInTheDocument();
    expect(within(picker).getByText('lang')).toBeInTheDocument();
  });
});

// --- Flow-Lauf statt Chat-Nachricht (Plan 011, Schritt 15) ------------------

/** Kontrollierte Harness mit Lauf-/Sende-Spions. */
function RunHarness({
  onRunFlow,
  onSend,
  start = '/',
}: {
  onRunFlow: (name: string, args: Record<string, string>) => void;
  onSend: () => void;
  start?: string;
}) {
  const [value, setValue] = useState(start);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ComposerCard
        {...makeProps({ value, onChange: setValue, flows: argFlows, onRunFlow, onSend })}
      />
    </QueryClientProvider>
  );
}

describe('ComposerCard · Flow-Lauf abschicken (Schritt 15)', () => {
  test('Enter bei einem Flow-Befehl startet einen Lauf mit den Argumenten', async () => {
    const user = userEvent.setup();
    const onRunFlow = vi.fn();
    const onSend = vi.fn();
    render(<RunHarness onRunFlow={onRunFlow} onSend={onSend} />);
    await user.click(screen.getByText('/recherche'));
    const ta = screen.getByLabelText('Nachricht an die KI');
    await user.type(ta, 'Klimawandel 2026');
    await user.keyboard('{Enter}');
    expect(onRunFlow).toHaveBeenCalledWith('recherche', { thema: 'Klimawandel 2026' }, null);
    expect(onSend).not.toHaveBeenCalled();
  });

  test('eine normale Nachricht sendet ganz normal (kein Lauf)', async () => {
    const user = userEvent.setup();
    const onRunFlow = vi.fn();
    const onSend = vi.fn();
    render(<RunHarness onRunFlow={onRunFlow} onSend={onSend} start="hallo welt" />);
    await user.click(screen.getByLabelText('Nachricht an die KI'));
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onRunFlow).not.toHaveBeenCalled();
  });

  test('ein unbekannter /Befehl wird normal gesendet, nicht als Lauf', async () => {
    const user = userEvent.setup();
    const onRunFlow = vi.fn();
    const onSend = vi.fn();
    render(<RunHarness onRunFlow={onRunFlow} onSend={onSend} start="/unbekannt hallo" />);
    await user.click(screen.getByLabelText('Nachricht an die KI'));
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onRunFlow).not.toHaveBeenCalled();
  });

  // Live-Bug 2026-07-27: Ein von Hand getippter/eingefügter Befehl lief ohne
  // aktive Eingabehilfe mit LEEREN Argumenten los — der Text hinter dem Befehl
  // ging verloren und Flows mit Pflicht-Argument scheiterten mit 400.
  test('von Hand getippter Befehl bindet den Resttext an das erste Pflicht-Freitext-Argument', async () => {
    const user = userEvent.setup();
    const onRunFlow = vi.fn();
    const onSend = vi.fn();
    render(
      <RunHarness onRunFlow={onRunFlow} onSend={onSend} start="/recherche Klimawandel 2026" />
    );
    await user.click(screen.getByLabelText('Nachricht an die KI'));
    await user.keyboard('{Enter}');
    expect(onRunFlow).toHaveBeenCalledWith('recherche', { thema: 'Klimawandel 2026' }, null);
    expect(onSend).not.toHaveBeenCalled();
  });

  test('von Hand getippter Befehl ohne Resttext startet mit leeren Argumenten', async () => {
    const user = userEvent.setup();
    const onRunFlow = vi.fn();
    const onSend = vi.fn();
    render(<RunHarness onRunFlow={onRunFlow} onSend={onSend} start="/recherche " />);
    await user.click(screen.getByLabelText('Nachricht an die KI'));
    await user.keyboard('{Enter}');
    expect(onRunFlow).toHaveBeenCalledWith('recherche', {}, null);
  });
});

/**
 * Plan 023 E6: ein Ordner ohne Zahl ist eine Behauptung.
 *
 * Der Nutzer sieht „Speichern in: berichte" und weiß nicht, ob dort drei oder
 * dreihundert Dateien liegen.
 */
describe('ordnerBeschriftung (Plan 023 E6)', () => {
  it('nennt die Zahl der Dateien', () => {
    expect(ordnerBeschriftung({ label: 'berichte', dateien: 20 })).toBe(
      'Speichern in: berichte · 20 Dateien'
    );
  });

  it('sagt „mindestens", wenn der Baum gedeckelt war', () => {
    // Eine geschönigte Zahl wäre schlimmer als gar keine.
    expect(ordnerBeschriftung({ label: 'gross', dateien: 500, dateienGedeckelt: true })).toBe(
      'Speichern in: gross · mindestens 500 Dateien'
    );
  });

  it('bleibt ohne Zahl bei der schlichten Form', () => {
    expect(ordnerBeschriftung({ label: 'neu' })).toBe('Speichern in: neu');
    expect(ordnerBeschriftung({ label: 'neu', dateien: null })).toBe('Speichern in: neu');
  });

  it('zaehlt eine einzelne Datei im Singular', () => {
    expect(ordnerBeschriftung({ label: 'x', dateien: 1 })).toContain('1 Datei');
    expect(ordnerBeschriftung({ label: 'x', dateien: 1 })).not.toContain('Dateien');
  });

  it('nennt auch einen leeren Ordner ehrlich', () => {
    expect(ordnerBeschriftung({ label: 'leer', dateien: 0 })).toBe(
      'Speichern in: leer · 0 Dateien'
    );
  });
});
