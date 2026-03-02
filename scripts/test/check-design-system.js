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

const SRC_PATH = path.join(__dirname, '..', '..', 'apps', 'dashboard-frontend', 'src');

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

const HARDCODED_COLOR_THRESHOLD = 150;
const MISSING_TRANSITION_THRESHOLD = 230;

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
  const fileName = path.relative(SRC_PATH, filePath);
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

    // Hardcoded hex colors
    const hexMatches = line.match(/#[0-9A-Fa-f]{3,6}(?![0-9A-Fa-f])/g);
    if (hexMatches && !line.includes('var(--') && !line.includes(':root')) {
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
  const content = fs.readFileSync(indexPath, 'utf8');
  const lower = content.toLowerCase();

  if (!lower.includes('--primary-color: #45adff')) errors.push('Primary Color nicht #45ADFF');
  if (!lower.includes('--bg-dark: #101923')) errors.push('Background Dark nicht #101923');
  if (!lower.includes('--text-primary')) errors.push('--text-primary Variable fehlt');
  return errors;
}

// --- Main --------------------------------------------------------------------

function main() {
  const cssFiles = findCSSFiles(SRC_PATH);
  let allIssues = [];
  cssFiles.forEach(f => { allIssues = allIssues.concat(analyzeCSS(f)); });

  const forbidden = allIssues.filter(i => i.type === 'FORBIDDEN_COLOR');
  const hardcoded = allIssues.filter(i => i.type === 'HARDCODED_COLOR');
  const transitions = allIssues.filter(i => i.type === 'MISSING_TRANSITION');
  const loginErrors = checkLoginCSS();
  const indexErrors = checkIndexCSS();

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

  console.log('');
  if (failed) {
    console.log('  RESULT: FAILED');
    process.exit(1);
  } else {
    console.log('  RESULT: PASSED');
  }
}

main();
