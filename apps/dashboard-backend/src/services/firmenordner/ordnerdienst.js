/**
 * Der Dateidienst des Firmenordners, von aussen gesehen (J33, 22.09.2026).
 *
 * DIESE DATEI IST DIE EINZIGE, DIE OPENCLOUD KENNT. Alles darueber
 * (`ordnerVerwaltung.js`, die Routen) spricht in den Begriffen des Geraets --
 * Ordner, Ebene, Recht, Mensch -- und weiss nicht, dass es Raeume, Laufwerke
 * und Einladungen gibt. Das ist kein Schoenheitsgedanke, sondern die
 * Bedingung aus dem Zielbild: „So bleibt der Dienst austauschbar." Wer ihn
 * eines Tages tauscht, tauscht diese Datei.
 *
 * WARUM ES DIESEN WEG UEBERHAUPT GIBT. Am 21.09.2026 am Orin gemessen: der
 * Dienst ignoriert die Kopfzeile `X-Arasul-User` der Forward-Auth und
 * antwortet 401. Er hat seine eigene Anmeldung, und ein fremder
 * OIDC-Anbieter -- was Arasul nicht ist und ohne ein eigenes Vorhaben nicht
 * wird -- ist der einzige Weg, ihm einen Menschen von aussen zu nennen.
 * Bleibt: Arasul legt den Menschen im Dienst an und setzt dort dasselbe
 * Passwort. Das ist EINE ZWEITE PASSWORTABLAGE, sie steht in
 * `docs/features/FIRMENORDNER.md` mit Namen, und sie ist einseitig: das
 * Geraet schreibt, der Dienst antwortet.
 *
 * DAS KLARTEXTPASSWORT KOMMT HIER NUR DURCH, ES BLEIBT NICHT. Das Geraet
 * kennt es in genau den zwei Augenblicken, in denen es gesetzt wird (der
 * Administrator vergibt ein Startpasswort, der Mensch wechselt es) -- also
 * kostet die Spiegelung eine Anfrage mehr und keinen neuen Ort, an dem ein
 * Geheimnis liegt. In `firmenordner_nutzer` steht kein Passwort.
 *
 * DER DIENST DARF AUSFALLEN, DIE PLATTFORM NICHT. Jede Funktion hier wirft
 * bei einem Fehler des Dienstes -- aber der Aufrufer
 * (`ordnerVerwaltung.spiegle*`) faengt und vermerkt. Ein Mitarbeiter wird
 * angelegt, auch wenn der Firmenordner gerade neu startet oder gar nicht
 * laeuft; was fehlt, steht in `abgleich_offen` und wird nachgeholt.
 */

const logger = require('../../utils/logger');

/** Wie lange eine Anfrage an den Dienst hoechstens dauern darf. */
const ZEITGRENZE_MS = Number(process.env.FIRMENORDNER_ZEITGRENZE_MS || 10000);

/**
 * WEGWERFEN IST KEINE ANFRAGE WIE DIE ANDEREN, und deshalb hat es eine eigene
 * Zahl.
 *
 * Jeder andere Aufruf hier fragt oder traegt etwas ein -- ein Nutzer, eine
 * Einladung, ein Ordner --, und zehn Sekunden sind dafuer reichlich. Das
 * Wegwerfen eines Raums loescht dagegen jede Datei darin, und seine Dauer
 * haengt an ihrer Zahl: am 22.09.2026 am Orin gemessen (Nebeninstanz, 6.000
 * Dateien in zwanzig Ordnern) brauchte der Purge **11,4 s** -- also knapp
 * ueber der alten Grenze, und ein Arbeitsbaum ist schnell doppelt so gross.
 *
 * DAS WAR DER FEHLER VOM 22.09.2026, und er sah nicht nach einer Zeitgrenze
 * aus: das Backend schnitt nach zehn Sekunden ab, der Dienst raeumte
 * weiter zu Ende, und was hinterher dastand, war ein Raum ohne Dateien, eine
 * Zeile am Geraet, die ihn weiter fuehrte, und ein `500 grpc error` auf jeden
 * zweiten Versuch. Nachgestellt, beide Richtungen.
 *
 * 15 MINUTEN, UND NICHT „SO LANGE ES DAUERT". Bei gemessenen ~1,9 ms je Datei
 * reicht das fuer ein paar hunderttausend; was darueber hinausgeht, ist kein
 * Ordner mehr, den jemand aus Versehen wegwirft, und soll anschlagen. Die
 * Route setzt dieselbe Zahl noch einmal auf ihre Antwort (`res.setTimeout`) --
 * sonst schnitte das Sicherheitsnetz aus `index.js` nach 60 s ab, und die
 * Grenze hier waere eine Behauptung.
 */
const ZEITGRENZE_LOESCHEN_MS = Number(
  process.env.FIRMENORDNER_ZEITGRENZE_LOESCHEN_MS || 15 * 60 * 1000
);

/** Wo der Dienst im Docker-Netz liegt. */
function basisIntern() {
  const wert = (process.env.FIRMENORDNER_INTERN || '').trim();
  return wert ? wert.replace(/\/+$/, '') : null;
}

/**
 * Die Adresse, die ein MENSCH und sein Klient benutzen -- die, die im
 * Zertifikat steht und durch Traefik geht. Sie ist etwas anderes als
 * `basisIntern()`: das Backend spricht den Container direkt an, ein Klient
 * am Mac kommt von aussen.
 */
function basisAussen() {
  const wert = (process.env.FIRMENORDNER_ADRESSE || '').trim();
  return wert ? wert.replace(/\/+$/, '') : null;
}

/**
 * Gibt es auf diesem Geraet einen Firmenordner?
 *
 * EINE FRAGE AN EINEN SCHALTER, NICHT AN ZWEI. Der Dienst faehrt hoch, wenn
 * `COMPOSE_PROFILES` ihn nennt -- also ist genau das die Frage. Ein zweiter
 * Schalter daneben („und ausserdem FIRMENORDNER_AN=true") waere ein Zustand,
 * in dem der Container laeuft und das Backend ihn nicht kennt, und den
 * bemerkt niemand: die Benutzer werden angelegt, nur eben nicht dort.
 *
 * `false` heisst: jede Spiegelung ist ein stilles Nichts statt eines
 * Fehlers -- kein Aufruf, kein Zeitablauf, kein Vermerk.
 */
function istAn() {
  const profile = (process.env.COMPOSE_PROFILES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return profile.includes('firmenordner') && Boolean(basisIntern());
}

/**
 * Der Kopf fuer den Dienst-Administrator.
 *
 * BASIC UND NICHT OIDC, und das ist gemessen: der Dienst laeuft mit
 * `PROXY_ENABLE_BASIC_AUTH=true` (siehe `compose/compose.firmenordner.yaml`),
 * weil weder dieses Backend noch der Kommandozeilen-Klient am Rechner eines
 * Menschen ein Anmeldefenster oeffnen kann.
 */
function adminKopf() {
  const name = process.env.FIRMENORDNER_ADMIN || 'admin';
  const wort = process.env.FIRMENORDNER_ADMIN_PASSWORT || '';
  return `Basic ${Buffer.from(`${name}:${wort}`).toString('base64')}`;
}

/**
 * Eine Anfrage an den Dienst.
 *
 * WIRFT MIT DEM KOERPER IM TEXT. Die Graph-API antwortet auf einen
 * abgelehnten Aufruf mit einer Begruendung, und die ist das Einzige, was
 * hinterher sagt, WARUM eine Einladung nicht ging (am 21.09.2026 war es
 * `Field validation for 'Roles' failed on the 'available_role' tag` -- genau
 * die Zeile, an der sich „nur erweitern" gezeigt hat). Ein Fehler ohne sie
 * waere eine Stelle weniger, an der man das naechste Mal nachsehen kann.
 */
async function anfrage(weg, { methode = 'GET', koerper = null } = {}) {
  const basis = basisIntern();
  if (!basis) {
    throw new Error('Auf diesem Geraet laeuft kein Firmenordner (FIRMENORDNER_INTERN fehlt)');
  }
  const abbruch = AbortSignal.timeout(ZEITGRENZE_MS);
  const antwort = await fetch(`${basis}${weg}`, {
    method: methode,
    signal: abbruch,
    headers: {
      Authorization: adminKopf(),
      Accept: 'application/json',
      ...(koerper ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(koerper ? { body: JSON.stringify(koerper) } : {}),
  });
  const text = await antwort.text();
  if (!antwort.ok) {
    throw new Error(
      `Firmenordner: ${methode} ${weg} antwortete ${antwort.status} ${text.slice(0, 400)}`
    );
  }
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Menschen
// ---------------------------------------------------------------------------

/**
 * Einen Menschen im Dienst anlegen. Gibt seine Kennung dort zurueck.
 *
 * `onPremisesSamAccountName` ist der Anmeldename -- genau der Name, mit dem
 * sich der Mensch am Geraet anmeldet. `displayName` steht daneben, weil der
 * Dienst ihn verlangt; ohne Anzeigenamen lehnt er ab.
 */
async function legeNutzerAn({ name, anzeige, email, passwort }) {
  const daten = await anfrage('/graph/v1.0/users', {
    methode: 'POST',
    koerper: {
      onPremisesSamAccountName: name,
      displayName: anzeige || name,
      // Der Dienst verlangt eine Adresse. Hat der Mensch keine am Geraet,
      // bekommt er eine, die nirgendwohin fuehrt -- `.invalid` ist dafuer
      // reserviert (RFC 2606), es gibt also keinen Fall, in dem eine Mail
      // dorthin doch ankommt.
      mail: email || `${name}@arasul.invalid`,
      passwordProfile: { password: passwort },
      accountEnabled: true,
    },
  });
  return { id: daten.id, name: daten.onPremisesSamAccountName || name };
}

/** Das Passwort eines Menschen im Dienst setzen. */
async function setzePasswort(dienstId, passwort) {
  await anfrage(`/graph/v1.0/users/${encodeURIComponent(dienstId)}`, {
    methode: 'PATCH',
    koerper: { passwordProfile: { password: passwort } },
  });
}

/**
 * Sperren oder wieder zulassen.
 *
 * SPERREN IST NICHT LOESCHEN, und beides gibt es aus demselben Grund wie am
 * Geraet (`benutzerService`): stillgelegt kommt der Mensch nicht mehr herein,
 * seine Dateien bleiben liegen; geloescht ist er weg.
 */
async function setzeAktiv(dienstId, aktiv) {
  await anfrage(`/graph/v1.0/users/${encodeURIComponent(dienstId)}`, {
    methode: 'PATCH',
    koerper: { accountEnabled: Boolean(aktiv) },
  });
}

/**
 * Einen Menschen aus dem Dienst entfernen.
 *
 * Ein 404 ist hier KEIN Fehler: „gibt es nicht" ist das Ziel dieses Aufrufs.
 * Ohne diese Zeile bliebe eine Zeile in `firmenordner_nutzer` fuer immer als
 * offen stehen, weil der Nachholversuch jedes Mal am selben 404 scheitert.
 */
async function loescheNutzer(dienstId) {
  try {
    await anfrage(`/graph/v1.0/users/${encodeURIComponent(dienstId)}`, { methode: 'DELETE' });
  } catch (err) {
    if (!/ antwortete 404 /.test(err.message)) {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Raeume und Ordner
// ---------------------------------------------------------------------------

/**
 * Einen Raum anlegen -- im Geraetemodell ein Ordner der Ebene 1.
 *
 * Der NAME ist hier wichtiger als sonst: mit
 * `STORAGE_USERS_POSIX_GENERAL_SPACE_PATH_TEMPLATE=projects/{{.SpaceName}}`
 * wird er zum Ordnernamen auf der Platte des Geraets. Deshalb bekommt der
 * Dienst die KENNUNG als Namen und nicht den Anzeigenamen des Menschen --
 * Kleinbuchstaben und Bindestriche, sonst haette jeder Klient einen anderen
 * Pfad.
 */
async function legeRaumAn(kennung) {
  const daten = await anfrage('/graph/v1.0/drives', {
    methode: 'POST',
    koerper: { name: kennung, description: 'Arasul Firmenordner' },
  });
  return daten.id;
}

/**
 * Einen Ordner in einem Raum anlegen (Ebene 2).
 *
 * UEBER WEBDAV UND NICHT UEBER DIE GRAPH-API, und das ist gemessen:
 * `POST /graph/v1.0/drives/<raum>/root/children` antwortet 404 -- den Weg aus
 * Microsofts Graph gibt es hier nicht. `MKCOL` auf `/dav/spaces/<raum>/<pfad>`
 * antwortet 201, und der Ordner liegt danach als echter Ordner auf der Platte
 * (am 22.09.2026 am Orin nachgesehen).
 *
 * `405 Method Not Allowed` heisst „gibt es schon" und ist hier kein Fehler:
 * `holeNach()` legt einen Ordner nach, von dem es nicht weiss, ob er da ist.
 */
async function legeOrdnerAn(raumId, kennung) {
  await davAnfrage('MKCOL', `/dav/spaces/${pfadTeil(raumId)}/${pfadTeil(kennung)}`, [405]);
}

/**
 * Einen Raum wegwerfen -- im Geraetemodell ein Ordner der Ebene 1 samt allem
 * darin.
 *
 * ZWEI AUFRUFE, UND BEIDE IMMER. Das erste `DELETE` antwortet `204` und sieht
 * damit aus wie Erfolg -- der Raum steht danach aber mit
 * `root.deleted.state = "trashed"` weiter in der Liste, und seine Dateien
 * liegen unveraendert auf der Platte. Erst ein zweites `DELETE` mit
 * `Purge: T` nimmt ihn wirklich weg. Am 22.09.2026 am Orin nachgemessen,
 * beide Richtungen: nach dem ersten Aufruf lag `projects/projekte` noch da,
 * nach dem zweiten war der Ordner weg.
 *
 * DAS IST DIE GEFAEHRLICHE SORTE FEHLER, und deshalb steht sie hier so
 * ausfuehrlich: ein `204` auf einen Loeschbefehl liest sich als „erledigt",
 * und wer nicht auf der Platte nachsieht, merkt jahrelang nichts.
 *
 * Ein `404` ist kein Fehler: „gibt es nicht" ist das Ziel.
 *
 * UND AM ENDE WIRD NACHGESEHEN, NICHT GEGLAUBT. Ein Raum mit tausenden
 * Dateien braucht dafuer Sekunden bis Minuten, und in dieser Zeit kann
 * zwischen hier und dem Dienst alles Moegliche schiefgehen -- am 22.09.2026
 * war es die eigene Zeitgrenze, danach ein `500 grpc error` auf den zweiten
 * Versuch. Die einzige Frage, die zaehlt, ist trotzdem eine andere: steht der
 * Raum noch in der Liste des Dienstes? Steht er nicht, ist er weg, und was
 * die Antwort dazu sagte, ist eine Fussnote fuer das Protokoll. Steht er
 * noch, fliegt der Fehler weiter und die Zeile am Geraet bleibt.
 *
 * Das ist derselbe Satz wie oben, eine Stufe spaeter: ein Statuscode ist
 * keine Auskunft ueber die Platte.
 */
async function loescheRaum(raumId) {
  const weg = `/graph/v1.0/drives/${pfadTeil(raumId)}`;
  try {
    await davAnfrage('DELETE', weg, [404], {}, ZEITGRENZE_LOESCHEN_MS);
    await davAnfrage('DELETE', weg, [404], { Purge: 'T' }, ZEITGRENZE_LOESCHEN_MS);
  } catch (err) {
    if (await raumSteht(raumId)) {
      throw err;
    }
    logger.warn(
      `Firmenordner: das Wegwerfen von ${raumId} meldete „${err.message}" -- ` +
        'der Raum steht aber nicht mehr in der Liste des Dienstes, ist also weg.'
    );
  }
}

/**
 * Steht dieser Raum noch in der Liste des Dienstes?
 *
 * UEBER DIE LISTE UND NICHT UEBER DEN EINZELNEN RAUM, und das ist gemessen:
 * `GET /graph/v1.0/drives/<weggeworfener raum>` antwortet `500 grpc error`
 * und nicht `404` -- aus dieser Antwort laesst sich „gibt es nicht" nicht von
 * „ging gerade schief" unterscheiden. Die Liste antwortet auf beide Fragen
 * dasselbe: er ist darin oder er ist es nicht.
 *
 * Kommt die Liste selbst nicht, ist das ein `true`: wer nicht nachsehen
 * konnte, behauptet nicht, es sei weg.
 *
 * UND SIE WIRD BIS ZUM ENDE GELESEN. Die Graph-API darf ihre Antwort in
 * Seiten schneiden (`@odata.nextLink`); wer nur die erste liest, haelt auf
 * einem Geraet mit vielen Raeumen einen Raum fuer weggeworfen, der auf Seite
 * zwei steht -- und wirft die letzte Zeile weg, die ihn noch kennt. Das ist
 * genau die Sorte Leiche aus dem Auftrag `app-leiche`, also wird hier
 * geblaettert, solange der Dienst eine naechste Seite nennt.
 */
async function raumSteht(raumId) {
  try {
    let weg = '/graph/v1.0/drives';
    // Eine Schranke, damit ein Dienst, der immer dieselbe Seite nennt, dieses
    // Backend nicht im Kreis laufen laesst.
    for (let seite = 0; weg && seite < 50; seite += 1) {
      const daten = await anfrage(weg);
      if ((daten?.value || []).some(raum => raum?.id === raumId)) {
        return true;
      }
      weg = naechsteSeite(daten);
    }
    return false;
  } catch (err) {
    logger.warn(`Firmenordner: die Liste der Raeume kam nicht (${err.message})`);
    return true;
  }
}

/**
 * Der Weg zur naechsten Seite, relativ zum Dienst -- oder `null`.
 *
 * `@odata.nextLink` ist eine ganze Adresse; `anfrage()` will einen Weg. Zeigt
 * sie woandershin als zu diesem Dienst, wird ihr nicht gefolgt: eine Liste,
 * die auf einen fremden Rechner verweist, ist keine Antwort auf unsere Frage.
 */
function naechsteSeite(daten) {
  const link = daten?.['@odata.nextLink'];
  if (!link) {
    return null;
  }
  if (link.startsWith('/')) {
    return link;
  }
  const basis = basisIntern();
  return basis && link.startsWith(`${basis}/`) ? link.slice(basis.length) : null;
}

/**
 * Ein Aufruf, der keine JSON-Antwort erwartet: WebDAV-Methoden und die
 * Loeschwege. `erlaubt` nennt die Fehlercodes, die hier eine ANTWORT sind und
 * kein Fehler -- `404` bei „weg damit", `405` bei „gibt es schon".
 *
 * Eine eigene Funktion neben `anfrage`, weil sie eine andere Frage stellt:
 * `anfrage` will einen Koerper und gibt ihn zurueck, diese will nur wissen,
 * ob es geklappt hat.
 */
async function davAnfrage(methode, weg, erlaubt = [], kopfzeilen = {}, grenze = ZEITGRENZE_MS) {
  const basis = basisIntern();
  if (!basis) {
    throw new Error('Auf diesem Geraet laeuft kein Firmenordner (FIRMENORDNER_INTERN fehlt)');
  }
  const antwort = await fetch(`${basis}${weg}`, {
    method: methode,
    signal: AbortSignal.timeout(grenze),
    headers: { Authorization: adminKopf(), ...kopfzeilen },
  });
  if (!antwort.ok && !erlaubt.includes(antwort.status)) {
    throw new Error(
      `Firmenordner: ${methode} ${weg} antwortete ${antwort.status} ` +
        `${(await antwort.text()).slice(0, 400)}`
    );
  }
  return antwort;
}

/**
 * Ein Stueck Pfad, wie es in eine Adresse gehoert.
 *
 * `encodeURIComponent` und nicht `encodeURI`: eine Raumkennung traegt ein
 * `$` und ein `!` (`9eb604df-…$2c2c511d-…!155b8d0e-…`), und ein Ordnername
 * darf alles enthalten, was ein Dateisystem hergibt. `/` gehoert dabei NICHT
 * dazu -- ein Weg mit mehreren Teilen wird Teil fuer Teil zusammengesetzt.
 */
function pfadTeil(wert) {
  return encodeURIComponent(String(wert));
}

/**
 * Einen Ordner in einem Raum wegwerfen (Ebene 2).
 *
 * Auch hier ueber WebDAV: `DELETE` auf den Graph-Weg des Elements antwortet
 * `405` (gemessen). `404` heisst „gibt es nicht" und ist das Ziel.
 *
 * ZWEI SCHRITTE, AUS DEMSELBEN GRUND WIE BEIM RAUM. Ein `DELETE` ueber WebDAV
 * ist kein Wegwerfen, sondern ein Verschieben: der Ordner liegt danach unter
 * `<raum>/.Trash/files/<kennung>.trashitem/` und jede Datei darin ist noch da
 * (am 22.09.2026 am Orin nachgesehen, beide Richtungen). Die Route verspricht
 * „samt allem, was darin liegt"; ein Papierkorb, den niemand leert, ist genau
 * das Gegenteil -- die naechtliche Sicherung traegt ihn Nacht fuer Nacht mit,
 * und auf der Platte steht ein Ordner, den am Geraet keine Zeile mehr nennt.
 */
async function loescheOrdner(raumId, pfad) {
  await davAnfrage(
    'DELETE',
    `/dav/spaces/${pfadTeil(raumId)}/${pfadTeil(pfad)}`,
    [404],
    {},
    ZEITGRENZE_LOESCHEN_MS
  );
  await leerePapierkorb(raumId, pfad);
}

/**
 * Den einen Eintrag aus dem Papierkorb des Raums nehmen, der gerade
 * hineingefallen ist.
 *
 * NUR DEN EINEN, und nicht den Papierkorb. Darin liegt auch, was ein Mensch
 * geloescht hat und morgen zurueckholen will -- den Papierkorb ganz zu leeren
 * waere ein zweites Wegwerfen, das niemand bestellt hat.
 *
 * Gefunden wird er ueber `oc:trashbin-original-location`: das ist der Weg, an
 * dem er lag, und bei einem Ordner der Ebene 2 ist das genau seine Kennung.
 * Die Kennung IM PAPIERKORB ist eine andere (eine UUID), sie steht im `href`.
 *
 * GELESEN WIRD MIT EINEM MUSTER UND NICHT MIT EINEM XML-BAUM, und das ist
 * eine Abwaegung: eine XML-Bibliothek waere eine neue Abhaengigkeit des
 * Backends fuer vier Zeilen Antwort eines Dienstes, dessen Form wir kennen
 * und messen. Was das Muster nicht findet, wird nicht geloescht -- der Fehler
 * dieser Richtung ist ein Ordner, der im Papierkorb liegen bleibt, und nicht
 * einer, der faelschlich verschwindet.
 */
async function leerePapierkorb(raumId, pfad) {
  const wurzel = `/dav/spaces/trash-bin/${pfadTeil(raumId)}`;
  const antwort = await davAnfrage(
    'PROPFIND',
    wurzel,
    [404],
    { Depth: '1' },
    ZEITGRENZE_LOESCHEN_MS
  );
  if (antwort.status === 404) {
    return;
  }
  for (const eintrag of papierkorbEintraege(await antwort.text())) {
    if (eintrag.ort === pfad) {
      await davAnfrage(
        'DELETE',
        `${wurzel}/${pfadTeil(eintrag.id)}`,
        [404],
        {},
        ZEITGRENZE_LOESCHEN_MS
      );
    }
  }
}

/** Die Eintraege einer Papierkorb-Antwort: ihre Kennung und wo sie herkamen. */
function papierkorbEintraege(xml) {
  const eintraege = [];
  // Der Namensraum-Vorsatz wird nicht festgenagelt (`d:response`): er ist die
  // Wahl des Servers und keine Zusage.
  for (const block of String(xml)
    .split(/<[a-z0-9]*:?response[\s>]/i)
    .slice(1)) {
    const weg = block.match(/<[a-z0-9]*:?href[^>]*>([^<]*)</i)?.[1];
    const ort = block.match(/<[a-z0-9]*:?trashbin-original-location[^>]*>([^<]*)</i)?.[1];
    if (!weg || !ort) {
      continue;
    }
    const id = weg.replace(/\/+$/, '').split('/').pop();
    eintraege.push({ id: sicherEntschluesseln(id), ort: sicherEntschluesseln(ort) });
  }
  return eintraege;
}

/** `%20` zurueck zu einem Leerzeichen -- und ein einzelnes `%` bleibt, was es ist. */
function sicherEntschluesseln(wert) {
  try {
    return decodeURIComponent(wert);
  } catch {
    return wert;
  }
}

/** Die Kennung eines Ordners im Raum, ueber seinen Weg. */
async function ordnerKennung(raumId, pfad) {
  const daten = await anfrage(
    `/graph/v1.0/drives/${encodeURIComponent(raumId)}/root:/${encodeURI(pfad)}`
  );
  return daten.id;
}

/**
 * Die Kennung der Rolle, die der Dienst fuer ein Recht des Geraets kennt --
 * UND FUER DIE EBENE, auf der es gelten soll.
 *
 * ZWEI RECHTE MAL ZWEI EBENEN, UND KEINE STUFE „KEINE". Letztere gibt es im
 * Dienst nicht -- die Rolle „Denied" aus seiner Abstammung lehnt die Graph-API
 * ab (`Field validation for 'Roles' failed on the 'available_role' tag`,
 * gemessen am 21.09.2026). Genau deshalb ist ein Ordner ohne Recht hier eine
 * ABWESENHEIT und keine Zeile, und genau deshalb ist Ebene 1 ein Raum: wer
 * nicht Mitglied ist, sieht ihn nicht.
 *
 * DIE EBENE GEHOERT DAZU, und das ist der Fund vom 22.09.2026 am Orin: der
 * Dienst fuehrt „Can view" ZWEIMAL und „Can edit" DREIMAL, mit demselben
 * Anzeigenamen und verschiedenen Kennungen. Was sie unterscheidet, steht in
 * der Bedingung ihrer Berechtigungen:
 *
 *     Can view  exists @Resource.Root      -> ein ganzer Raum   (Ebene 1)
 *     Can view  exists @Resource.Folder    -> ein Ordner darin  (Ebene 2)
 *     Can edit  exists @Resource.Root      -> ein ganzer Raum
 *     Can edit  exists @Resource.Folder    -> ein Ordner darin
 *     Can edit  exists @Resource.File      -> eine einzelne Datei (nie hier)
 *
 * Die erste passende zu nehmen waere also eine Wette darauf, in welcher
 * Reihenfolge der Dienst sie aufzaehlt -- und die Wette waere schon beim
 * ersten Lauf verloren gewesen: dort stand die Ordner-Rolle vor der
 * Raum-Rolle.
 *
 * DIE KENNUNGEN STEHEN NICHT IM CODE, sondern werden geholt. Eine UUID einer
 * eingebauten Rolle ist die Sorte Wert, die so lange stimmt, bis der Dienst
 * eine Fassung weiter ist -- und dann sagt niemand Bescheid, die Einladung
 * wird nur abgelehnt. Findet sich keine passende, ist das ein Fehler mit Satz
 * und keine stille Einladung mit der falschen Rolle.
 *
 * `v1beta1` UND NICHT `v1.0`: der Weg unter `v1.0` antwortet 404 (gemessen).
 */
const ROLLENNAMEN = {
  lesen: ['can view', 'viewer'],
  schreiben: ['can edit', 'editor'],
};

/** Welche Bedingung eine Rolle tragen muss, damit sie fuer diese Ebene gilt. */
const EBENENMARKE = { raum: '@resource.root', ordner: '@resource.folder' };

let rollenZwischenspeicher = null;
async function rolleFuer(recht, ebene) {
  if (!rollenZwischenspeicher) {
    const daten = await anfrage('/graph/v1beta1/roleManagement/permissions/roleDefinitions');
    const liste = Array.isArray(daten) ? daten : daten?.value || [];
    const gefunden = {};
    for (const rolle of liste) {
      const name = String(rolle.displayName || '').toLowerCase();
      const bedingungen = (rolle.rolePermissions || [])
        .map(p => String(p.condition || '').toLowerCase())
        .join(' ');
      for (const [wasNennen, namen] of Object.entries(ROLLENNAMEN)) {
        if (!namen.includes(name)) {
          continue;
        }
        for (const [wo, marke] of Object.entries(EBENENMARKE)) {
          // `@Resource.Root` steht nie in derselben Rolle wie
          // `@Resource.Folder` -- der Dienst trennt sie. Eine Rolle, die
          // beides naennte, waere hier zweimal eingetragen, und das waere
          // richtig: sie gilt dann auch fuer beides.
          if (bedingungen.includes(marke)) {
            gefunden[`${wasNennen}:${wo}`] ??= rolle.id;
          }
        }
      }
    }
    rollenZwischenspeicher = gefunden;
  }
  const id = rollenZwischenspeicher[`${recht}:${ebene}`];
  if (!id) {
    throw new Error(
      `Der Firmenordner nennt keine Rolle fuer „${recht}" auf einem ${ebene}. ` +
        `Bekannt sind: ${Object.keys(rollenZwischenspeicher).join(', ') || '(keine)'}`
    );
  }
  return id;
}

/**
 * Einen Menschen auf einen Raum oder einen Ordner darin einladen.
 *
 * `ordnerId` leer heisst: der ganze Raum (Ebene 1). Sonst der Ordner darin
 * (Ebene 2). Das ist die eine Stelle, an der die zwei Ebenen des Geraets
 * wirklich verschiedene Dinge im Dienst sind.
 */
async function ladeEin({ raumId, ordnerId, dienstNutzerId, recht }) {
  const ziel = ordnerId
    ? `/graph/v1beta1/drives/${encodeURIComponent(raumId)}/items/${encodeURIComponent(ordnerId)}/invite`
    : `/graph/v1beta1/drives/${encodeURIComponent(raumId)}/root/invite`;
  await anfrage(ziel, {
    methode: 'POST',
    koerper: {
      recipients: [{ objectId: dienstNutzerId, '@libre.graph.recipient.type': 'user' }],
      roles: [await rolleFuer(recht, ordnerId ? 'ordner' : 'raum')],
    },
  });
}

/**
 * Eine Einladung wieder wegnehmen.
 *
 * DAS IST KEIN ENTZIEHEN NACH UNTEN. Es nimmt genau das Recht zurueck, das
 * hier vergeben wurde -- wer auf dem Raum darueber eins hat, behaelt es. Die
 * Regel des Zielbildes („nie unterhalb wieder entzogen") ist damit gewahrt,
 * und sie wird eine Ebene hoeher durchgesetzt (`ordnerVerwaltung.gibRecht`).
 */
async function nimmEinladungZurueck({ raumId, ordnerId, dienstNutzerId }) {
  const wurzel = ordnerId
    ? `/graph/v1beta1/drives/${encodeURIComponent(raumId)}/items/${encodeURIComponent(ordnerId)}`
    : `/graph/v1beta1/drives/${encodeURIComponent(raumId)}/root`;
  const daten = await anfrage(`${wurzel}/permissions`);
  const liste = daten?.value || [];
  for (const recht of liste) {
    if (recht?.grantedToV2?.user?.id === dienstNutzerId) {
      await anfrage(`${wurzel}/permissions/${encodeURIComponent(recht.id)}`, {
        methode: 'DELETE',
      });
    }
  }
}

/**
 * Wer in einem Raum Mitglied ist -- als Liste der Berechtigungen an seiner
 * Wurzel.
 *
 * FUER DIE WURZEL DES FIRMENORDNERS (Auftrag firmenordner-rechte-im-frontend,
 * 22.09.2026): dort steht kein Mensch in `firmenordner_rechte`, jeder aktive
 * Mensch liest, jeder Administrator schreibt. Was der Dienst davon schon
 * weiss, sagt nur er selbst -- und wer das nicht fragt, laedt bei jedem
 * Abgleich jeden Menschen noch einmal ein.
 *
 * Gibt je Berechtigung die Kennung des Menschen im Dienst und die Rollen
 * zurueck; Berechtigungen ohne Menschen (Links, Gruppen) fallen weg.
 */
async function mitglieder(raumId) {
  const daten = await anfrage(
    `/graph/v1beta1/drives/${encodeURIComponent(raumId)}/root/permissions`
  );
  return (daten?.value || [])
    .filter(recht => recht?.grantedToV2?.user?.id)
    .map(recht => ({
      permissionId: recht.id,
      dienstNutzerId: recht.grantedToV2.user.id,
      rollen: Array.isArray(recht.roles) ? recht.roles : [],
    }));
}

/** Eine einzelne Berechtigung an der Wurzel eines Raums wegnehmen. */
async function entferneMitglied(raumId, permissionId) {
  await anfrage(
    `/graph/v1beta1/drives/${encodeURIComponent(raumId)}/root/permissions/${encodeURIComponent(permissionId)}`,
    { methode: 'DELETE' }
  );
}

/**
 * Wer zuletzt wann etwas geaendert hat -- aus dem Aenderungsprotokoll des
 * Dienstes.
 *
 * DER DIENST WEISS ES, DAS GERAET NICHT. Auf der Platte gehoert jede Datei
 * dem Konto des Geraets (uid 1000, `posix`); wer sie hochgeladen hat, steht
 * nirgends im Dateisystem. Der Dienst fuehrt dagegen je Element ein
 * Protokoll (`activitylog`), und die Graph-Erweiterung
 * `org.libregraph/activities` gibt es heraus -- am 22.09.2026 am Orin
 * gemessen: nach einem `PUT` eines Menschen steht dort binnen Sekunden
 * `{user} added {resource} to {folder}` mit seinem Anzeigenamen und der
 * Zeit. Ein `PROPFIND` dagegen nennt nur `getlastmodified` und den
 * EIGENTUEMER des Raums, nie den, der geschrieben hat.
 *
 * `kql=itemid:<kennung>` -- fuer einen Raum die Kennung des Raums, fuer einen
 * Ordner darin die Kennung des Ordners. Die Antwort ist eine Vorlage mit
 * Platzhaltern (`{user}`, `{resource}`, `{folder}`, `{space}`, `{sharee}`)
 * und ihren Werten; hier wird sie zu einem Satz aufgeloest, damit die
 * Oberflaeche nichts von dieser Form wissen muss.
 *
 * Neueste zuerst, hoechstens `grenze` Eintraege.
 */
async function aenderungen(itemId, grenze = 20) {
  const daten = await anfrage(
    `/graph/v1beta1/extensions/org.libregraph/activities?kql=${encodeURIComponent(`itemid:${itemId}`)}`
  );
  const liste = (daten?.value || [])
    .map(eintrag => {
      const vorlage = eintrag?.template || {};
      const werte = vorlage.variables || {};
      const wer = werte.user?.displayName || werte.user?.id || null;
      const text = String(vorlage.message || '').replace(/\{(\w+)\}/g, (_, name) => {
        const wert = werte[name];
        if (!wert || typeof wert !== 'object') {
          return name;
        }
        return wert.displayName || wert.name || wert.id || name;
      });
      return {
        wann: eintrag?.times?.recordedTime || null,
        wer,
        text,
        datei: werte.resource?.name || null,
      };
    })
    .filter(e => e.wann)
    .sort((a, b) => String(b.wann).localeCompare(String(a.wann)));
  return liste.slice(0, grenze);
}

/**
 * Eine Datei aus einem Raum lesen, als Text. `null`, wenn es sie nicht gibt.
 *
 * Fuer `places.json` in der Wurzel (`sicht.md`, Regel 3 des Zielbildes): die
 * Orte pflegt das Haus in seiner Wurzel, das Geraet liest sie nur. Ueber
 * WebDAV mit dem Konto des Geraets, weil der Firmenordner-Mount des Backends
 * den Raum nur unter dem Namen kennt, den der Dienst ihm auf der Platte
 * gegeben hat -- und der ist bei einem Raum, der vor der Pfadvorlage
 * angelegt wurde, eine UUID.
 */
async function leseDatei(raumId, pfad, grenzeBytes = 64 * 1024) {
  const teile = String(pfad).split('/').filter(Boolean).map(pfadTeil).join('/');
  const antwort = await davAnfrage('GET', `/dav/spaces/${pfadTeil(raumId)}/${teile}`, [404]);
  if (antwort.status === 404) {
    return null;
  }
  const text = await antwort.text();
  return text.length > grenzeBytes ? text.slice(0, grenzeBytes) : text;
}

/**
 * Was der Dienst gerade von sich gibt: die Fassung und ob er antwortet.
 *
 * FUER DIE OBERFLAECHE UND FUER DIE ABNAHME, nicht fuer den Betrieb. Wer
 * fragt, ob der Firmenordner LAEUFT, fragt Docker; wer fragt, ob Arasul mit
 * ihm SPRECHEN kann, fragt hier -- und das sind zwei verschiedene Fragen,
 * die schon einmal verwechselt worden sind (der Healthcheck einer App, der
 * ihr Backend prueft und ihr Frontend nicht, Auftrag `app-leiche`).
 */
async function zustand() {
  if (!istAn()) {
    return { an: false, erreichbar: false, grund: 'Auf diesem Geraet laeuft kein Firmenordner' };
  }
  if (!process.env.FIRMENORDNER_ADMIN_PASSWORT) {
    // EIGENE ANTWORT UND KEIN „AUS". Das Profil laeuft, der Container steht
    // da -- es fehlt nur das Geheimnis, mit dem das Backend an seine
    // Graph-API kommt. Das als „gibt es hier nicht" zu melden waere die
    // falsche Auskunft an genau den Menschen, der sie beheben kann.
    return {
      an: true,
      erreichbar: false,
      grund:
        'config/secrets/firmenordner_admin_password fehlt oder ist leer. ' +
        'Ohne sie kann Arasul keine Nutzer in den Dateidienst spiegeln.',
    };
  }
  try {
    await anfrage('/graph/v1.0/users?$top=1');
    return { an: true, erreichbar: true, grund: null };
  } catch (err) {
    logger.warn(`Firmenordner nicht erreichbar: ${err.message}`);
    return { an: true, erreichbar: false, grund: err.message };
  }
}

module.exports = {
  ZEITGRENZE_LOESCHEN_MS,
  istAn,
  basisAussen,
  basisIntern,
  legeNutzerAn,
  setzePasswort,
  setzeAktiv,
  loescheNutzer,
  legeRaumAn,
  legeOrdnerAn,
  loescheRaum,
  loescheOrdner,
  ordnerKennung,
  raumSteht,
  ladeEin,
  nimmEinladungZurueck,
  mitglieder,
  entferneMitglied,
  rolleFuer,
  aenderungen,
  leseDatei,
  zustand,
  // Nur fuer die Tests: der Zwischenspeicher der Rollen haelt sonst ueber
  // Testfaelle hinweg, und ein Test faende die Antwort des vorigen.
  _rollenVergessen: () => {
    rollenZwischenspeicher = null;
  },
};
