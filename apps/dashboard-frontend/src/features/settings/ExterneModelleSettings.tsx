import { useCallback, useEffect, useState } from 'react';
import { Cloud, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Button } from '@/components/ui/shadcn/button';
import { Switch } from '@/components/ui/shadcn/switch';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section, SectionList } from '@/components/ui/Section';

/**
 * Externe Cloud-Modelle (Plan 023 D9).
 *
 * Hier wird die eine Ausnahme vom Versprechen „läuft vollständig lokal"
 * verwaltet. Deshalb steht der Hinweis darauf ganz oben und nicht im
 * Kleingedruckten: wer hier einen Schlüssel hinterlegt und einschaltet,
 * schickt ab dann Text an einen fremden Anbieter, und das soll er beim
 * Einschalten lesen, nicht später im Prüfprotokoll entdecken.
 *
 * Der Schlüssel geht nur in eine Richtung. Es gibt keinen Endpunkt, der ihn
 * zurückgibt; angezeigt werden die letzten vier Zeichen, damit man erkennt,
 * WELCHER hinterlegt ist.
 */

interface AnbieterStand {
  anbieter: string;
  name: string;
  schluessel_hinweis: string;
  schluessel_hinterlegt: boolean;
  schluessel_endet_auf: string | null;
  aktiv: boolean;
  zuletzt_geprueft_am: string | null;
  letzter_fehler: string | null;
}

interface StandAntwort {
  data: AnbieterStand[];
}

interface PruefAntwort {
  data: { anzahl: number };
}

export function ExterneModelleSettings() {
  const api = useApi();
  const toast = useToast();
  const [anbieter, setAnbieter] = useState<AnbieterStand[] | null>(null);
  const [eingaben, setEingaben] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      const antwort = await api.get<StandAntwort>('/modelle-extern');
      setAnbieter(antwort.data);
    } catch {
      // useApi zeigt den Fehler bereits als Meldung. Ohne Liste bleibt die
      // Seite leer, statt mit einem halben Zustand weiterzumachen.
      setAnbieter([]);
    }
  }, [api]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const schluesselSpeichern = async (name: string) => {
    const schluessel = (eingaben[name] || '').trim();
    if (!schluessel) {
      return;
    }
    setLaeuft(name);
    try {
      await api.put(`/modelle-extern/${name}`, { schluessel });
      setEingaben(vorher => ({ ...vorher, [name]: '' }));
      toast.success('Schlüssel hinterlegt. Jetzt prüfen und dann einschalten.');
      await laden();
    } finally {
      setLaeuft(null);
    }
  };

  const pruefen = async (name: string) => {
    setLaeuft(name);
    try {
      const antwort = await api.post<PruefAntwort>(`/modelle-extern/${name}/pruefen`);
      toast.success(`Schlüssel gültig, ${antwort.data.anzahl} Modelle verfügbar.`);
      await laden();
    } catch {
      await laden();
    } finally {
      setLaeuft(null);
    }
  };

  const schalten = async (name: string, aktiv: boolean) => {
    setLaeuft(name);
    try {
      await api.post(`/modelle-extern/${name}/schalten`, { aktiv });
      await laden();
    } finally {
      setLaeuft(null);
    }
  };

  const entfernen = async (name: string) => {
    setLaeuft(name);
    try {
      await api.del(`/modelle-extern/${name}`);
      toast.success('Schlüssel entfernt.');
      await laden();
    } finally {
      setLaeuft(null);
    }
  };

  if (anbieter === null) {
    return <SkeletonCard />;
  }

  return (
    <div>
      <PageHeader
        title="Externe Modelle"
        description="Ein Cloud-Modell dazuschalten, um damit Anwendungen zu bauen, die danach lokal laufen."
      />

      <Alert className="mb-6">
        <AlertCircle className="size-4" aria-hidden="true" />
        <AlertDescription>
          Alles andere an diesem Gerät läuft lokal. Ein eingeschalteter Anbieter ist die Ausnahme:
          Fragen, Dateiinhalte und Antworten gehen dann an dessen Server. Jede solche Anfrage steht
          im Prüfprotokoll. Ab Werk ist nichts eingeschaltet.
        </AlertDescription>
      </Alert>

      <SectionList>
        {anbieter.map(a => (
          <Section
            key={a.anbieter}
            title={a.name}
            icon={<Cloud />}
            description={
              a.schluessel_hinterlegt
                ? `Schlüssel hinterlegt, endet auf ${a.schluessel_endet_auf}.`
                : `Kein Schlüssel hinterlegt. Der Schlüssel ${a.schluessel_hinweis}.`
            }
            action={
              a.schluessel_hinterlegt ? (
                <div className="flex items-center gap-3">
                  <Label htmlFor={`schalter-${a.anbieter}`} className="text-sm">
                    {a.aktiv ? 'Eingeschaltet' : 'Aus'}
                  </Label>
                  <Switch
                    id={`schalter-${a.anbieter}`}
                    checked={a.aktiv}
                    disabled={laeuft === a.anbieter}
                    onCheckedChange={wert => void schalten(a.anbieter, wert)}
                  />
                </div>
              ) : undefined
            }
          >
            <div className="space-y-4 pt-4">
              {a.letzter_fehler && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  <AlertDescription>{a.letzter_fehler}</AlertDescription>
                </Alert>
              )}
              {!a.letzter_fehler && a.zuletzt_geprueft_am && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Zuletzt erfolgreich geprüft am{' '}
                  {new Date(a.zuletzt_geprueft_am).toLocaleString('de-DE')}
                </p>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1">
                  <Label htmlFor={`schluessel-${a.anbieter}`}>
                    {a.schluessel_hinterlegt ? 'Schlüssel ersetzen' : 'Schlüssel hinterlegen'}
                  </Label>
                  <Input
                    id={`schluessel-${a.anbieter}`}
                    type="password"
                    autoComplete="off"
                    placeholder={a.schluessel_hinweis}
                    value={eingaben[a.anbieter] || ''}
                    onChange={e =>
                      setEingaben(vorher => ({ ...vorher, [a.anbieter]: e.target.value }))
                    }
                  />
                </div>
                <Button
                  onClick={() => void schluesselSpeichern(a.anbieter)}
                  disabled={laeuft === a.anbieter || !(eingaben[a.anbieter] || '').trim()}
                >
                  Speichern
                </Button>
                {a.schluessel_hinterlegt && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void pruefen(a.anbieter)}
                      disabled={laeuft === a.anbieter}
                    >
                      Prüfen
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void entfernen(a.anbieter)}
                      disabled={laeuft === a.anbieter}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Entfernen
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Section>
        ))}
      </SectionList>
    </div>
  );
}
