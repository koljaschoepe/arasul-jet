import type { ReactNode } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/shadcn/card';
import { Mascot } from '@/components/mascot/Mascot';
import { PLATFORM_NAME } from '@/config/branding';
import { cn } from '@/lib/utils';

interface AuthCardProps {
  /** Ueberschrift der Seite. */
  title: ReactNode;
  /** Eine Zeile darunter, was diese Seite tut. */
  description?: ReactNode;
  /** Maskottchen ueber der Ueberschrift. */
  mascot?: boolean;
  /** Formular. */
  children: ReactNode;
  /** Fusszeile unter der Trennlinie, etwa Hilfewege. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Rahmen der beiden Seiten vor der Anmeldung: Anmeldung und erstes Konto.
 *
 * Beide standen vorher mit derselben Klassenkette da, einschliesslich einer
 * Ueberschrift mit fuenf Breakpoint-Ausnahmen. Der Rahmen gehoert deshalb an
 * eine Stelle. Das `h1` traegt hier den Produktnamen, nicht einen Seitentitel:
 * diese Seiten liegen ausserhalb der Shell und haben keine Kopfleiste, in die
 * ein `Kopf` passen wuerde.
 *
 * Groessen folgen dem Design-System (Seitentitel `text-2xl`, Knopf `text-sm`),
 * nicht den gewachsenen Sonderwerten der alten Anmeldeseite.
 */
export function AuthCard({
  title,
  description,
  mascot = false,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 max-sm:items-start max-sm:pt-[8vh] max-sm:p-3">
      <Card
        className={cn(
          // gap-0: die Karte aus shadcn setzt zwischen ihren Teilen gap-6. Zusammen
          // mit den Abstaenden hier waeren es 48 Pixel ueber und unter dem Formular.
          // Die Abstaende stehen hier, sichtbar, statt aus zwei Quellen zu addieren.
          'w-full max-w-88 gap-0 rounded-xl border-border bg-card p-8 shadow-lg max-sm:max-w-[95vw] max-sm:p-6',
          className
        )}
      >
        <CardHeader className="mb-6 gap-0 p-0 text-center">
          {mascot && (
            <Mascot
              state="idle"
              label={`${PLATFORM_NAME} Maskottchen`}
              className="mx-auto mb-3 h-12 w-12 drop-shadow-sm"
            />
          )}
          <h1 className="text-2xl font-bold leading-tight text-primary">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </CardHeader>

        <CardContent className="p-0">{children}</CardContent>

        {footer && (
          <CardFooter className="mt-6 flex-col gap-1 border-t border-border p-0 pt-4 text-center">
            {footer}
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

/**
 * Fehlerkasten ueber dem Formular. Die Kennung bleibt beim Aufrufer, damit sie
 * dort steht, wo das Feld sie ueber `aria-describedby` anzieht.
 */
export function AuthError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div
      id={id}
      role="alert"
      className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {children}
    </div>
  );
}

/** Gemeinsame Feldgroesse der beiden Anmeldeseiten: eine Stufe groesser als im
 *  Produkt, auf dem Telefon fingerbreit. Schriftgroesse kommt aus `Input`. */
export const AUTH_FIELD = 'h-10 max-md:h-11';
