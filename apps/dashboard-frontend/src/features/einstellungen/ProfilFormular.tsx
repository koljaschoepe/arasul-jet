/**
 * Das eigene Profil: Vorname, Nachname, Funktion, Kürzel, Bild (M5).
 *
 * Das Bild geht sofort an das Gerät, sobald es gewählt ist (verkleinert, siehe
 * `utils/bildVerkleinern.ts`); die vier Felder gehen mit „Speichern". Danach
 * zieht `benutzerAktualisieren` den Namen im Kontomenü nach, ohne neu zu laden.
 */
import { useRef, useState, type FormEvent } from 'react';
import { Button, Input, Label } from '@marken';
import { PersonAvatar } from '@/components/PersonAvatar';
import { API_BASE } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useApi } from '@/hooks/useApi';
import { bildVerkleinern } from '@/utils/bildVerkleinern';
import { fehlertext } from '@/utils/fehlertext';

interface ProfilAntwort {
  data: {
    vorname: string | null;
    nachname: string | null;
    funktion: string | null;
    kuerzel: string | null;
    hatBild: boolean;
    anzeigeName: string;
  };
}

export function ProfilFormular({ onGespeichert }: { onGespeichert?: () => void }) {
  const { user, benutzerAktualisieren } = useAuth();
  const api = useApi();
  const toast = useToast();
  const datei = useRef<HTMLInputElement>(null);

  const [vorname, setVorname] = useState(user?.vorname ?? '');
  const [nachname, setNachname] = useState(user?.nachname ?? '');
  const [funktion, setFunktion] = useState(user?.funktion ?? '');
  const [kuerzel, setKuerzel] = useState(user?.kuerzel ?? '');
  const [laeuft, setLaeuft] = useState(false);
  // Entwertet den Zwischenspeicher des Browsers, wenn das Bild gewechselt hat.
  const [bildStand, setBildStand] = useState(() => Date.now());

  const name = user?.anzeigeName ?? user?.username ?? '';
  const vollstaendig = vorname.trim().length > 0 && nachname.trim().length > 0;

  const uebernehmen = (antwort: ProfilAntwort) => benutzerAktualisieren(antwort.data);

  const speichern = async (e: FormEvent) => {
    e.preventDefault();
    if (!vollstaendig || laeuft) return;
    setLaeuft(true);
    try {
      const antwort = await api.put<ProfilAntwort>('/profil', {
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        funktion: funktion.trim(),
        kuerzel: kuerzel.trim(),
      });
      uebernehmen(antwort);
      toast.success('Profil gespeichert');
      onGespeichert?.();
    } catch {
      // useApi hat die Meldung schon gezeigt.
    } finally {
      setLaeuft(false);
    }
  };

  const bildWaehlen = async (gewaehlt: File | undefined) => {
    if (!gewaehlt) return;
    try {
      const bild = await bildVerkleinern(gewaehlt);
      uebernehmen(await api.put<ProfilAntwort>('/profil/bild', { bild }));
      setBildStand(Date.now());
    } catch (err) {
      if (err instanceof Error && !('status' in err)) toast.error(fehlertext(err));
    }
  };

  const bildEntfernen = async () => {
    try {
      uebernehmen(await api.del<ProfilAntwort>('/profil/bild'));
    } catch {
      // useApi hat die Meldung schon gezeigt.
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={speichern} data-testid="profil-formular">
      <div className="flex items-center gap-4">
        <PersonAvatar
          name={name}
          bild={user?.hatBild ? `${API_BASE}/profil/bild?v=${bildStand}` : null}
          className="size-16 text-base"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => datei.current?.click()}
            data-testid="profil-bild-waehlen"
          >
            Bild wählen
          </Button>
          {user?.hatBild && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void bildEntfernen()}
              data-testid="profil-bild-entfernen"
            >
              Entfernen
            </Button>
          )}
          <input
            ref={datei}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            data-testid="profil-bild-datei"
            onChange={e => {
              void bildWaehlen(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profil-vorname">Vorname</Label>
          <Input
            id="profil-vorname"
            value={vorname}
            onChange={e => setVorname(e.target.value)}
            autoComplete="given-name"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profil-nachname">Nachname</Label>
          <Input
            id="profil-nachname"
            value={nachname}
            onChange={e => setNachname(e.target.value)}
            autoComplete="family-name"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profil-funktion">Funktion</Label>
          <Input
            id="profil-funktion"
            value={funktion}
            onChange={e => setFunktion(e.target.value)}
            maxLength={100}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profil-kuerzel">Kürzel</Label>
          <Input
            id="profil-kuerzel"
            value={kuerzel}
            onChange={e => setKuerzel(e.target.value)}
            maxLength={8}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={!vollstaendig || laeuft} data-testid="profil-speichern">
          {laeuft ? 'Speichert …' : 'Speichern'}
        </Button>
      </div>
    </form>
  );
}
