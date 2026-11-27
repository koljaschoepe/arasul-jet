import { useCallback, useEffect, useState } from 'react';

/**
 * „Erste Schritte“ der Startseite (J60, Klickentwurf 7): vier Dinge, die man
 * einmal getan haben soll. Sind alle erledigt, verschwindet der Block.
 * Der Stand liegt je Browser im Speicher (eine Bequemlichkeit, kein Zustand
 * des Geräts); `anmelden` hakt das ab, was die Schale selbst merkt.
 */
export const ERSTE_SCHRITTE = [
  { id: 'freigabe', titel: 'Eine Freigabe erteilen' },
  { id: 'rueckmeldung', titel: 'Rückmeldung geben' },
  { id: 'app', titel: 'Eine App öffnen' },
  { id: 'store', titel: 'Den Store ansehen' },
] as const;

export type ErsterSchritt = (typeof ERSTE_SCHRITTE)[number]['id'];

const SCHLUESSEL = 'arasul-erste-schritte';
const EREIGNIS = 'arasul-erste-schritte-geaendert';

function lesen(): Partial<Record<ErsterSchritt, boolean>> {
  try {
    const roh = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}');
    return roh && typeof roh === 'object' ? roh : {};
  } catch {
    return {};
  }
}

/** Einen Schritt als erledigt oder offen setzen, von überall. */
export function ersterSchrittSetzen(id: ErsterSchritt, erledigt = true): void {
  const jetzt = lesen();
  if (!!jetzt[id] === erledigt) return;
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ ...jetzt, [id]: erledigt }));
  } catch {
    /* s. o. */
  }
  window.dispatchEvent(new Event(EREIGNIS));
}

export function useErsteSchritte() {
  const [stand, setStand] = useState(lesen);
  useEffect(() => {
    const neu = () => setStand(lesen());
    window.addEventListener(EREIGNIS, neu);
    return () => window.removeEventListener(EREIGNIS, neu);
  }, []);
  const setze = useCallback(ersterSchrittSetzen, []);
  const anzahl = ERSTE_SCHRITTE.filter(s => stand[s.id]).length;
  return { stand, anzahl, alle: anzahl === ERSTE_SCHRITTE.length, setze };
}
