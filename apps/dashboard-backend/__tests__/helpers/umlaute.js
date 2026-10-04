/**
 * Die Regel hinter `__tests__/unit/umlaute.test.js`: was eine Ersatzschreibung
 * ist und wie sie ausgeschrieben aussieht.
 *
 * Eine Liste von Stämmen und keine Regel „ae, oe, ue": die fände „Quelle",
 * „neue" und „Steuer". Dieselbe Liste steht im Frontend-Test
 * (`begriffe.test.ts`); wer eine Zeile ergänzt, ergänzt beide.
 */
const STAEMME =
  'aender|aelter|uebersicht|ueber|fuer|zurueck|geraet|laeuf|laesst|laed|pruef|moeglich|schluessel|loesch|waehl|spaeter|naechst|muess|koenn|groess|haeuf|oeffn|faell|haelt|traeg|zaehl|erklaer|bestaetig|fuehr|wuerd|duerf|noetig|taetig|verfueg|rueck|stueck|gruen|schoen|moecht|gehoer|stoer|zustaend|erhoeh|hoech|naeh|uebrig|koerper|koennt|aehnlich|gewaehr|natuerlich|zuverlaess|faehig|staend|staerk' +
  // ß: Wörter, in denen ein „ss" ein ß ist (nicht „muss", „passt", „messen")
  '|aussen|ausser|schliess|heiss|weiss|liess|gross|dreiss|stoss' +
  // weitere Umschreibungen aus dem Bestand des Backends
  '|kuerzel|taet|saetz|ungefaehr|abhaeng|raeum|schraeg|wuensch|buendel|knuepf|ausdruec|gueltig|aufraeum|laeng|haett|ueblich|fuenf|genueg|zwoelf|gekuerz|ausloes|zusaetz|hoer|verschluess|entschluess|haeng' +
  // weitere aus dem Handbuch
  '|faehr|frueh|massen|massnahm|reiss|haeck|knoepf|persoen|reisst|engpaess|schlaeg|woech|waere|taeg|buero|aufloes|loest|flaech|gruess|stuerz|druec';
const UMSCHRIEBEN = new RegExp(STAEMME, 'i');

/** Stämme, in denen „ss" zu „ß" wird. */
const ESZETT =
  /(aussen|ausser|schliess|heiss|weiss|liess|gross|dreiss|stoss|gruess|reiss|massen|massnahm)/i;

/**
 * Namen, die als Wort in einer Meldung stehen und ein Feld, einen Wert oder
 * eine Kennung meinen. Sie bleiben, wie sie sind: Kits bauen gegen sie.
 */
const FELDNAMEN = new Set(['aenderungstext', 'schluessel']);

/** Der Text ohne das, was ein Name ist: `Code`, "Anführung", „Anführung“. */
function ohneNamen(text, nurCode = false) {
  const leer = m => ' '.repeat(m.length);
  const ohneCode = text.replace(/`[^`]*`/g, leer);
  if (nurCode) return ohneCode;
  return ohneCode.replace(/"[^"]*"/g, leer).replace(/„[^“"]*["“]/g, leer);
}

/** Wörter (Position, Text), die eine Umschreibung tragen und kein Feldname sind. */
/**
 * `nurCode`: in einem Dokument sind Anführungen Beschriftungen der Oberfläche und
 * keine Namen, nur `Code` bleibt.
 */
function umschriebeneWoerter(text, nurCode = false) {
  const rest = ohneNamen(text, nurCode);
  const woerter = [];
  const wort = /[A-Za-z][A-Za-z0-9_]*/g;
  let m;
  while ((m = wort.exec(rest)) !== null) {
    // GROSSBUCHSTABEN: ß gibt es dort nicht, „AUSSCHLIESSLICH" ist richtig.
    const versal = m[0] === m[0].toUpperCase() && !/AE|OE|UE/.test(m[0]);
    // Ein Bezeichner mit Unterstrich (`wiederhole_ueber`) ist ein Name, kein Wort.
    const bezeichner = m[0].includes('_');
    if (UMSCHRIEBEN.test(m[0]) && !versal && !bezeichner && !FELDNAMEN.has(m[0])) {
      woerter.push({ pos: m.index, text: m[0] });
    }
  }
  return woerter;
}

function ausgeschrieben(wort) {
  let neu = wort
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü')
    .replace(/Ae/g, 'Ä')
    .replace(/Oe/g, 'Ö')
    .replace(/Ue/g, 'Ü');
  if (ESZETT.test(wort)) neu = neu.replace(/ss/g, 'ß');
  return neu;
}

/** Den Text mit allen Umschreibungen ausgeschrieben (Zeichen für Zeichen von hinten). */
function ausschreiben(text) {
  let aus = text;
  for (const w of umschriebeneWoerter(text).reverse()) {
    aus = aus.slice(0, w.pos) + ausgeschrieben(w.text) + aus.slice(w.pos + w.text.length);
  }
  return aus;
}

module.exports = {
  UMSCHRIEBEN,
  FELDNAMEN,
  umschriebeneWoerter,
  ausgeschrieben,
  ausschreiben,
  ohneNamen,
};
