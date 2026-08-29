import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button, Leerzustand } from '@marken';

/**
 * „Nicht gefunden" als Komponente, nicht als eigene Seite (Plan 023 B2).
 *
 * Die alte 404-Seite lebte in der Legacy-Shell und war damit an eine zweite,
 * ungepflegte Oberfläche gebunden: wer eine unbekannte URL aufrief, landete in
 * einer Shell mit genau einem Menüeintrag. Die Shell ist weg, der Fall bleibt.
 *
 * Bewusst ohne große Zahl und ohne Warnsymbol: eine falsche Adresse ist kein
 * Fehler des Nutzers und kein Zwischenfall, sondern ein Abzweig.
 *
 * SEIT H5 AUS DER BIBLIOTHEK. Die Form ist ein `Leerzustand` — ein Symbol,
 * ein Satz, ein Weg weiter —, und der Weg weiter ist ein `Button`. Bis dahin
 * standen hier ein handgebauter Knopf (`rounded-lg bg-primary px-5 py-2 …`,
 * also eine zweite Antwort auf die Frage, wie ein Knopf aussieht) und die
 * Alias-Farbe `text-text-secondary`, die eine App gar nicht hat. Was diese
 * Datei behält, ist das, was sie wirklich weiß: dass es auf diesem Gerät
 * einen Arbeitsbereich gibt, zu dem man zurückkann.
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
    <div className="flex h-full min-h-[60vh] w-full items-center justify-center bg-background px-6">
      <Leerzustand
        symbol={<Compass />}
        titel={hinweis}
        aktion={
          <Button asChild>
            <Link to={ziel}>{zielText}</Link>
          </Button>
        }
      />
    </div>
  );
}
