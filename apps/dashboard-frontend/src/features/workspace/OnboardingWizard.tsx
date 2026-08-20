/**
 * OnboardingWizard — geführter Erst-Start (Plan 015 Phase 7, überarbeitet in
 * Plan 023 C4).
 *
 * Erscheint EINMAL (localStorage-Flag) und führt knapp durch das Fundament der
 * Entwicklungsumgebung. Rein informativ, kein Backend-Zustand.
 *
 * Was C4 daran geändert hat und warum:
 *
 * 1. Der Fortschritt war ein blauer Punkt zwischen zwei grauen. Er sagte weder,
 *    der wievielte Schritt läuft, noch was danach kommt. Jetzt steht beides als
 *    Text da; die Punkte sind nur noch Bild und deshalb `aria-hidden`.
 * 2. Jeder Schritt nennt sein Ergebnis. Vorher stand dort, was Arasul kann,
 *    nicht, was der Leser danach hat.
 * 3. Die Schritte zitierten Dinge, die nirgends so heissen. `internal` ist der
 *    rohe Aufzählungswert; auf dem Bildschirm steht „Intern (KI-Dienste +
 *    Datenbank)" (`ProjektUebersichtTab.tsx`, `NETZ_LABEL`). Alles, was hier in
 *    Anführungszeichen steht, ist gegen die Oberfläche geprüft.
 * 4. `aria-modal` behauptete einen Fokus, den es nicht gab: der Tabulator lief
 *    aus dem Dialog heraus in den Arbeitsbereich dahinter, und die
 *    Hintergrundfläche war die erste Station im Tabulatorlauf.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, KeyRound, TerminalSquare, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';

const SEEN_KEY = 'arasul-onboarding-seen-v1';

interface Schritt {
  icon: React.ReactNode;
  /** Überschrift des Schritts, zugleich sein Name im Ausblick des vorigen. */
  titel: string;
  text: React.ReactNode;
  /** Was der Leser nach diesem Schritt hat. Nicht, was das Gerät kann. */
  ergebnis: string;
}

const SCHRITTE: Schritt[] = [
  {
    icon: <TerminalSquare className="size-6 text-primary" />,
    titel: 'Deine Entwicklungsumgebung',
    text: (
      <>
        Arasul ist das Grundgerüst, auf dem du deinen eigenen digitalen Betrieb baust, interne
        Tools, Dashboards, Automatisierungen. Herzstück ist das <b>Browser-Terminal</b> mit einem
        KI-Coding-Agenten, direkt auf dem Gerät, <b>100 % lokal und DSGVO-konform</b>.
      </>
    ),
    ergebnis: 'Du weißt, wo gearbeitet wird: im Terminal auf diesem Gerät, nicht in der Cloud.',
  },
  {
    icon: <Wrench className="size-6 text-primary" />,
    titel: 'Ein KI-Coder ohne Konto',
    text: (
      <>
        Im Terminal öffnest du oben <b>„Quick Launch“</b> und wählst{' '}
        <b>„Lokaler Coder (empfohlen)“</b>. Er rechnet auf dem Gerät, ohne Konto und ohne Internet.
        Dafür muss das Terminal im Netzmodus <b>„Intern (KI-Dienste + Datenbank)“</b> laufen; du
        siehst den Modus in der Projekt-Übersicht. Fehlt das Modell, sagt er es dir im Klartext.
      </>
    ),
    ergebnis: 'Ein KI-Coder, der ohne Anmeldung und ohne Internetverbindung arbeitet.',
  },
  {
    icon: <KeyRound className="size-6 text-primary" />,
    titel: 'Claude einmal anmelden (optional)',
    text: (
      <>
        Claude Code und Codex sind zwei fremde Coding-Agenten, die schneller sind als der lokale,
        aber ein Konto brauchen. Für Claude klickst du im Terminal-Kopf auf <b>„KI-Zugang“</b> und
        dann <b>„Mit Claude anmelden“</b>: du bekommst eine <b>kopierbare</b> Adresse, meldest dich
        einmal an und fügst den Code ein.
      </>
    ),
    ergebnis: 'Claude Code ist in jedem Terminal angemeldet, auch nach einem Neustart des Geräts.',
  },
];

export default function OnboardingWizard() {
  const [offen, setOffen] = useState(() => {
    try {
      // Nur zeigen, wenn wir sicher wissen, dass es noch nicht gesehen wurde.
      // Ist localStorage nicht lesbar, lieber NICHT nerven (false).
      return localStorage.getItem(SEEN_KEY) !== '1';
    } catch {
      return false;
    }
  });
  const [i, setI] = useState(0);
  const kennung = useId();
  const titelId = `${kennung}-titel`;
  const dialog = useRef<HTMLDivElement | null>(null);

  const schliessen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* localStorage nicht verfügbar → Wizard erscheint ggf. erneut, unkritisch */
    }
    setOffen(false);
  }, []);

  // Escape schließt, Tabulator bleibt drin. Ohne die zweite Haelfte ist
  // aria-modal eine Behauptung: der Fokus lief in den Arbeitsbereich dahinter,
  // der fuer den Leser gar nicht bedienbar sein soll.
  useEffect(() => {
    if (!offen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        schliessen();
        return;
      }
      if (e.key !== 'Tab' || !dialog.current) return;
      const ziele = dialog.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const erstes = ziele[0];
      const letztes = ziele[ziele.length - 1];
      if (!erstes || !letztes) return;
      if (e.shiftKey && document.activeElement === erstes) {
        e.preventDefault();
        letztes.focus();
      } else if (!e.shiftKey && document.activeElement === letztes) {
        e.preventDefault();
        erstes.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offen, schliessen]);

  // Der Fokus landet auf dem Dialog, nicht irgendwo dahinter.
  useEffect(() => {
    if (offen) dialog.current?.focus();
  }, [offen]);

  if (!offen) return null;

  const letzter = i === SCHRITTE.length - 1;
  const s = SCHRITTE[i]!;
  const naechster = SCHRITTE[i + 1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* tabIndex -1: anklickbar, aber nicht die erste Station im Tabulatorlauf.
          Der Tastaturweg hinaus ist Escape und der Knopf „Überspringen“. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={schliessen}
      />
      <div
        ref={dialog}
        tabIndex={-1}
        className="relative flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-xl outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        data-testid="onboarding-wizard"
      >
        {/* Der Fortschritt als Text. Die Punkte daneben sagen dasselbe noch
            einmal als Bild und sind deshalb fuer Vorlesegeraete unsichtbar. */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Schritt {i + 1} von {SCHRITTE.length}
          </span>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {SCHRITTE.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === i ? 'w-5 bg-primary' : 'w-1.5 bg-border'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {s.icon}
          <h2 id={titelId} className="text-base font-semibold text-foreground">
            {s.titel}
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{s.text}</p>

        <p className="border-l-2 border-primary/30 pl-3 text-sm text-foreground">
          <span className="font-semibold">Danach: </span>
          {s.ergebnis}
        </p>

        <p className="text-xs text-muted-foreground">
          {naechster ? `Als Nächstes: ${naechster.titel}` : 'Das war der letzte Schritt.'}
        </p>

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={schliessen}>
            Überspringen
          </Button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setI(i - 1)}>
                <ArrowLeft className="size-3.5" /> Zurück
              </Button>
            )}
            {letzter ? (
              <Button type="button" size="sm" onClick={schliessen}>
                <Check className="size-3.5" /> Los geht’s
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => setI(i + 1)}>
                Weiter <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
