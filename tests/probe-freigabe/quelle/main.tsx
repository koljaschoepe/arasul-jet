/**
 * Die Seite der Proben-App (J35, J36): einreichen, lesen, wer entscheidet --
 * und die Freigaben dieser App entscheiden, mit dem Baustein der Bibliothek.
 *
 * So bindet eine App die Freigabe ein (J36): sie fragt `GET /api/freigabe-anfragen`
 * mit der Sitzung, die sie im Rahmen ohnehin hat, behaelt die Eintraege ihrer
 * eigenen Kennung und reicht sie dem Muster. Entscheiden darf, wen das Geraet
 * in die Liste nimmt; die App prueft nichts nach.
 */
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Freigabe, Kopf, Meldung, type FreigabeEintrag } from '@marken';
import './app.css';

const APP = location.pathname.split('/')[2] ?? '';

const STATUS: Record<string, string> = {
  laeuft: 'Ihr Vorgang läuft.',
  wartend: 'Ihr Vorgang wartet auf eine Freigabe.',
  fertig: 'Ihr Vorgang ist freigegeben und erledigt.',
  abgebrochen: 'Ihr Vorgang wurde abgelehnt.',
  abgelaufen: 'Ihr Vorgang wurde nicht rechtzeitig freigegeben.',
  fehler: 'Ihr Vorgang ist gescheitert.',
};

interface Anfrage {
  id: number;
  app_id: string;
  app_name: string | null;
  titel: string;
  zusammenhang: string | null;
  frist: string;
  angefragt_am: string;
  einreicher?: string | null;
}

function csrf(): string {
  const treffer = document.cookie.match(/(?:^|;\s*)arasul_csrf=([^;]*)/);
  return treffer?.[1] ? decodeURIComponent(treffer[1]) : '';
}

async function geraet(pfad: string, leib?: unknown): Promise<unknown> {
  const antwort = await fetch(pfad, {
    method: leib === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
    ...(leib === undefined ? {} : { body: JSON.stringify(leib) }),
  });
  const rumpf = await antwort.json().catch(() => null);
  if (!antwort.ok) throw new Error(rumpf?.error?.message ?? 'Das hat nicht geklappt.');
  return rumpf;
}

function Seite() {
  const [stand, setStand] = useState('');
  const [wer, setWer] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [anfragen, setAnfragen] = useState<Anfrage[]>([]);
  const [fehler, setFehler] = useState('');

  const laden = useCallback(async () => {
    const r = (await geraet('/api/freigabe-anfragen')) as { data?: Anfrage[] };
    setAnfragen((r.data ?? []).filter(a => a.app_id === APP));
  }, []);

  useEffect(() => {
    void laden().catch(() => {});
    const t = setInterval(() => void laden().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [laden]);

  const zeige = useCallback(async (lauf: number) => {
    const r = (await fetch(`api/lauf?lauf=${lauf}`).then(a => a.json())) as {
      status: string;
      freigabe?: { satz?: string };
    };
    setStand(STATUS[r.status] ?? `Stand: ${r.status}`);
    setWer(r.status === 'wartend' ? (r.freigabe?.satz ?? '') : '');
    if (r.status === 'laeuft' || r.status === 'wartend') setTimeout(() => void zeige(lauf), 3000);
  }, []);

  const einreichen = async () => {
    setLaeuft(true);
    setStand('Wird eingereicht …');
    const antwort = await fetch('api/einreichen', { method: 'POST' });
    const daten = (await antwort.json()) as { lauf?: number; fehler?: string };
    if (!daten.lauf) {
      setStand(`Einreichen ging nicht: ${daten.fehler || antwort.status}`);
      setLaeuft(false);
      return;
    }
    await zeige(daten.lauf);
  };

  const eintraege: FreigabeEintrag[] = anfragen.map(a => ({
    id: a.id,
    titel: a.titel,
    zusammenhang: a.zusammenhang,
    herkunft: a.app_name ?? a.app_id,
    einreicher: a.einreicher,
    frist: a.frist,
    angefragtAm: a.angefragt_am,
  }));

  const entscheide = async (
    e: FreigabeEintrag,
    was: 'bestaetigen' | 'ablehnen',
    grund?: string
  ) => {
    setFehler('');
    try {
      await geraet(`/api/freigabe-anfragen/${e.id}/${was}`, grund ? { begruendung: grund } : {});
    } catch (err) {
      setFehler((err as Error).message);
      throw err;
    } finally {
      await laden().catch(() => {});
    }
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 text-foreground">
      <Kopf
        titel="Wochenbericht einreichen"
        beschreibung="Der Bericht geht erst hinaus, wenn ihn ein anderer Mensch freigibt."
      />
      <div>
        <Button
          variant="solid"
          data-testid="einreichen"
          disabled={laeuft}
          onClick={() => void einreichen()}
        >
          Einreichen
        </Button>
      </div>
      <p data-testid="stand" aria-live="polite">
        {stand}
      </p>
      <p data-testid="wer-entscheidet">{wer}</p>

      <section data-testid="baustein-freigaben" className="flex flex-col gap-2">
        <h2 className="text-ui font-semibold">Freigaben dieser App</h2>
        {fehler && <Meldung art="fehler" titel={fehler} />}
        <Freigabe
          eintraege={eintraege}
          beiBestaetigen={e => entscheide(e, 'bestaetigen')}
          beiAblehnen={(e, grund) => entscheide(e, 'ablehnen', grund)}
        />
      </section>
    </main>
  );
}

createRoot(document.getElementById('wurzel')!).render(
  <StrictMode>
    <Seite />
  </StrictMode>
);
