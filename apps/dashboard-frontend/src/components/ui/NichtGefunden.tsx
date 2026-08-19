import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

/**
 * „Nicht gefunden" als Komponente, nicht als eigene Seite (Plan 023 B2).
 *
 * Die alte 404-Seite lebte in der Legacy-Shell und war damit an eine zweite,
 * ungepflegte Oberfläche gebunden: wer eine unbekannte URL aufrief, landete in
 * einer Shell mit genau einem Menüeintrag. Die Shell ist weg, der Fall bleibt.
 *
 * Bewusst ohne große Zahl und ohne Warnsymbol: eine falsche Adresse ist kein
 * Fehler des Nutzers und kein Zwischenfall, sondern ein Abzweig.
 */
export default function NichtGefunden({
  ziel = '/workspace',
  zielText = 'Zum Arbeitsbereich',
  hinweis = 'Diese Adresse gibt es nicht.',
}: {
  ziel?: string;
  zielText?: string;
  hinweis?: string;
}) {
  return (
    <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Compass className="h-8 w-8 text-text-secondary" aria-hidden="true" />
      <p className="text-sm text-text-secondary">{hinweis}</p>
      <Link
        to={ziel}
        className="rounded-lg bg-primary px-5 py-2 text-sm text-primary-foreground no-underline transition-opacity hover:opacity-90"
      >
        {zielText}
      </Link>
    </div>
  );
}
