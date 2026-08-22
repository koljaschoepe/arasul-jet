/**
 * Warum ein Lauf geendet hat, mit Grund und Kennung (Plan 023 E1).
 *
 * Gemeldet war: „irgendwann kam einfach eine Nachricht, dass es abgebrochen
 * ist", mehrfach, ohne erkennbares Muster. Das Muster fehlte nicht, weil es
 * keins gab, sondern weil nichts aufgeschrieben wurde. Ein Lauf konnte an acht
 * verschiedenen Stellen enden, und sieben davon hinterliessen dem Nutzer
 * denselben Satz `_Abgebrochen._` und der Datenbank gar nichts:
 * `llm_jobs.error_message` blieb bei Nutzer-Abbruch und beim Zeitlimit leer.
 *
 * Diese Datei ist die eine Stelle, an der ein Abbruch benannt wird. Sie liefert
 * drei Dinge, und zwar immer zusammen:
 *
 *   Grund    eine stabile Kennung aus GRUENDE, kein freier Text. Wer nach
 *            `grund=stream_still` sucht, findet jeden Fall dieser Art, auch
 *            wenn sich der deutsche Satz daneben spaeter aendert.
 *   Kennung  `ABB-<6 Zeichen der Job-Id>-<Grund>`, kurz genug, um sie am
 *            Telefon vorzulesen. Sie steht im Chat, im Protokoll und in der
 *            Datenbank. Damit ist der Weg vom Satz auf dem Bildschirm zur
 *            Protokollzeile eine einzige Suche.
 *   Zeile    ein Protokolleintrag in fester Form, beginnend mit `[ABBRUCH]`.
 *            Feste Form heisst: `docker logs dashboard-backend | grep ABBRUCH`
 *            ergibt eine Liste, keine Erzaehlung.
 *
 * Bewusst NICHT hier: die Entscheidung, ob ein Abbruch ein Fehler ist. Ein
 * Nutzer-Abbruch ist keiner, ein stiller Modell-Stream schon. Das entscheidet
 * die aufrufende Stelle, die den Zusammenhang kennt.
 */

/**
 * Jeder Ort, an dem ein Lauf enden kann, mit dem Satz, den der Nutzer liest.
 *
 * Der Satz ist deutsch und nennt, wo moeglich, den naechsten Schritt. Er wird
 * an drei Orten gezeigt (Chat, Protokoll, Pruefansicht) und darf deshalb keine
 * technischen Begriffe tragen, die nur im Backend Sinn ergeben.
 */
const GRUENDE = Object.freeze({
  nutzer: 'Vom Nutzer gestoppt.',
  stream_still: 'Das Modell hat zu lange nichts mehr geschickt.',
  werkzeug: 'Ein Werkzeug ist gescheitert.',
  lauf_zeitlimit: 'Das Zeitlimit für diesen Lauf ist erreicht.',
  runden_ende: 'Die Höchstzahl an Werkzeug-Runden ist erreicht.',
  warteschlange_zeitlimit: 'Der Auftrag stand zu lange in der Warteschlange.',
  strom_zeitlimit: 'Der Lauf hat zehn Minuten lang nichts mehr geschrieben.',
  zuhoerer_verworfen: 'Die Verbindung zur Anzeige wurde vom Aufräumtakt verworfen.',
  verbindung_weg: 'Der Browser hat die Verbindung geschlossen.',
  neustart: 'Ein Neustart des Dienstes hat den Lauf unterbrochen.',
  modell_weg: 'Der KI-Dienst war nicht erreichbar.',
  kontext_voll: 'Der Zusammenhang des Gesprächs ist zu groß geworden.',
  kein_fortschritt: 'Mehrere Schritte in Folge brachten nichts Neues.',
  unbekannt: 'Der Lauf ist unerwartet geendet.',
});

/** Ein Grund, den GRUENDE nicht kennt, ist ein Programmierfehler, kein Fall. */
function istGrund(grund) {
  return Object.prototype.hasOwnProperty.call(GRUENDE, grund);
}

/**
 * Die Kennung, die der Nutzer sieht und die im Protokoll steht.
 *
 * Absichtlich ableitbar statt zufällig: derselbe Job und derselbe Grund geben
 * dieselbe Kennung. Wer eine Kennung aus einem Bildschirmfoto liest, kann sie
 * ohne Umweg im Protokoll suchen, und zwei Laeufe lassen sich nicht
 * verwechseln, weil die Job-Id darin steckt.
 *
 * @param {string} jobId
 * @param {string} grund
 * @returns {string} z. B. "ABB-3f2a91-stream_still"
 */
function kennung(jobId, grund) {
  const kurzId = String(jobId || 'ohnejob')
    .replace(/-/g, '')
    .slice(0, 6);
  return `ABB-${kurzId}-${istGrund(grund) ? grund : 'unbekannt'}`;
}

/**
 * Schreibt die Protokollzeile und gibt die Kennung zurück.
 *
 * Die Form ist fest und maschinenlesbar. Sie beginnt mit `[ABBRUCH]`, damit
 * ein Filter sie ohne Kenntnis der Wortwahl findet, und traegt jeden Wert als
 * `schluessel=wert`, damit sich eine Auswertung schreiben laesst, ohne diese
 * Datei zu kennen.
 *
 * @param {object} p
 * @param {object} p.log Logger mit info/warn
 * @param {string} p.jobId
 * @param {string} p.grund Schlüssel aus GRUENDE
 * @param {string} p.quelle wo im Code, z. B. "chatAgentRunner.streamChatRound"
 * @param {string} [p.detail] die rohe technische Ursache, fürs Protokoll
 * @param {number} [p.nachMs] wie lange der Lauf gelaufen war
 * @param {boolean} [p.fehler] true, wenn das ein Fehler ist (warn statt info)
 * @returns {string} die Kennung
 */
function abbruchMelden({ log, jobId, grund, quelle, detail = '', nachMs = null, fehler = true }) {
  const k = kennung(jobId, grund);
  const teile = [
    '[ABBRUCH]',
    `kennung=${k}`,
    `job=${jobId || 'ohne'}`,
    `grund=${istGrund(grund) ? grund : 'unbekannt'}`,
    `quelle=${quelle}`,
  ];
  if (Number.isFinite(nachMs)) {
    teile.push(`nach=${Math.round(nachMs / 1000)}s`);
  }
  if (detail) {
    teile.push(`detail=${JSON.stringify(String(detail).slice(0, 300))}`);
  }
  const zeile = teile.join(' ');
  if (fehler) {
    log?.warn?.(zeile);
  } else {
    log?.info?.(zeile);
  }
  return k;
}

/**
 * Haelt den Abbruch an der Job-Zeile fest.
 *
 * Getrennt vom Protokoll, weil beides unterschiedlich lange lebt: Protokolle
 * rollen weg, die Job-Zeile bleibt. Wer in einer Woche fragt „warum brach das
 * am Dienstag ab", hat dann noch Grund und Kennung, auch wenn die Zeile im
 * Protokoll laengst fort ist.
 *
 * Der Aufruf darf nie werfen. Ein Abbruch, dessen Buchführung selbst scheitert,
 * würde sonst den echten Grund durch einen Datenbankfehler ersetzen, und genau
 * dieser Fehler ist am 22.08.2026 in D9 schon einmal passiert.
 *
 * @param {object} p
 * @param {object} p.database
 * @param {object} p.log
 * @param {string} p.jobId
 * @param {string} p.grund
 * @param {string} p.kennung
 * @param {string} [p.detail]
 */
async function abbruchFesthalten({ database, log, jobId, grund, kennung: k, detail = '' }) {
  if (!database || !jobId) {
    return;
  }
  try {
    await database.query(
      `UPDATE llm_jobs
          SET abbruch_grund = $2, abbruch_kennung = $3,
              abbruch_detail = $4, abbruch_am = NOW()
        WHERE id = $1`,
      [jobId, String(grund).slice(0, 40), String(k).slice(0, 60), String(detail).slice(0, 1000)]
    );
  } catch (err) {
    log?.error?.(`[ABBRUCH] Grund von Job ${jobId} nicht festgehalten: ${err.message}`);
  }
}

/**
 * Der Satz, der im Chat erscheint, mit Kennung dahinter.
 *
 * Die Kennung gehoert in den sichtbaren Text, nicht nur ins Protokoll. Ohne sie
 * kann der Nutzer melden, dass etwas abgebrochen ist, aber nicht welches; mit
 * ihr ist die Meldung ein Suchbegriff.
 *
 * @param {string} grund
 * @param {string} k Kennung
 * @returns {string}
 */
function abbruchText(grund, k) {
  const satz = istGrund(grund) ? GRUENDE[grund] : GRUENDE.unbekannt;
  return `\n\n_Abgebrochen: ${satz} Kennung ${k}._`;
}

/**
 * Ordnet einen rohen Fehler einem Grund zu.
 *
 * Nur fuer Stellen, die einen Fehler auffangen, ohne zu wissen, woher er kommt.
 * Wer den Grund kennt, gibt ihn direkt an; Raten ist die schlechtere Auskunft.
 *
 * @param {Error|string} err
 * @returns {string} Schlüssel aus GRUENDE
 */
function grundAusFehler(err) {
  const roh = String(err?.message || err || '');
  if (/ohne Daten|Modell-Stream/i.test(roh)) {
    return 'stream_still';
  }
  // `aborted` steht hier ausdruecklich mit dabei: so meldet sich eine
  // gerissene Verbindung zum KI-Dienst. Am 22.08.2026 nachgestellt, indem der
  // Dienst mitten in der Antwort angehalten wurde; der Grund landete damals auf
  // `unbekannt`, und das half niemandem. Der Nutzer-Abbruch kommt hier nicht
  // an, der hat weiter oben seinen eigenen Zweig.
  if (
    /ECONNREFUSED|ENOTFOUND|fetch failed|ECONNRESET|socket hang up|^aborted$|stream has been aborted|EPIPE/i.test(
      roh
    )
  ) {
    return 'modell_weg';
  }
  if (/timeout|timed?\s*out|ETIMEDOUT/i.test(roh)) {
    return 'lauf_zeitlimit';
  }
  if (/context|num_ctx|zu gro/i.test(roh)) {
    return 'kontext_voll';
  }
  return 'unbekannt';
}

module.exports = {
  GRUENDE,
  istGrund,
  kennung,
  abbruchMelden,
  abbruchFesthalten,
  abbruchText,
  grundAusFehler,
};
