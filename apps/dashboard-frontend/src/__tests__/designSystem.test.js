/**
 * Design System Validation Tests
 *
 * Diese Tests überprüfen, dass alle CSS-Dateien den Design System Richtlinien entsprechen.
 * Basierend auf: docs/DESIGN_SYSTEM.md
 *
 * KRITISCHE FEHLER werden als failing tests angezeigt.
 */

const fs = require('fs');
const path = require('path');

// Design System Farben (aus DESIGN_SYSTEM.md)
const DESIGN_SYSTEM = {
  primary: {
    color: '#45ADFF',
    hover: '#6EC4FF',
    active: '#2D8FD9',
    muted: 'rgba(69, 173, 255, 0.15)',
    glow: 'rgba(69, 173, 255, 0.4)',
  },
  backgrounds: {
    dark: '#101923',
    card: '#1A2330',
    cardHover: '#222D3D',
    elevated: '#2A3544',
  },
  borders: {
    color: '#2A3544',
    subtle: '#1D2835',
    strong: '#3A4554',
  },
  text: {
    primary: '#F8FAFC',
    secondary: '#CBD5E1',
    muted: '#94A3B8',
    disabled: '#64748B',
  },
  status: {
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },
};

// Verbotene Farben (sollten NICHT als Primärfarbe verwendet werden)
// Hinweis: Lila/Cyan sind für Charts und Sekundärzwecke erlaubt
const FORBIDDEN_COLORS = [
  '#00FF88', // Altes Grün
  '#00ff88',
  '#00cc6f', // Altes Grün Hover
  '#00FF136', // Ähnliche grüne Farben
  'rgba(0, 255, 136', // Grüne RGBA
  // '#8b5cf6' und '#06b6d4' sind für Charts/Sekundärzwecke erlaubt
];

// Pfad zur Frontend-Quelle
const SRC_PATH = path.join(__dirname, '..');

// Hilfsfunktion: Alle CSS-Dateien finden
function findCSSFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
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

// Hilfsfunktion: CSS-Datei analysieren
function analyzeCSS(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.relative(SRC_PATH, filePath);
  const issues = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const lowerLine = line.toLowerCase();

    // Check für verbotene Farben
    FORBIDDEN_COLORS.forEach(forbiddenColor => {
      if (lowerLine.includes(forbiddenColor.toLowerCase())) {
        // Ignoriere Kommentare
        if (
          !line.trim().startsWith('/*') &&
          !line.trim().startsWith('*') &&
          !line.trim().startsWith('//')
        ) {
          issues.push({
            type: 'FORBIDDEN_COLOR',
            severity: 'ERROR',
            line: lineNum,
            file: fileName,
            message: `Verbotene Farbe gefunden: "${forbiddenColor}" - Verwende stattdessen #45ADFF (Primary) oder Design System Farben`,
            lineContent: line.trim(),
          });
        }
      }
    });

    // Check für hardcodierte Farben statt CSS-Variablen
    const hexColorRegex = /#[0-9A-Fa-f]{3,6}(?![0-9A-Fa-f])/g;
    const matches = line.match(hexColorRegex);
    if (matches && !line.includes('var(--') && !line.includes(':root')) {
      matches.forEach(match => {
        const normalizedMatch = match.toLowerCase();
        // Erlaube Design System Farben
        const allowedColors = [
          '#45adff',
          '#6ec4ff',
          '#2d8fd9', // Primary
          '#101923',
          '#1a2330',
          '#222d3d',
          '#2a3544',
          '#3a4554', // Backgrounds
          '#f8fafc',
          '#cbd5e1',
          '#94a3b8',
          '#64748b', // Text
          '#22c55e',
          '#f59e0b',
          '#ef4444', // Status
          '#10b981', // Alternativer Success (erlaubt)
          '#3498db',
          '#6ec4ff', // Blaue Varianten
          '#000',
          '#000000',
          '#fff',
          '#ffffff', // Schwarz/Weiß
          '#1d2835', // Border subtle
        ];

        if (!allowedColors.includes(normalizedMatch)) {
          // Nur als Warning, da einige Farben kontextabhängig sind
          issues.push({
            type: 'HARDCODED_COLOR',
            severity: 'WARNING',
            line: lineNum,
            file: fileName,
            message: `Hardcodierte Farbe "${match}" gefunden - Prüfen, ob CSS-Variable verwendet werden sollte`,
            lineContent: line.trim(),
          });
        }
      });
    }

    // Check für fehlende Transitions bei interaktiven Elementen
    if (
      lowerLine.includes(':hover') ||
      lowerLine.includes(':focus') ||
      lowerLine.includes(':active')
    ) {
      // Prüfe ob in der Nähe eine transition definiert ist (±10 Zeilen)
      const surroundingLines = lines
        .slice(Math.max(0, index - 10), Math.min(lines.length, index + 10))
        .join('\n');
      if (!surroundingLines.includes('transition')) {
        issues.push({
          type: 'MISSING_TRANSITION',
          severity: 'WARNING',
          line: lineNum,
          file: fileName,
          message: `Pseudo-Klasse ohne transition gefunden - Füge "transition: all 0.2s ease;" hinzu`,
          lineContent: line.trim(),
        });
      }
    }

    // Check für falsche Success-Farbe
    if (lowerLine.includes('#10b981') && !lowerLine.includes('var(--success-color)')) {
      issues.push({
        type: 'WRONG_SUCCESS_COLOR',
        severity: 'WARNING',
        line: lineNum,
        file: fileName,
        message: `Verwende #22C55E statt #10b981 für Success-Status (oder besser: var(--status-success))`,
        lineContent: line.trim(),
      });
    }
  });

  return issues;
}

describe('Design System Validation', () => {
  const cssFiles = findCSSFiles(SRC_PATH);
  let allIssues = [];

  beforeAll(() => {
    cssFiles.forEach(file => {
      const issues = analyzeCSS(file);
      allIssues = [...allIssues, ...issues];
    });
  });

  test('CSS-Dateien wurden gefunden', () => {
    expect(cssFiles.length).toBeGreaterThan(0);
    console.log(`\n✓ ${cssFiles.length} CSS-Dateien gefunden`);
  });

  test('Keine verbotenen Farben verwendet', () => {
    const forbiddenColorIssues = allIssues.filter(i => i.type === 'FORBIDDEN_COLOR');

    if (forbiddenColorIssues.length > 0) {
      console.error('\n❌ VERBOTENE FARBEN GEFUNDEN:');
      forbiddenColorIssues.forEach(issue => {
        console.error(`  ${issue.file}:${issue.line} - ${issue.message}`);
        console.error(`    Code: ${issue.lineContent}`);
      });
    }

    expect(forbiddenColorIssues.length).toBe(0);
  });

  test('Hardcodierte Farben sollten CSS-Variablen verwenden', () => {
    const hardcodedIssues = allIssues.filter(i => i.type === 'HARDCODED_COLOR');

    // Akzeptierter Schwellenwert für bestehende hardcodierte Farben
    // Dieser Wert sollte bei neuen Änderungen nicht steigen
    const ACCEPTED_THRESHOLD = 150; // Anpassen nach Baseline-Messung (aktuell: 135)

    if (hardcodedIssues.length > ACCEPTED_THRESHOLD) {
      console.error(
        `\n❌ ZU VIELE HARDCODIERTE FARBEN: ${hardcodedIssues.length} (max: ${ACCEPTED_THRESHOLD})`
      );
      hardcodedIssues.slice(0, 15).forEach(issue => {
        console.error(`  ${issue.file}:${issue.line} - ${issue.message}`);
      });
      console.error(
        '\n  LÖSUNG: Verwende CSS-Variablen aus dem Design System (z.B. var(--primary-color))'
      );
    } else if (hardcodedIssues.length > 0) {
      console.warn(
        `\n⚠ ${hardcodedIssues.length} hardcodierte Farben gefunden (Schwellenwert: ${ACCEPTED_THRESHOLD})`
      );
    }

    // Test failt, wenn mehr hardcodierte Farben als der Schwellenwert existieren
    expect(hardcodedIssues.length).toBeLessThanOrEqual(ACCEPTED_THRESHOLD);
  });

  test('Transitions für Hover/Focus-States vorhanden', () => {
    const transitionIssues = allIssues.filter(i => i.type === 'MISSING_TRANSITION');

    // Akzeptierter Schwellenwert für fehlende Transitions
    // Dieser Wert sollte bei neuen Änderungen nicht steigen
    const ACCEPTED_THRESHOLD = 230; // Angepasst für aktuelle Codebase (224 gefunden)

    if (transitionIssues.length > ACCEPTED_THRESHOLD) {
      console.error(
        `\n❌ ZU VIELE FEHLENDE TRANSITIONS: ${transitionIssues.length} (max: ${ACCEPTED_THRESHOLD})`
      );
      transitionIssues.slice(0, 10).forEach(issue => {
        console.error(`  ${issue.file}:${issue.line}`);
      });
      console.error(
        '\n  LÖSUNG: Füge "transition: all 0.2s ease;" zu interaktiven Elementen hinzu'
      );
    } else if (transitionIssues.length > 0) {
      console.warn(
        `\n⚠ ${transitionIssues.length} fehlende Transitions gefunden (Schwellenwert: ${ACCEPTED_THRESHOLD})`
      );
    }

    // Test failt, wenn mehr fehlende Transitions als der Schwellenwert existieren
    expect(transitionIssues.length).toBeLessThanOrEqual(ACCEPTED_THRESHOLD);
  });
});

// Spezifische CSS-Datei Tests
describe('Login.css Design System Conformity', () => {
  const loginCSSPath = path.join(SRC_PATH, 'features', 'system', 'Login.css');
  let content;

  beforeAll(() => {
    if (fs.existsSync(loginCSSPath)) {
      content = fs.readFileSync(loginCSSPath, 'utf8');
    }
  });

  test('Login.css existiert', () => {
    expect(fs.existsSync(loginCSSPath)).toBe(true);
  });

  test('Keine grünen Hover-Farben im Login (#00cc6f)', () => {
    if (content) {
      const hasGreenHover = content.toLowerCase().includes('#00cc6f');
      if (hasGreenHover) {
        console.error('\n❌ FEHLER: Login.css verwendet grüne Hover-Farbe #00cc6f');
        console.error('   Ersetze durch: #6EC4FF (--primary-hover)');
      }
      expect(hasGreenHover).toBe(false);
    }
  });

  test('Keine grünen Box-Shadows im Login', () => {
    if (content) {
      const hasGreenShadow = content.toLowerCase().includes('rgba(0, 255, 136');
      if (hasGreenShadow) {
        console.error('\n❌ FEHLER: Login.css verwendet grüne Box-Shadows');
        console.error('   Ersetze durch: rgba(69, 173, 255, 0.3) (--primary-glow)');
      }
      expect(hasGreenShadow).toBe(false);
    }
  });

  test('Focus-Ring verwendet blaue Farbe', () => {
    if (content) {
      const hasBlueFocus =
        content.includes('rgba(69, 173, 255') ||
        content.includes('#45ADFF') ||
        content.includes('var(--primary');
      const hasGreenFocus =
        content.toLowerCase().includes('rgba(0, 255, 136') ||
        content.toLowerCase().includes('rgba(0,255,136');

      if (hasGreenFocus) {
        console.error('\n❌ FEHLER: Login.css verwendet grüne Focus-Farbe');
        console.error('   Ersetze durch: rgba(69, 173, 255, 0.15)');
      }

      expect(hasGreenFocus).toBe(false);
    }
  });
});

describe('index.css Design System Variables', () => {
  const indexCSSPath = path.join(SRC_PATH, 'index.css');
  let content;

  beforeAll(() => {
    if (fs.existsSync(indexCSSPath)) {
      content = fs.readFileSync(indexCSSPath, 'utf8');
    }
  });

  test('index.css existiert', () => {
    expect(fs.existsSync(indexCSSPath)).toBe(true);
  });

  test('Primary Color ist korrekt (#45ADFF)', () => {
    if (content) {
      const hasPrimaryColor =
        content.includes('--primary-color: #45ADFF') ||
        content.toLowerCase().includes('--primary-color: #45adff');
      expect(hasPrimaryColor).toBe(true);
    }
  });

  test('Background Dark ist korrekt (#101923)', () => {
    if (content) {
      const hasBgDark =
        content.includes('--bg-dark: #101923') ||
        content.toLowerCase().includes('--bg-dark: #101923');
      expect(hasBgDark).toBe(true);
    }
  });

  test('Text Primary ist korrekt (#F8FAFC oder ähnlich)', () => {
    if (content) {
      const hasTextPrimary =
        content.toLowerCase().includes('--text-primary') &&
        (content.toLowerCase().includes('#f8fafc') || content.toLowerCase().includes('#e4e4e7'));
      expect(hasTextPrimary).toBe(true);
    }
  });
});

// Report Generator
describe('Design System Report', () => {
  test('Generiere Zusammenfassung', () => {
    const cssFiles = findCSSFiles(SRC_PATH);
    let allIssues = [];

    cssFiles.forEach(file => {
      const issues = analyzeCSS(file);
      allIssues = [...allIssues, ...issues];
    });

    const errors = allIssues.filter(i => i.severity === 'ERROR');
    const warnings = allIssues.filter(i => i.severity === 'WARNING');

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('         DESIGN SYSTEM VALIDATION REPORT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  CSS-Dateien analysiert: ${cssFiles.length}`);
    console.log(`  Kritische Fehler: ${errors.length}`);
    console.log(`  Warnungen: ${warnings.length}`);
    console.log('═══════════════════════════════════════════════════════════');

    if (errors.length > 0) {
      console.log('\n🔴 KRITISCHE FEHLER (müssen behoben werden):');
      errors.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${issue.file}:${issue.line}`);
        console.log(`     ${issue.message}`);
      });
    }

    if (warnings.length > 0) {
      console.log(`\n🟡 WARNUNGEN (${warnings.length} - Top 10):`);
      warnings.slice(0, 10).forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${issue.file}:${issue.line}`);
        console.log(`     ${issue.message}`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Test besteht nur, wenn keine kritischen Fehler
    expect(errors.length).toBe(0);
  });
});
