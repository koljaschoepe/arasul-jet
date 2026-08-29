#!/usr/bin/env node
/**
 * Design System Validation
 *
 * Standalone quality gate — checks CSS files against Design System rules.
 * Replaces the former designSystem.test.js Jest suite.
 *
 * Usage: node scripts/test/check-design-system.js
 * Exit code 0 = pass, 1 = critical errors found
 */

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const SRC_PATH = path.join(REPO, 'apps', 'dashboard-frontend', 'src');

// Seit Phase D7 liegt das Designsystem nicht mehr nur in der Shell: die sechs
// Bausteine, die Shell und Apps teilen, bringen ihr eigenes Stylesheet mit
// (`packages/marken/src/marken.css`). Ein Waechter fuer das Designsystem, der
// die Datei des Designsystems nicht liest, misst die kleinere Haelfte.
const CSS_WURZELN = [SRC_PATH, path.join(REPO, 'packages', 'marken', 'src')];

// --- Design System constants ---------------------------------------------------

const FORBIDDEN_COLORS = [
  '#00FF88', '#00ff88', '#00cc6f', '#00FF136',
  'rgba(0, 255, 136',
];

const ALLOWED_COLORS = [
  '#45adff', '#6ec4ff', '#2d8fd9',
  '#101923', '#1a2330', '#222d3d', '#2a3544', '#3a4554',
  '#f8fafc', '#cbd5e1', '#94a3b8', '#64748b',
  '#22c55e', '#f59e0b', '#ef4444',
  '#10b981', '#3498db',
  '#000', '#000000', '#fff', '#ffffff',
  '#1d2835',
];

// --- Thresholds (ratchet — never increase) -----------------------------------
// Ratcheted down after the Cursor-Shell rebuild (Plan 002): custom-property
// definitions (`--token: #hex`) no longer count as hardcoded — they ARE the
// token source. Remaining 2 hits live in the @media print block (deliberate
// literal print colors).
const HARDCODED_COLOR_THRESHOLD = 2;
const MISSING_TRANSITION_THRESHOLD = 48;

// --- Helpers -----------------------------------------------------------------

function findCSSFiles(dir, files = []) {
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && item !== 'node_modules' && item !== '__tests__') {
      findCSSFiles(fullPath, files);
    } else if (item.endsWith('.css')) {
      files.push(fullPath);
    }
  }
  return files;
}

function analyzeCSS(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.relative(REPO, filePath);
  const lines = content.split('\n');
  const issues = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const lowerLine = line.toLowerCase();
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//')) return;

    // Forbidden colors
    for (const fc of FORBIDDEN_COLORS) {
      if (lowerLine.includes(fc.toLowerCase())) {
        issues.push({ type: 'FORBIDDEN_COLOR', severity: 'ERROR', line: lineNum, file: fileName, message: `Verbotene Farbe "${fc}" — verwende #45ADFF oder Design System Farben` });
      }
    }

    // Hardcoded hex colors — custom-property definitions (`--token: #hex`) are
    // exempt: they are the design-token source, not a hardcoded usage.
    const hexMatches = line.match(/#[0-9A-Fa-f]{3,6}(?![0-9A-Fa-f])/g);
    const isTokenDefinition = /^--[\w-]+\s*:/.test(trimmed);
    if (hexMatches && !isTokenDefinition && !line.includes('var(--') && !line.includes(':root')) {
      for (const m of hexMatches) {
        if (!ALLOWED_COLORS.includes(m.toLowerCase())) {
          issues.push({ type: 'HARDCODED_COLOR', severity: 'WARNING', line: lineNum, file: fileName, message: `Hardcodierte Farbe "${m}" — CSS-Variable verwenden` });
        }
      }
    }

    // Missing transitions on :hover / :focus / :active
    if (lowerLine.includes(':hover') || lowerLine.includes(':focus') || lowerLine.includes(':active')) {
      const surroundingLines = lines.slice(Math.max(0, index - 10), Math.min(lines.length, index + 10)).join('\n');
      if (!surroundingLines.includes('transition')) {
        issues.push({ type: 'MISSING_TRANSITION', severity: 'WARNING', line: lineNum, file: fileName, message: 'Pseudo-Klasse ohne transition' });
      }
    }
  });

  return issues;
}

// --- Login.css specific checks -----------------------------------------------

function checkLoginCSS() {
  const errors = [];
  const loginPath = path.join(SRC_PATH, 'features', 'system', 'Login.css');
  if (!fs.existsSync(loginPath)) return errors;
  const content = fs.readFileSync(loginPath, 'utf8').toLowerCase();

  if (content.includes('#00cc6f')) errors.push('Login.css: Gruene Hover-Farbe #00cc6f');
  if (content.includes('rgba(0, 255, 136')) errors.push('Login.css: Gruene Box-Shadow');
  return errors;
}

// --- index.css variable checks -----------------------------------------------

function checkIndexCSS() {
  const errors = [];
  const indexPath = path.join(SRC_PATH, 'index.css');
  if (!fs.existsSync(indexPath)) { errors.push('index.css nicht gefunden'); return errors; }
  // Seit Phase H3 stehen die Farbwerte nicht mehr in `index.css`, sondern in
  // `packages/marken/src/theme.css` -- dort, wo die Primitive stehen, die sie
  // brauchen. Geprueft werden beide Dateien zusammen: WO ein Wert steht, ist
  // eine Frage des Aufbaus, WELCHER es ist, eine des Designsystems.
  const themePath = path.join(REPO, 'packages', 'marken', 'src', 'theme.css');
  if (!fs.existsSync(themePath)) { errors.push('packages/marken/src/theme.css nicht gefunden'); return errors; }
  const content = fs.readFileSync(indexPath, 'utf8') + '\n' + fs.readFileSync(themePath, 'utf8');
  const lower = content.toLowerCase();

  // The value source is the shadcn set (--primary / --background); the Arasul
  // aliases (--primary-color / --bg-dark) now point at those via var(). Check the
  // real values where they actually live, not the aliased names.
  //
  // Seit Phase H1 gibt es ZWEI Themes, und `:root` ist das helle: die Vorgabe
  // steht ohne Selektor da, `[data-theme='dark']` ueberschreibt sie. Geprueft
  // werden deshalb beide Seiten -- ein Wert, den nur eines der beiden Themes
  // hat, ist ein Wert, der im anderen fehlt.
  // Siehe docs/development/DESIGN.md.
  if (!lower.includes('--primary: #2d8fd9')) errors.push('Primary (Hell) nicht #2D8FD9');
  if (!lower.includes('--background: #f6f6f6')) errors.push('Background (Hell) nicht #F6F6F6');
  if (!lower.includes('--primary: #81a1c1')) errors.push('Primary (Dunkel) nicht #81A1C1');
  if (!lower.includes('--background: #141414')) errors.push('Background (Dunkel) nicht #141414');
  if (!lower.includes('--text-primary')) errors.push('--text-primary Variable fehlt');

  // »Schwarz« ist mit H1 gefallen, und mit ihm die Klasse `.light`: Hell IST
  // `:root`. Beides steht hier, weil beides von selbst zurueckkommt -- ein
  // `.light`-Selektor sieht wie eine harmlose Theme-Regel aus und ist seit H1
  // eine Regel, die NIE greift (die Klasse setzt niemand mehr), und ein
  // dritter Theme-Block waere die dritte Spalte in jeder Abnahmetabelle.
  if (/(^|[\s,>+~])\.light\b/m.test(content)) {
    errors.push('Theme-CSS: `.light`-Selektor — die Klasse setzt seit H1 niemand mehr');
  }
  const themeBloecke = [...content.matchAll(/\[data-theme=['"]([\w-]+)['"]\]/g)].map(m => m[1]);
  const fremde = [...new Set(themeBloecke)].filter(t => t !== 'dark');
  if (fremde.length) {
    errors.push(`Theme-CSS: unbekanntes Theme [data-theme=${fremde.join(', ')}] — es gibt Hell und Dunkel`);
  }
  return errors;
}

// --- index.html: nichts Ungeschichtetes --------------------------------------

/**
 * Der `<style>`-Block in `index.html` steht vollstaendig in einer Schicht.
 *
 * DER FUND VOM 29.08.2026 (Phase H2, am Orin gemessen). Dort stand
 * `body { background: #f6f6f6; color: #1a1a1a }` OHNE Schicht, und
 * ungeschichtetes CSS gewinnt gegen jede Schicht -- auch gegen
 * `@layer base`, wo `body` seine Farbe aus `var(--background)` bekommt. Im
 * dunklen Theme meldete `<html>` also `data-theme="dark"` und
 * `--background: #141414`, waehrend der Hintergrund der Seite hell blieb und
 * die geerbte Textfarbe fast schwarz. Jede dunkle Zelle der Theme-Abnahme war
 * rot, und die Datei sagte selbst im Kommentar, warum das passieren kann
 * („Do NOT add * { margin/padding } here") -- nur nicht ueber ihre eigene
 * `body`-Regel.
 *
 * Der Block darf es geben: er faerbt die Zehntelsekunde vor dem Stylesheet.
 * Er darf nur nicht gewinnen, sobald das Stylesheet da ist.
 */
function checkIndexHtml() {
  const errors = [];
  const htmlPath = path.join(REPO, 'apps', 'dashboard-frontend', 'index.html');
  if (!fs.existsSync(htmlPath)) return errors;
  const content = fs.readFileSync(htmlPath, 'utf8');

  for (const block of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    // Kommentare weg: sie enthalten Klammern und Selektoren als Beispiel.
    const css = block[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
    // Was ausserhalb aller `@layer { ... }` uebrig bleibt.
    let rest = css;
    let vorher;
    do {
      vorher = rest;
      rest = rest.replace(/@layer[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, ' ');
    } while (rest !== vorher);
    const regel = rest.match(/([^{}]+)\{[^{}]*\}/);
    if (regel) {
      errors.push(
        `index.html: \`${regel[1].trim().split('\n').pop().trim()}\` steht ohne Schicht — ` +
          'ungeschichtetes CSS gewinnt gegen jede @layer, auch gegen das Theme'
      );
    }
  }
  return errors;
}

// --- Rollkaesten enthalten, was sie wegrollen --------------------------------

/**
 * Bekannte Rollkaesten ohne `position` -- und warum sie noch stehen.
 *
 * Kein Zaehlwerk, sondern Namen: wird einer geloescht, faellt hier nichts um,
 * und ein NEUER faellt auf, auch wenn zugleich ein alter verschwindet. (Die
 * beiden Zahlen weiter oben in dieser Datei sind Ratschen; eine Liste ist die
 * genauere Form derselben Idee.)
 *
 *   .navigation, .nav-bar, .modal-global, .msb-list
 *       WAREN hier, seit H7 nicht mehr: sie waren toter Code aus der Zeit vor
 *       der Shell aus D1, und die Reparatur war nicht `position`, sondern
 *       Loeschen. Die vier Familien sind mit `.nav-link`, `.msb-*` und ihren
 *       Media-Queries aus `index.css` verschwunden (493 Zeilen). Eine
 *       Ausnahme, die einen toten Kasten am Leben haelt, ist selbst tot.
 *
 *   .ara-menue__inhalt
 *       Lebt, hat aber heute kein absolut gesetztes Kind: in
 *       `packages/marken/` gibt es KEIN `position: absolute` und kein
 *       `sr-only`. Es zu aendern hiesse die Fassung heben und
 *       `browser/marken.js` neu bauen (siehe `scripts/test/marken.py`) --
 *       und das erreicht eine schon ausgelieferte App ohnehin erst beim
 *       naechsten Deploy der App.
 */
const ROLLKAESTEN_OHNE_POSITION = ['.ara-menue__inhalt'];

/**
 * Ein Rollkasten (`overflow: auto|scroll`) muss ein enthaltender Block sein.
 *
 * Der Fund der G1-Abnahme, am 29.08.2026 am Orin gemessen: `overflow`
 * klammert nur ab, was auch IN dem Kasten liegt. Ein absolut gesetztes Kind
 * liegt in seinem naechsten POSITIONIERTEN Vorfahren -- ist der Rollkasten
 * `position: static`, ist das irgendein Kasten weiter oben, und das Kind
 * entkommt: es rollt nicht mit, es wird nicht abgeklammert, und seine Breite
 * zaehlt zur Rollbreite des DOKUMENTS.
 *
 * So schoben die sieben `.sr-only` in den Knoepfen der Mitarbeiter-Tabelle
 * (je 1 px breit, unsichtbar) die Seite bei 1024 px auf 1042 px. Die Abnahme
 * sah „rollt waagerecht", und zu sehen war nichts.
 *
 * Kaesten mit `overflow: hidden` sind ausgenommen: dort ist ein Kind, das
 * herausragt, manchmal gewollt (ein Menue aus seiner Karte). Aus einem
 * ROLLKASTEN ist es das nie -- man kann es nicht erreichen.
 *
 * Gefragt wird je SELEKTOR und nicht je Block: `.navigation` bekommt sein
 * `overflow-x` erst in einer Media-Query, und `position` stuende im
 * Grundblock. Zwei Bloecke, eine Regel.
 */
function checkRollkaesten(cssFiles) {
  const errors = [];
  const ROLLT = /overflow(-x|-y)?\s*:\s*(auto|scroll)/;
  const SETZT_POSITION = /position\s*:\s*(relative|absolute|fixed|sticky)/;
  for (const datei of cssFiles) {
    const inhalt = fs.readFileSync(datei, 'utf8');
    // Alle Deklarationen je Selektor einsammeln, ueber die ganze Datei.
    const jeSelektor = new Map();
    for (const [, selektor, rumpf] of inhalt.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const name = selektor.trim().split('\n').pop().trim();
      jeSelektor.set(name, (jeSelektor.get(name) || '') + rumpf);
    }
    for (const [name, rumpf] of jeSelektor) {
      if (!ROLLT.test(rumpf) || SETZT_POSITION.test(rumpf)) continue;
      if (ROLLKAESTEN_OHNE_POSITION.includes(name)) continue;
      errors.push(
        `${path.relative(REPO, datei)} — \`${name}\` rollt, setzt aber kein ` +
          '`position`: ein absolut gesetztes Kind entkaeme dem Kasten und schoebe die Seite'
      );
    }
  }
  return errors;
}

// --- Main --------------------------------------------------------------------

function main() {
  const cssFiles = CSS_WURZELN.filter(w => fs.existsSync(w)).flatMap(w => findCSSFiles(w));
  let allIssues = [];
  cssFiles.forEach(f => { allIssues = allIssues.concat(analyzeCSS(f)); });

  const forbidden = allIssues.filter(i => i.type === 'FORBIDDEN_COLOR');
  const hardcoded = allIssues.filter(i => i.type === 'HARDCODED_COLOR');
  const transitions = allIssues.filter(i => i.type === 'MISSING_TRANSITION');
  const loginErrors = checkLoginCSS();
  const indexErrors = checkIndexCSS();
  const rollErrors = checkRollkaesten(cssFiles);
  const htmlErrors = checkIndexHtml();

  let failed = false;

  console.log('');
  console.log('===  Design System Validation  ===');
  console.log(`  CSS-Dateien: ${cssFiles.length}`);
  console.log('');

  // 1. Forbidden colors
  if (forbidden.length > 0) {
    console.log(`  FAIL  Verbotene Farben: ${forbidden.length}`);
    forbidden.forEach(i => console.log(`        ${i.file}:${i.line} — ${i.message}`));
    failed = true;
  } else {
    console.log('  PASS  Keine verbotenen Farben');
  }

  // 2. Hardcoded colors (threshold)
  if (hardcoded.length > HARDCODED_COLOR_THRESHOLD) {
    console.log(`  FAIL  Hardcodierte Farben: ${hardcoded.length} (max ${HARDCODED_COLOR_THRESHOLD})`);
    failed = true;
  } else {
    console.log(`  PASS  Hardcodierte Farben: ${hardcoded.length} (max ${HARDCODED_COLOR_THRESHOLD})`);
  }

  // 3. Missing transitions (threshold)
  if (transitions.length > MISSING_TRANSITION_THRESHOLD) {
    console.log(`  FAIL  Fehlende Transitions: ${transitions.length} (max ${MISSING_TRANSITION_THRESHOLD})`);
    failed = true;
  } else {
    console.log(`  PASS  Fehlende Transitions: ${transitions.length} (max ${MISSING_TRANSITION_THRESHOLD})`);
  }

  // 4. Login.css
  if (loginErrors.length > 0) {
    loginErrors.forEach(e => console.log(`  FAIL  ${e}`));
    failed = true;
  } else {
    console.log('  PASS  Login.css konform');
  }

  // 5. index.css
  if (indexErrors.length > 0) {
    indexErrors.forEach(e => console.log(`  FAIL  ${e}`));
    failed = true;
  } else {
    console.log('  PASS  index.css Variablen korrekt');
  }

  // 6. Rollkaesten
  if (rollErrors.length > 0) {
    rollErrors.forEach(e => console.log(`  FAIL  ${e}`));
    failed = true;
  } else {
    console.log('  PASS  Jeder Rollkasten enthaelt, was er wegrollt');
  }

  // 7. index.html
  if (htmlErrors.length > 0) {
    htmlErrors.forEach(e => console.log(`  FAIL  ${e}`));
    failed = true;
  } else {
    console.log('  PASS  index.html hat kein ungeschichtetes CSS');
  }

  console.log('');
  if (failed) {
    console.log('  RESULT: FAILED');
    process.exit(1);
  } else {
    console.log('  RESULT: PASSED');
  }
}

main();
