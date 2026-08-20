/**
 * Die Ersteinrichtung, Plan 023 C7.
 *
 * Der Assistent ist der erste Bildschirm nach `CreateAdmin` und hatte bis zum
 * 20.08.2026 keinen einzigen Test. An diesem Tag wurde er zum ersten Mal am
 * Pruefstand durchgelaufen, nach einem Werksreset auf Auslieferungszustand.
 * Die Faelle hier halten fest, was dabei herauskam.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetupWizard from '../SetupWizard';

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi, default: () => mockApi }));

const startDownload = vi.fn();
vi.mock('../../../contexts/DownloadContext', () => ({
  useDownloads: () => ({ startDownload, getDownloadState: () => null }),
}));

const KATALOG = {
  models: [
    // Genau der Fall vom Geraet: das empfohlene Modell traegt den Typ `vision`,
    // weil Gemma 4 Bilder lesen kann. Bis zum 20.08.2026 filterte der Assistent
    // auf `llm` und warf damit seine eigene Empfehlung aus der Liste.
    {
      id: 'gemma4:e4b-q4',
      name: 'Gemma 4 E4B',
      description: 'Allzweckmodell',
      size_bytes: 4 * 1024 ** 3,
      ram_required_gb: 8,
      model_type: 'vision',
      install_status: 'not_installed',
    },
    {
      id: 'bge-m3',
      name: 'BGE M3',
      description: 'Einbettungen',
      model_type: 'embedding',
      install_status: 'not_installed',
    },
    {
      id: 'tesseract:latest',
      name: 'Tesseract',
      description: 'Texterkennung',
      model_type: 'ocr',
      install_status: 'not_installed',
    },
    {
      id: 'qwen3:8b',
      name: 'Qwen 3 8B',
      description: 'Mehrsprachig',
      size_bytes: 7 * 1024 ** 3,
      ram_required_gb: 10,
      model_type: 'llm',
      install_status: 'not_installed',
    },
  ],
};

function antworten({ netzFehler = false }: { netzFehler?: boolean } = {}) {
  mockApi.get.mockImplementation((pfad: string) => {
    if (pfad === '/system/network') {
      return netzFehler
        ? Promise.reject(new Error('kaputt'))
        : Promise.resolve({ internet_reachable: true });
    }
    if (pfad === '/models/catalog') return Promise.resolve(KATALOG);
    if (pfad === '/models/recommended')
      return Promise.resolve({ recommended_model: 'gemma4:e4b-q4' });
    return Promise.resolve({});
  });
  mockApi.post.mockResolvedValue({});
  mockApi.put.mockResolvedValue({});
}

async function bisSchrittZwei(nutzer: ReturnType<typeof userEvent.setup>) {
  await nutzer.click(screen.getByRole('button', { name: /^Weiter/ }));
  await screen.findByText('Dein erstes Modell');
}

describe('SetupWizard', () => {
  const onComplete = vi.fn();
  const onSkip = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    antworten();
  });

  // Der Assistent hatte sechs Schritte. Kolja am 20.08.2026: kurz, praezise,
  // kein Schritt, der nur bestaetigt, was der vorige getan hat.
  test('hat genau zwei Schritte', async () => {
    const nutzer = userEvent.setup();
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);

    expect(screen.getByText('Schritt 1 von 2')).toBeInTheDocument();
    await bisSchrittZwei(nutzer);
    expect(screen.getByText('Schritt 2 von 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fertig/ })).toBeInTheDocument();
  });

  // Am Pruefstand live gesehen: Schritt 3 verlangte, das gerade selbst gesetzte
  // Passwort zu aendern, „Dies ist ein Pflichtschritt", und `Weiter` blieb
  // gesperrt. Der Weg zum Arbeitsbereich fuehrte nur ueber „Ueberspringen".
  test('verlangt kein Passwort, das der Kunde gerade selbst gesetzt hat', async () => {
    const nutzer = userEvent.setup();
    const { container } = render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);

    expect(container.querySelector('input[type=password]')).toBeNull();
    expect(screen.queryByText(/Standard-Passwort/i)).toBeNull();
    expect(screen.queryByText(/Pflichtschritt/i)).toBeNull();

    await bisSchrittZwei(nutzer);
    expect(container.querySelector('input[type=password]')).toBeNull();
  });

  // F-20. Der Assistent siezte („Dieser Assistent fuehrt Sie durch"), waehrend
  // `CreateAdmin` einen Bildschirm davor duzt.
  test('duzt', () => {
    const { container } = render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);

    expect(container.textContent).not.toMatch(/\b(Sie|Ihr|Ihre|Ihnen)\b/);
    expect(container.textContent).toMatch(/\bdu\b|\bdein\b/i);
  });

  // Kolja am 20.08.2026 ausdruecklich: keine Gedankenstriche.
  test('setzt keine Gedankenstriche', () => {
    const { container } = render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);

    expect(container.textContent).not.toContain('—');
    expect(container.textContent).not.toContain('–');
  });

  // Am Pruefstand zeigte die Zusammenfassung „IP-Adresse 172.31.0.69", also die
  // Adresse des Containers. Am Arbeitsgeraet dasselbe: 172.30.x.x, waehrend das
  // Geraet unter 192.168.0.197 erreichbar ist. Eine Zahl, die niemand anwaehlen
  // kann, gehoert nicht auf den Bildschirm.
  test('verspricht keine Adresse, die aus dem Container stammt', async () => {
    const nutzer = userEvent.setup();
    const { container } = render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);
    await bisSchrittZwei(nutzer);

    await waitFor(() => expect(screen.getByText(/Internet verbunden/)).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(container.textContent).not.toMatch(/IP-Adresse/);
  });

  // „Non-critical, silently ignore": das Profil galt als gespeichert, auch wenn
  // der Aufruf scheiterte.
  test('sagt es, wenn das Profil nicht gespeichert werden konnte', async () => {
    const nutzer = userEvent.setup();
    mockApi.post.mockImplementation((pfad: string) =>
      pfad === '/memory/profile' ? Promise.reject(new Error('Datenbank weg')) : Promise.resolve({})
    );
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);

    await nutzer.click(screen.getByRole('button', { name: /^Weiter/ }));

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent(/Profil konnte nicht gespeichert werden/);
    expect(meldung).toHaveTextContent(/Datenbank weg/);
    // Und der Assistent tut nicht so, als waere er weiter.
    expect(screen.getByText('Schritt 1 von 2')).toBeInTheDocument();
  });

  // Vorher rief `handleSkip` das `onSkip()` auch im catch. Der Assistent stand
  // beim naechsten Start wieder da, ohne dass jemand wusste warum.
  test('sagt es, wenn Ueberspringen nicht geklappt hat', async () => {
    const nutzer = userEvent.setup();
    mockApi.post.mockImplementation((pfad: string) =>
      pfad === '/system/setup-skip' ? Promise.reject(new Error('403')) : Promise.resolve({})
    );
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);

    await nutzer.click(screen.getByRole('button', { name: /Überspringen/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Überspringen hat nicht geklappt/);
    expect(onSkip).not.toHaveBeenCalled();
  });

  // `PUT /system/setup-step` antwortete am 20.08.2026 mit 400, weil die
  // Oberflaeche 1 bis 6 zaehlte und der Vertrag 0 bis 5 erlaubt. Verschluckt
  // wurde es trotzdem.
  test('meldet einen verlorenen Fortschritt, statt ihn zu verschlucken', async () => {
    const nutzer = userEvent.setup();
    mockApi.put.mockRejectedValue(new Error('400'));
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);

    await bisSchrittZwei(nutzer);

    expect(
      await screen.findByText(/Fortschritt lässt sich gerade nicht speichern/)
    ).toBeInTheDocument();
    // Der Schritt zaehlt innerhalb des erlaubten Bereichs.
    expect(mockApi.put).toHaveBeenCalledWith(
      '/system/setup-step',
      expect.objectContaining({ step: 2 }),
      expect.anything()
    );
  });

  test('zeigt zuerst nur das empfohlene Modell und klappt die anderen auf', async () => {
    const nutzer = userEvent.setup();
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);
    await bisSchrittZwei(nutzer);

    await screen.findByText('Gemma 4 E4B');
    expect(screen.queryByText('Qwen 3 8B')).toBeNull();

    await nutzer.click(screen.getByRole('button', { name: /Anderes Modell wählen/ }));
    expect(screen.getByText('Qwen 3 8B')).toBeInTheDocument();
  });

  test('startet den Download und schliesst ab', async () => {
    const nutzer = userEvent.setup();
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);
    await bisSchrittZwei(nutzer);
    await screen.findByText('Gemma 4 E4B');

    await nutzer.click(screen.getByRole('button', { name: /Fertig/ }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(startDownload).toHaveBeenCalledWith('gemma4:e4b-q4', 'Gemma 4 E4B');
    expect(mockApi.post).toHaveBeenCalledWith(
      '/system/setup-complete',
      expect.objectContaining({ selectedModel: 'gemma4:e4b-q4' }),
      expect.anything()
    );
  });

  test('bleibt stehen, wenn der Abschluss scheitert', async () => {
    const nutzer = userEvent.setup();
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);
    await bisSchrittZwei(nutzer);
    await screen.findByText('Gemma 4 E4B');

    mockApi.post.mockRejectedValueOnce(new Error('Netz weg'));
    await nutzer.click(screen.getByRole('button', { name: /Fertig/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht abgeschlossen/);
    expect(onComplete).not.toHaveBeenCalled();
  });

  // Am 20.08.2026 am Pruefstand live gesehen: Schritt 2 zeigte GAR KEIN Modell.
  // `GET /models/recommended` empfiehlt dort `gemma4:26b-q4`, der Katalog fuehrt
  // es als `vision`, und der Assistent filterte auf `llm`. Die Auswahl stand
  // damit auf einer Kennung, die die Liste nicht enthielt. Derselbe Fehler war
  // im alten Assistenten drin, nur unsichtbar: dort stand auf dem
  // Zusammenfassungs-Bildschirm die rohe Kennung statt eines Namens, und der
  // Download startete nie.
  test('zeigt die Empfehlung auch dann, wenn sie Bilder lesen kann', async () => {
    const nutzer = userEvent.setup();
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);
    await bisSchrittZwei(nutzer);

    expect(await screen.findByText('Gemma 4 E4B')).toBeInTheDocument();
    expect(screen.getByText('Empfohlen')).toBeInTheDocument();
  });

  test('bietet weder Einbettungs- noch Texterkennungsmodelle an', async () => {
    const nutzer = userEvent.setup();
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);
    await bisSchrittZwei(nutzer);
    await screen.findByText('Gemma 4 E4B');

    await nutzer.click(screen.getByRole('button', { name: /Anderes Modell wählen/ }));
    expect(screen.getByText('Qwen 3 8B')).toBeInTheDocument();
    expect(screen.queryByText('BGE M3')).toBeNull();
    expect(screen.queryByText('Tesseract')).toBeNull();
  });

  // Empfiehlt das Geraet etwas, das der Katalog gar nicht kennt, darf die
  // Auswahl nicht ins Leere zeigen.
  test('faellt auf das erste Modell zurueck, wenn die Empfehlung fehlt', async () => {
    const nutzer = userEvent.setup();
    mockApi.get.mockImplementation((pfad: string) => {
      if (pfad === '/system/network') return Promise.resolve({ internet_reachable: true });
      if (pfad === '/models/catalog') return Promise.resolve(KATALOG);
      if (pfad === '/models/recommended')
        return Promise.resolve({ recommended_model: 'gibt-es-nicht:99b' });
      return Promise.resolve({});
    });
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);
    await bisSchrittZwei(nutzer);

    expect(await screen.findByText('Gemma 4 E4B')).toBeInTheDocument();
    expect(screen.queryByText('Empfohlen')).toBeNull();
  });

  test('zaehlt die weiteren Modelle richtig', async () => {
    const nutzer = userEvent.setup();
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);
    await bisSchrittZwei(nutzer);
    await screen.findByText('Gemma 4 E4B');

    // Zwei waehlbare Modelle im Katalog, eines sichtbar, also eines weiteres.
    expect(
      screen.getByRole('button', { name: /Anderes Modell wählen \(1 weitere\)/ })
    ).toBeInTheDocument();
  });

  test('sagt bei fehlendem Internet, wie das Modell trotzdem herkommt', async () => {
    const nutzer = userEvent.setup();
    mockApi.get.mockImplementation((pfad: string) => {
      if (pfad === '/system/network') return Promise.resolve({ internet_reachable: false });
      if (pfad === '/models/catalog') return Promise.resolve(KATALOG);
      if (pfad === '/models/recommended')
        return Promise.resolve({ recommended_model: 'gemma4:e4b-q4' });
      return Promise.resolve({});
    });
    render(<SetupWizard onComplete={onComplete} onSkip={onSkip} />);
    await bisSchrittZwei(nutzer);

    expect(await screen.findByText(/per USB einspielen/)).toBeInTheDocument();
  });
});
