/**
 * OnboardingWizard — geführter Erst-Start (Plan 015, Phase 7).
 *
 * Erscheint EINMAL (localStorage-Flag), führt knapp durch das Fundament der
 * Dev-Umgebung: Terminal + Coding-Agent, lokal-first als Default, und die
 * einmalige Claude-Anmeldung über den eigenen OAuth-Handshake (ersetzt den
 * kaputten interaktiven Login). Rein informativ — kein Backend-Zustand.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, KeyRound, TerminalSquare, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';

const SEEN_KEY = 'arasul-onboarding-seen-v1';

interface Schritt {
  icon: React.ReactNode;
  titel: string;
  text: React.ReactNode;
}

const SCHRITTE: Schritt[] = [
  {
    icon: <TerminalSquare className="size-6 text-primary" />,
    titel: 'Deine Entwicklungsumgebung',
    text: (
      <>
        Arasul ist das Grundgerüst, auf dem du deinen eigenen digitalen Betrieb baust — interne
        Tools, Dashboards, Automatisierungen. Herzstück ist das <b>Browser-Terminal</b> mit einem
        KI-Coding-Agenten, direkt auf dem Gerät, <b>100 % lokal und DSGVO-konform</b>.
      </>
    ),
  },
  {
    icon: <Wrench className="size-6 text-primary" />,
    titel: 'Lokaler Coder — kein Login nötig',
    text: (
      <>
        Öffne im Terminal <b>„Quick Launch → Lokaler Coder (empfohlen)“</b>. Er läuft vollständig
        lokal ohne externen Account. Braucht Netzmodus <code>internal</code>; ist das Modell nicht
        da, sagt er es dir klar. Claude Code und Codex sind optionale Beschleuniger.
      </>
    ),
  },
  {
    icon: <KeyRound className="size-6 text-primary" />,
    titel: 'Claude einmal anmelden (optional)',
    text: (
      <>
        Willst du Claude Code nutzen? Klick im Terminal-Kopf auf{' '}
        <b>„KI-Zugang“ → „Mit Claude anmelden“</b>: Du bekommst eine <b>kopierbare</b> Login-URL,
        meldest dich einmal an, fügst den Code ein — fertig. Danach ist <code>claude</code> in{' '}
        <b>jeder</b> Sandbox angemeldet, auch nach Neustart. Kein kaputter Login-Link mehr.
      </>
    ),
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

  const schliessen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* localStorage nicht verfügbar → Wizard erscheint ggf. erneut, unkritisch */
    }
    setOffen(false);
  }, []);

  // Escape schließt den Wizard (wie eine Modal-Konvention erwartet).
  useEffect(() => {
    if (!offen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') schliessen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offen, schliessen]);

  if (!offen) return null;

  const letzter = i === SCHRITTE.length - 1;
  const s = SCHRITTE[i]!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Erst-Start schließen"
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={schliessen}
      />
      <div
        className="relative flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Erst-Start"
        data-testid="onboarding-wizard"
      >
        <div className="flex items-center gap-3">
          {s.icon}
          <h2 className="text-base font-semibold text-foreground">{s.titel}</h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{s.text}</p>

        <div className="flex items-center justify-center gap-1.5">
          {SCHRITTE.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? 'w-5 bg-primary' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>

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
