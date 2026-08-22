/**
 * Läuft die Sitzung, in der ich gerade sitze, über den Fernzugriff?
 * (Plan 023 J5)
 *
 * Der Knopf „Trennen" kappt Tailscale. Sitzt der Nutzer gerade über Tailscale
 * auf dem Gerät, kappt er damit die Leitung unter sich selbst weg: die Seite
 * ist danach nicht mehr erreichbar, und wieder heran kommt er nur noch im
 * lokalen Netz. Das darf man tun, aber man muss es wissen.
 *
 * Entschieden wird an der Adresse, die im Browser steht — die einzige Angabe,
 * die wirklich sagt, worüber diese Sitzung läuft. Der Server weiß es nicht
 * besser: hinter Traefik sieht er nur die interne Adresse.
 */

/** Woran ein Tailnet-Name zu erkennen ist, unabhängig vom eigenen Tailnet. */
const TAILNET_ENDUNG = '.ts.net';

export interface FernzugriffAdresse {
  /** Der MagicDNS-Name, etwa `arasul.tailnetname.ts.net`. */
  dnsName?: string | null;
  /** Die Tailscale-IP, etwa `100.64.1.2`. */
  ip?: string | null;
}

/**
 * @param aktuellerHost `window.location.hostname`
 * @param status Was der Fernzugriff über sich selbst weiß
 * @returns true, wenn diese Sitzung über den Fernzugriff läuft
 */
export function sitzungLaeuftUeberFernzugriff(
  aktuellerHost: string,
  status: FernzugriffAdresse | null | undefined
): boolean {
  const host = String(aktuellerHost || '')
    .trim()
    .toLowerCase()
    // Eine IPv6-Adresse steht in der URL in eckigen Klammern.
    .replace(/^\[|\]$/g, '');
  if (!host) {
    return false;
  }

  // Jeder Name im Tailnet zählt, auch ein anderer als der gemeldete: der
  // Nutzer kann über einen Alias oder ein zweites Gerät hereinkommen.
  if (host.endsWith(TAILNET_ENDUNG)) {
    return true;
  }

  const dns = String(status?.dnsName || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (dns && (host === dns || host === dns.split('.')[0])) {
    return true;
  }

  const ip = String(status?.ip || '').trim();
  if (ip && host === ip) {
    return true;
  }

  // 100.64.0.0/10 ist der Bereich, aus dem Tailscale seine Adressen vergibt.
  // Auch ohne gemeldete IP ist eine Adresse daraus ein Fernzugriff.
  const teile = host.split('.');
  if (teile.length === 4 && teile.every(t => /^\d{1,3}$/.test(t))) {
    const [a, b] = teile.map(Number);
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) {
      return true;
    }
  }

  return false;
}

/** Der Satz, der vor dem Trennen erscheint. */
export function trennFrage(ueberFernzugriff: boolean): {
  title: string;
  message: string;
  confirmText: string;
} {
  if (ueberFernzugriff) {
    return {
      title: 'Fernzugriff trennen und diese Sitzung verlieren?',
      message:
        'Du bist gerade ÜBER diese Verbindung angemeldet. Nach dem Trennen ist ' +
        'diese Seite nicht mehr erreichbar, und du kommst nur noch im lokalen ' +
        'Netz an das Gerät. Wieder verbinden geht dann nur dort.',
      confirmText: 'Trotzdem trennen',
    };
  }
  return {
    title: 'Fernzugriff trennen?',
    message:
      'Das Gerät ist danach von außen nicht mehr erreichbar. Im lokalen Netz ' +
      'bleibt alles wie es ist, und neu verbinden geht jederzeit.',
    confirmText: 'Trennen',
  };
}
