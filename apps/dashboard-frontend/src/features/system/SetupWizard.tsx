/**
 * SetupWizard, die Ersteinrichtung eines ausgelieferten Geraets.
 *
 * Erscheint einmal, direkt nach `CreateAdmin`, und fragt genau das, was sonst
 * niemand fragt: fuer wen die KI schreibt, und mit welchem Modell sie anfaengt.
 *
 * Vorher waren es sechs Schritte und 1296 Zeilen. Am 20.08.2026 wurde der
 * Assistent zum ersten Mal am Pruefstand durchgelaufen, nach einem Werksreset
 * auf Auslieferungszustand. Was dabei herauskam:
 *
 * - **Schritt 3 war eine Sackgasse.** Der Kunde legt sein Passwort in
 *   `CreateAdmin` selbst an, zwei Bildschirme spaeter verlangte der Assistent,
 *   dasselbe Passwort zu aendern, "Dies ist ein Pflichtschritt", und `Weiter`
 *   blieb gesperrt. Der Text sprach vom "Standard-Passwort", das es seit dem
 *   Werksreset nicht mehr gibt. Einziger Ausweg war `Ueberspringen`, und das
 *   ueberspringt den ganzen Assistenten samt Modellwahl.
 * - **Der Fortschritt wurde nie gespeichert.** `PUT /system/setup-step`
 *   antwortete 400: die Oberflaeche zaehlt 1 bis 6, der Vertrag laesst 0 bis 5.
 *   Der Fehlschlag wurde verschluckt ("Non-critical, silently ignore").
 * - **Die Zusammenfassung zeigte eine falsche Adresse.** "IP-Adresse
 *   172.31.0.69" ist die Adresse des Containers. `/system/network` liest
 *   `os.networkInterfaces()` im Container und sieht das Netz des Kunden nie.
 *   Auch am Arbeitsgeraet gegengeprueft: dort stehen 172.30.x.x, waehrend das
 *   Geraet unter 192.168.0.197 erreichbar ist. Ein Zahlenwert, den niemand
 *   anwaehlen kann, ist schlimmer als keiner.
 * - **Die Zusammenfassung wiederholte nur die Schritte davor.** Kolja am
 *   20.08.2026: kein Schritt, der nur bestaetigt, was der vorige getan hat.
 *
 * Geblieben sind zwei Schritte. Der Rahmen ist `AuthCard`, derselbe wie in
 * `CreateAdmin` und `Login`: die drei Bildschirme gehoeren zusammen und sollen
 * auch so aussehen. Damit faellt die handgebaute Kopfzeile weg und mit ihr der
 * Eintrag dieser Datei in `scripts/test/bausteine.py`.
 */

import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  Code,
  Coffee,
  Download,
  FileText,
  Heart,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Pencil,
  Settings,
  ShoppingCart,
  User,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { useDownloads } from '../../contexts/DownloadContext';
import { useApi } from '../../hooks/useApi';
import { AuthCard, AuthError } from '@/components/ui/AuthCard';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { cn } from '@/lib/utils';
import { PLATFORM_NAME } from '@/config/branding';

interface SetupWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface Auswahl {
  wert: string;
  label: string;
  zusatz?: string;
  icon: LucideIcon;
}

interface KatalogModell {
  id: string;
  name: string;
  description?: string;
  size_bytes?: number;
  ram_required_gb?: number;
  model_type?: string;
  install_status?: string;
}

const LETZTER_SCHRITT = 2;

const BRANCHEN: Auswahl[] = [
  { wert: 'IT & Software', label: 'IT und Software', icon: Code },
  { wert: 'Handel & E-Commerce', label: 'Handel', icon: ShoppingCart },
  { wert: 'Produktion & Fertigung', label: 'Produktion', icon: Settings },
  { wert: 'Beratung & Dienstleistungen', label: 'Beratung', icon: Briefcase },
  { wert: 'Gesundheit & Medizin', label: 'Gesundheit', icon: Heart },
  { wert: 'custom', label: 'Andere', icon: Pencil },
];

const TEAMGROESSEN: Auswahl[] = [
  { wert: '5', label: '1 bis 5', icon: User },
  { wert: '20', label: '6 bis 20', icon: Users },
  { wert: '100', label: '21 bis 100', icon: LayoutGrid },
  { wert: '100+', label: 'über 100', icon: Briefcase },
];

const ANTWORTSTILE: Auswahl[] = [
  { wert: 'kurz', label: 'Kurz', zusatz: 'direkt zum Punkt', icon: Zap },
  { wert: 'ausfuehrlich', label: 'Ausführlich', zusatz: 'mit Erklärung', icon: FileText },
  { wert: 'formell', label: 'Formell', zusatz: 'geschäftlicher Ton', icon: MessageCircle },
  { wert: 'locker', label: 'Locker', zusatz: 'wie ein Kollege', icon: Coffee },
];

const EMPFEHLUNG_FALLBACK = 'gemma4:e4b-q4';

/**
 * Was hier NICHT zur Wahl steht.
 *
 * Bis zum 20.08.2026 lief der Filter andersherum: `model_type === 'llm'`, alles
 * andere weg. Am Geraet gemessen ist das falsch. `GET /models/recommended`
 * empfiehlt dort `gemma4:26b-q4`, und dieses Modell traegt im Katalog den Typ
 * `vision`, weil Gemma 4 Bilder lesen kann. Es fiel also aus genau der Liste
 * heraus, in der es haette stehen sollen. Die Folge war nicht bloss ein
 * fehlender Eintrag: `handleComplete` suchte das gewaehlte Modell in derselben
 * Liste, fand es nicht und startete keinen Download. Auf dem
 * Zusammenfassungs-Bildschirm stand deshalb die rohe Kennung `gemma4:26b-q4`
 * statt eines Namens, das war das sichtbare Zeichen dafuer.
 *
 * Ein Modell, das Bilder lesen kann, ist ein Chatmodell mit einer Faehigkeit
 * mehr. Ausgeschlossen gehoeren nur die, die im Chat gar nicht antworten:
 * Einbettungsmodelle und Texterkennung.
 */
const NICHT_WAEHLBAR = new Set(['embedding', 'ocr']);

function groesse(bytes: number | null | undefined): string {
  if (!bytes) return '';
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(gb * 1024).toFixed(0)} MB`;
}

/**
 * Eine Kachel, dreimal benutzt: Branche, Teamgroesse, Antwortstil. Vorher stand
 * dieselbe Klassenkette dreimal untereinander in dieser Datei, jedes Mal ein
 * bisschen anders. Ein Baustein, drei Aufrufer.
 */
function Kachel({
  eintrag,
  gewaehlt,
  onClick,
}: {
  eintrag: Auswahl;
  gewaehlt: boolean;
  onClick: () => void;
}) {
  const Symbol = eintrag.icon;
  return (
    <button
      type="button"
      aria-pressed={gewaehlt}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 rounded-md border-2 border-border bg-background px-2 py-3 text-center text-muted-foreground transition-colors',
        'hover:border-primary/30 hover:text-foreground',
        gewaehlt && 'border-primary bg-primary/10 text-primary'
      )}
    >
      <Symbol className="size-5 shrink-0" aria-hidden="true" />
      <span className="text-xs font-semibold leading-tight">{eintrag.label}</span>
      {eintrag.zusatz && <span className="text-[0.7rem] leading-tight">{eintrag.zusatz}</span>}
    </button>
  );
}

function Feldgruppe({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {titel}
      </h3>
      {children}
    </div>
  );
}

function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
  const api = useApi();
  const { startDownload } = useDownloads();

  const [schritt, setSchritt] = useState(1);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [hinweis, setHinweis] = useState('');

  const [firma, setFirma] = useState('');
  const [branche, setBranche] = useState('');
  const [eigeneBranche, setEigeneBranche] = useState('');
  const [teamgroesse, setTeamgroesse] = useState('');
  const [antwortstil, setAntwortstil] = useState('');

  const [modelle, setModelle] = useState<KatalogModell[]>([]);
  const [modellWahl, setModellWahl] = useState('');
  const [empfehlung, setEmpfehlung] = useState(EMPFEHLUNG_FALLBACK);
  const [modelleLaden, setModelleLaden] = useState(false);
  const [alleZeigen, setAlleZeigen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);

  // Der Fortschritt wird mitgeschrieben, damit ein geschlossener Browser die
  // Einrichtung nicht von vorn anfangen laesst. Ein Fehlschlag ist kein Grund,
  // den Kunden aufzuhalten, aber er wird gesagt: bis zum 20.08.2026 antwortete
  // dieser Aufruf 400 und niemand hat es gemerkt.
  const fortschrittMerken = useCallback(
    async (naechster: number) => {
      try {
        await api.put(
          '/system/setup-step',
          {
            step: naechster,
            companyName: firma || undefined,
            selectedModel: modellWahl || undefined,
          },
          { showError: false }
        );
      } catch {
        setHinweis(
          'Der Fortschritt lässt sich gerade nicht speichern. Wenn du das Fenster schließt, fängt die Einrichtung von vorn an.'
        );
      }
    },
    [api, firma, modellWahl]
  );

  const profilSpeichern = useCallback(async () => {
    const gewaehlteBranche = branche === 'custom' ? eigeneBranche.trim() : branche;
    await api.post(
      '/memory/profile',
      {
        companyName: firma.trim() || 'Mein Unternehmen',
        industry: gewaehlteBranche,
        teamSize: teamgroesse,
        products: [],
        preferences: {
          antwortlaenge: antwortstil || 'mittel',
          formalitaet: antwortstil === 'formell' ? 'formell' : 'locker',
        },
      },
      { showError: false }
    );
  }, [api, branche, eigeneBranche, firma, teamgroesse, antwortstil]);

  // Netz und Katalog gehoeren zu Schritt 2 und werden erst dort geholt.
  useEffect(() => {
    if (schritt !== LETZTER_SCHRITT) return;
    let abgebrochen = false;

    api
      .get<{ internet_reachable?: boolean }>('/system/network', { showError: false })
      .then(daten => {
        if (!abgebrochen) setOnline(Boolean(daten?.internet_reachable));
      })
      .catch(() => {
        if (!abgebrochen) setOnline(null);
      });

    setModelleLaden(true);
    Promise.all([
      api.get<{ models?: KatalogModell[] }>('/models/catalog', { showError: false }),
      api
        .get<{ recommended_model?: string }>('/models/recommended', { showError: false })
        .catch(() => null),
    ])
      .then(([katalog, rat]) => {
        if (abgebrochen) return;
        const waehlbar = (katalog.models || []).filter(
          m => !NICHT_WAEHLBAR.has(m.model_type || 'llm')
        );
        setModelle(waehlbar);
        const empfohlen = rat?.recommended_model || EMPFEHLUNG_FALLBACK;
        setEmpfehlung(empfohlen);
        // Steht die Empfehlung nicht im Katalog, zeigt eine Auswahl auf sie
        // ins Leere. Am 20.08.2026 live gesehen: Schritt 2 zeigte gar kein
        // Modell, weil die Auswahl auf einer Kennung stand, die die Liste
        // nicht enthielt.
        const vorhanden = (kennung: string) => waehlbar.some(m => m.id === kennung);
        setModellWahl(vorher => {
          if (vorher && vorhanden(vorher)) return vorher;
          if (vorhanden(empfohlen)) return empfohlen;
          return waehlbar[0]?.id ?? '';
        });
      })
      .catch(() => {
        if (!abgebrochen) setModelle([]);
      })
      .finally(() => {
        if (!abgebrochen) setModelleLaden(false);
      });

    return () => {
      abgebrochen = true;
    };
  }, [schritt, api]);

  const weiter = async () => {
    setFehler('');
    setLaeuft(true);
    try {
      await profilSpeichern();
      setSchritt(LETZTER_SCHRITT);
      await fortschrittMerken(LETZTER_SCHRITT);
    } catch (err: unknown) {
      // Kein stiller Fehlschlag mehr: wer hier nichts sagt, laesst den Kunden
      // glauben, sein Profil sei gespeichert.
      const e = err as { message?: string };
      setFehler(
        `Dein Profil konnte nicht gespeichert werden: ${e.message || String(err)}. Versuch es noch einmal oder überspring die Einrichtung.`
      );
    } finally {
      setLaeuft(false);
    }
  };

  const abschliessen = async () => {
    setFehler('');
    setLaeuft(true);
    try {
      const modell = modelle.find(m => m.id === modellWahl);
      if (modell && modell.install_status !== 'available') {
        startDownload(modell.id, modell.name);
      }
      if (modell?.install_status === 'available') {
        await api.post('/models/default', { model_id: modellWahl }, { showError: false });
      }
      await api.post(
        '/system/setup-complete',
        {
          companyName: firma.trim() || undefined,
          selectedModel: modellWahl || undefined,
        },
        { showError: false }
      );
      onComplete();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setFehler(`Die Einrichtung konnte nicht abgeschlossen werden: ${e.message || String(err)}`);
    } finally {
      setLaeuft(false);
    }
  };

  const ueberspringen = async () => {
    setFehler('');
    setLaeuft(true);
    try {
      await api.post('/system/setup-skip', {}, { showError: false });
      onSkip();
    } catch (err: unknown) {
      // Vorher rief das `onSkip()` auch dann, wenn der Aufruf scheiterte. Der
      // Assistent stand beim naechsten Start wieder da, ohne dass jemand wusste
      // warum.
      const e = err as { message?: string };
      setFehler(`Überspringen hat nicht geklappt: ${e.message || String(err)}`);
    } finally {
      setLaeuft(false);
    }
  };

  const sichtbareModelle = alleZeigen ? modelle : modelle.filter(m => m.id === modellWahl);

  return (
    <AuthCard
      title={`Willkommen bei ${PLATFORM_NAME}`}
      description="Zwei Schritte, dann kannst du loslegen."
      className="max-w-2xl"
    >
      <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Schritt {schritt} von {LETZTER_SCHRITT}
      </p>

      {fehler && <AuthError id="setup-fehler">{fehler}</AuthError>}

      {schritt === 1 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-foreground">Dein Unternehmen</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Damit die KI weiß, für wen sie schreibt. Änderbar unter Einstellungen, KI.
          </p>

          <Feldgruppe titel="Firma">
            <Input
              id="firma"
              type="text"
              value={firma}
              onChange={e => setFirma(e.target.value)}
              placeholder="Name deiner Firma"
            />
          </Feldgruppe>

          <Feldgruppe titel="Branche">
            <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-2">
              {BRANCHEN.map(eintrag => (
                <Kachel
                  key={eintrag.wert}
                  eintrag={eintrag}
                  gewaehlt={branche === eintrag.wert}
                  onClick={() => {
                    setBranche(eintrag.wert);
                    if (eintrag.wert !== 'custom') setEigeneBranche('');
                  }}
                />
              ))}
            </div>
            {branche === 'custom' && (
              <Input
                type="text"
                value={eigeneBranche}
                onChange={e => setEigeneBranche(e.target.value)}
                placeholder="Welche Branche?"
                className="mt-2"
              />
            )}
          </Feldgruppe>

          <Feldgruppe titel="Teamgröße">
            <div className="grid grid-cols-4 gap-2 max-sm:grid-cols-2">
              {TEAMGROESSEN.map(eintrag => (
                <Kachel
                  key={eintrag.wert}
                  eintrag={eintrag}
                  gewaehlt={teamgroesse === eintrag.wert}
                  onClick={() => setTeamgroesse(eintrag.wert)}
                />
              ))}
            </div>
          </Feldgruppe>

          <Feldgruppe titel="Antwortstil">
            <div className="grid grid-cols-4 gap-2 max-sm:grid-cols-2">
              {ANTWORTSTILE.map(eintrag => (
                <Kachel
                  key={eintrag.wert}
                  eintrag={eintrag}
                  gewaehlt={antwortstil === eintrag.wert}
                  onClick={() => setAntwortstil(eintrag.wert)}
                />
              ))}
            </div>
          </Feldgruppe>
        </div>
      )}

      {schritt === LETZTER_SCHRITT && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-foreground">Dein erstes Modell</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Es lädt im Hintergrund. Weitere findest du später im Store.
          </p>

          {online !== null && (
            <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              {online ? (
                <Wifi className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <WifiOff className="size-4 shrink-0" aria-hidden="true" />
              )}
              {online
                ? 'Internet verbunden, das Modell lädt gleich los.'
                : 'Kein Internet. Das Modell lässt sich später per USB einspielen.'}
            </p>
          )}

          {modelleLaden ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Katalog wird geladen.
            </p>
          ) : modelle.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Der Katalog ist gerade nicht erreichbar. Du kannst ein Modell später im Store holen.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {sichtbareModelle.map(modell => {
                  const gewaehlt = modellWahl === modell.id;
                  return (
                    <li key={modell.id}>
                      <button
                        type="button"
                        aria-pressed={gewaehlt}
                        onClick={() => setModellWahl(modell.id)}
                        className={cn(
                          'w-full rounded-md border-2 border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/30',
                          gewaehlt && 'border-primary bg-primary/5'
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-foreground">{modell.name}</span>
                          {modell.id === empfehlung && (
                            <span className="shrink-0 text-[0.65rem] font-bold uppercase tracking-wide text-primary">
                              Empfohlen
                            </span>
                          )}
                        </span>
                        {modell.description && (
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            {modell.description}
                          </span>
                        )}
                        <span className="mt-1 flex gap-3 text-[0.75rem] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Download className="size-3" aria-hidden="true" />
                            {groesse(modell.size_bytes)}
                          </span>
                          {modell.ram_required_gb ? (
                            <span>{modell.ram_required_gb} GB Arbeitsspeicher</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {modelle.length > 1 && (
                <Button
                  variant="ghost"
                  className="mt-2 px-0 text-xs"
                  onClick={() => setAlleZeigen(offen => !offen)}
                >
                  {alleZeigen
                    ? 'Nur das gewählte zeigen'
                    : `Anderes Modell wählen (${modelle.length - sichtbareModelle.length} weitere)`}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {hinweis && <p className="mt-4 text-xs text-muted-foreground">{hinweis}</p>}

      <div className="mt-6 flex items-center justify-between gap-2 border-t border-border pt-4">
        <div>
          {schritt > 1 && (
            <Button variant="ghost" onClick={() => setSchritt(1)} disabled={laeuft}>
              <ChevronLeft className="size-4" aria-hidden="true" /> Zurück
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={ueberspringen} disabled={laeuft} className="text-xs">
            Überspringen
          </Button>
          {schritt < LETZTER_SCHRITT ? (
            <Button variant="solid" onClick={weiter} disabled={laeuft}>
              {laeuft ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  Weiter <ChevronRight className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          ) : (
            <Button variant="solid" onClick={abschliessen} disabled={laeuft}>
              {laeuft ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <Check className="size-4" aria-hidden="true" /> Fertig
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </AuthCard>
  );
}

export default SetupWizard;
