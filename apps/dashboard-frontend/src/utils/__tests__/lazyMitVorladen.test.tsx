/**
 * `lazyMitVorladen` (M5): ohne Vorladen verhält es sich wie `lazy` (die
 * Ladefläche, dann der Inhalt); vorgeladen steht der Inhalt im ersten Bild,
 * ohne zu suspendieren — daran hingen am Orin 300 ms beim ersten Wechsel.
 */
import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { lazyMitVorladen } from '../lazyNachladen';

function Inhalt({ wort }: { wort: string }) {
  return <p>{wort}</p>;
}

const huelle = (kind: React.ReactNode) => <Suspense fallback={<p>lädt</p>}>{kind}</Suspense>;

it('ohne Vorladen kommt erst die Ladefläche, dann der Inhalt', async () => {
  const Faul = lazyMitVorladen(async () => ({ default: Inhalt }));
  render(huelle(<Faul wort="da" />));
  expect(screen.getByText('lädt')).toBeInTheDocument();
  expect(await screen.findByText('da')).toBeInTheDocument();
});

it('vorgeladen steht der Inhalt sofort da', async () => {
  const laden = vi.fn(async () => ({ default: Inhalt }));
  const Vorgeladen = lazyMitVorladen(laden);
  await Vorgeladen.vorladen();
  render(huelle(<Vorgeladen wort="sofort" />));
  expect(screen.getByText('sofort')).toBeInTheDocument();
  expect(screen.queryByText('lädt')).not.toBeInTheDocument();
});

it('ein Fehler beim Vorladen bleibt still, das spätere Laden versucht es neu', async () => {
  const laden = vi
    .fn<() => Promise<{ default: typeof Inhalt }>>()
    .mockRejectedValueOnce(new Error('weg'))
    .mockResolvedValue({ default: Inhalt });
  const Komponente = lazyMitVorladen(laden);
  await expect(Komponente.vorladen()).resolves.toBeUndefined();
  render(huelle(<Komponente wort="doch" />));
  expect(await screen.findByText('doch')).toBeInTheDocument();
});
