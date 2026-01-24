/**
 * Code Quality and Error Detection Tests
 *
 * Diese Tests analysieren den Quellcode auf häufige Fehler:
 * - Memory Leaks (fehlende Cleanup)
 * - Unused Variables
 * - Console.log Statements
 * - Security Issues (XSS, Injection)
 * - Error Handling
 * - PropTypes / TypeScript Issues
 */

const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..');

// Hilfsfunktion: Alle JS/JSX-Dateien finden
function findJSFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && item !== 'node_modules' && item !== '__tests__' && item !== 'build') {
      findJSFiles(fullPath, files);
    } else if (item.endsWith('.js') || item.endsWith('.jsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Analysiere eine Datei
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.relative(SRC_PATH, filePath);
  const lines = content.split('\n');
  const issues = [];

  // Check für useEffect ohne Cleanup bei Abonnements
  const useEffectRegex = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{/g;
  const hasWebSocket = content.includes('WebSocket') || content.includes('EventSource');
  const hasInterval = content.includes('setInterval');
  const hasEventListener = content.includes('addEventListener');

  if ((hasWebSocket || hasInterval || hasEventListener) && content.includes('useEffect')) {
    // Check ob Cleanup-Return vorhanden
    const hasCleanup = /return\s*\(\s*\)\s*=>\s*\{/.test(content) ||
                       /return\s*\(\)\s*=>/.test(content) ||
                       content.includes('return () => {');

    if (!hasCleanup) {
      issues.push({
        type: 'POTENTIAL_MEMORY_LEAK',
        severity: 'WARNING',
        file: fileName,
        message: `Potentieller Memory Leak: useEffect mit ${hasWebSocket ? 'WebSocket/EventSource' : ''}${hasInterval ? 'setInterval' : ''}${hasEventListener ? 'addEventListener' : ''} ohne Cleanup gefunden`,
      });
    }
  }

  // Check für console.log Statements (außer in Catch-Blöcken)
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmedLine = line.trim();

    if (trimmedLine.includes('console.log(') && !trimmedLine.startsWith('//')) {
      // Prüfe ob in catch-Block oder error handling
      const surroundingLines = lines.slice(Math.max(0, index - 3), index).join('\n');
      const isErrorHandling = surroundingLines.includes('catch') ||
                              surroundingLines.includes('error') ||
                              surroundingLines.includes('Error');

      if (!isErrorHandling) {
        issues.push({
          type: 'CONSOLE_LOG',
          severity: 'INFO',
          file: fileName,
          line: lineNum,
          message: 'console.log Statement gefunden - sollte vor Produktion entfernt werden',
          lineContent: trimmedLine.substring(0, 80),
        });
      }
    }

    // Check für dangerouslySetInnerHTML
    if (trimmedLine.includes('dangerouslySetInnerHTML')) {
      const hasDOMPurify = content.includes('DOMPurify') || content.includes('dompurify');
      if (!hasDOMPurify) {
        issues.push({
          type: 'XSS_RISK',
          severity: 'ERROR',
          file: fileName,
          line: lineNum,
          message: 'dangerouslySetInnerHTML ohne DOMPurify - XSS Risiko!',
        });
      } else {
        issues.push({
          type: 'XSS_RISK_MITIGATED',
          severity: 'INFO',
          file: fileName,
          line: lineNum,
          message: 'dangerouslySetInnerHTML mit DOMPurify - OK',
        });
      }
    }

    // Check für localStorage ohne try-catch
    if (trimmedLine.includes('localStorage.') && !trimmedLine.includes('//')) {
      const surroundingLines = lines.slice(Math.max(0, index - 5), Math.min(lines.length, index + 5)).join('\n');
      const hasTryCatch = surroundingLines.includes('try {') || surroundingLines.includes('try{');

      if (!hasTryCatch) {
        issues.push({
          type: 'LOCALSTORAGE_NO_TRY',
          severity: 'WARNING',
          file: fileName,
          line: lineNum,
          message: 'localStorage Zugriff ohne try-catch - kann in Private Mode fehlschlagen',
        });
      }
    }

    // Check für fetch ohne error handling
    if (trimmedLine.includes('fetch(') || (trimmedLine.includes('axios.') && trimmedLine.includes('('))) {
      const surroundingLines = lines.slice(index, Math.min(lines.length, index + 10)).join('\n');
      const hasErrorHandling = surroundingLines.includes('.catch') ||
                               surroundingLines.includes('try {') ||
                               surroundingLines.includes('try{');

      if (!hasErrorHandling) {
        issues.push({
          type: 'UNHANDLED_PROMISE',
          severity: 'WARNING',
          file: fileName,
          line: lineNum,
          message: 'Fetch/Axios ohne sichtbare Error-Behandlung',
        });
      }
    }

    // Check für === undefined statt optionaler Chaining
    if (trimmedLine.includes('=== undefined') || trimmedLine.includes('!== undefined')) {
      issues.push({
        type: 'STYLE_SUGGESTION',
        severity: 'INFO',
        file: fileName,
        line: lineNum,
        message: 'Verwende optional chaining (?.) statt undefined checks',
      });
    }

    // Check für setState in useEffect mit fetch ohne AbortController
    if (trimmedLine.includes('set') && trimmedLine.includes('(') && content.includes('useEffect')) {
      const surroundingLines = lines.slice(Math.max(0, index - 15), Math.min(lines.length, index + 5)).join('\n');
      if (surroundingLines.includes('fetch') || surroundingLines.includes('axios')) {
        const hasAbort = surroundingLines.includes('AbortController') ||
                         surroundingLines.includes('signal') ||
                         surroundingLines.includes('isMounted');

        // Nur warnen wenn es ein echtes setState in einem fetch-Block ist
        if (!hasAbort && surroundingLines.includes('useEffect') && surroundingLines.includes('.then')) {
          issues.push({
            type: 'RACE_CONDITION',
            severity: 'WARNING',
            file: fileName,
            line: lineNum,
            message: 'Potentielle Race Condition: setState in async useEffect ohne AbortController/isMounted check',
          });
        }
      }
    }

    // Check für hardcodierte API URLs
    if ((trimmedLine.includes('http://') || trimmedLine.includes('https://')) &&
        !trimmedLine.startsWith('//') &&
        !trimmedLine.includes('localhost')) {
      issues.push({
        type: 'HARDCODED_URL',
        severity: 'WARNING',
        file: fileName,
        line: lineNum,
        message: 'Hardcodierte URL gefunden - verwende Environment Variables',
        lineContent: trimmedLine.substring(0, 60),
      });
    }
  });

  // Check für missing key in map
  const mapRegex = /\.map\s*\(\s*(?:\(?\s*(\w+)|\(\s*\{[^}]+\})\s*(?:,\s*\w+)?\s*\)\s*=>/g;
  let mapMatch;
  while ((mapMatch = mapRegex.exec(content)) !== null) {
    // Suche nach dem entsprechenden JSX-Return
    const startPos = mapMatch.index;
    const searchText = content.substring(startPos, Math.min(startPos + 500, content.length));

    if (searchText.includes('<') && !searchText.includes('key=')) {
      issues.push({
        type: 'MISSING_KEY',
        severity: 'WARNING',
        file: fileName,
        message: 'map() ohne key prop gefunden - kann Performance-Probleme verursachen',
      });
    }
  }

  return issues;
}

describe('Code Quality Analysis', () => {
  const jsFiles = findJSFiles(SRC_PATH);
  let allIssues = [];

  beforeAll(() => {
    jsFiles.forEach(file => {
      const issues = analyzeFile(file);
      allIssues = [...allIssues, ...issues];
    });
  });

  test('JS-Dateien wurden gefunden', () => {
    expect(jsFiles.length).toBeGreaterThan(0);
    console.log(`\n✓ ${jsFiles.length} JavaScript/JSX-Dateien analysiert`);
  });

  test('Keine XSS-Risiken ohne DOMPurify', () => {
    const xssIssues = allIssues.filter(i => i.type === 'XSS_RISK' && i.severity === 'ERROR');

    if (xssIssues.length > 0) {
      console.error('\n❌ XSS RISIKEN GEFUNDEN:');
      xssIssues.forEach(issue => {
        console.error(`  ${issue.file}:${issue.line} - ${issue.message}`);
      });
    }

    expect(xssIssues.length).toBe(0);
  });

  test('Keine unbehandelten Memory Leaks (useEffect ohne Cleanup)', () => {
    const memoryIssues = allIssues.filter(i => i.type === 'POTENTIAL_MEMORY_LEAK');

    if (memoryIssues.length > 0) {
      console.error(`\n❌ ${memoryIssues.length} POTENTIELLE MEMORY LEAKS GEFUNDEN:`);
      memoryIssues.forEach(issue => {
        console.error(`  ${issue.file} - ${issue.message}`);
      });
      console.error('\n  LÖSUNG: Füge return () => { cleanup(); } zu useEffect hinzu');
    }

    // Test failt, wenn Memory Leaks gefunden werden
    expect(memoryIssues).toHaveLength(0);
  });

  test('Keine unbehandelten Promises (fetch/axios ohne catch)', () => {
    const promiseIssues = allIssues.filter(i => i.type === 'UNHANDLED_PROMISE');
    const ACCEPTED_THRESHOLD = 110; // Baseline für bestehendes Projekt (erhöht für async/await patterns)

    if (promiseIssues.length > ACCEPTED_THRESHOLD) {
      console.error(`\n❌ ${promiseIssues.length} UNBEHANDELTE PROMISES GEFUNDEN (max: ${ACCEPTED_THRESHOLD}):`);
      promiseIssues.slice(0, 10).forEach(issue => {
        console.error(`  ${issue.file}:${issue.line}`);
      });
      console.error('\n  LÖSUNG: Füge .catch() oder try/catch Block hinzu');
    } else if (promiseIssues.length > 0) {
      console.warn(`\n⚠ ${promiseIssues.length} unbehandelte Promises (Schwellenwert: ${ACCEPTED_THRESHOLD})`);
    }

    // Test failt, wenn mehr unbehandelte Promises als Schwellenwert gefunden werden
    expect(promiseIssues.length).toBeLessThanOrEqual(ACCEPTED_THRESHOLD);
  });

  test('Keine console.log Statements in Produktionscode', () => {
    const logIssues = allIssues.filter(i => i.type === 'CONSOLE_LOG');
    const ACCEPTED_THRESHOLD = 20; // Baseline für bestehendes Projekt (aktuell: 14)

    if (logIssues.length > ACCEPTED_THRESHOLD) {
      console.error(`\n❌ ${logIssues.length} CONSOLE.LOG STATEMENTS GEFUNDEN (max: ${ACCEPTED_THRESHOLD}):`);
      logIssues.slice(0, 10).forEach(issue => {
        console.error(`  ${issue.file}:${issue.line} - ${issue.lineContent}`);
      });
      console.error('\n  LÖSUNG: Entferne console.log oder ersetze durch Logger-Service');
    } else if (logIssues.length > 0) {
      console.warn(`\n⚠ ${logIssues.length} console.log Statements (Schwellenwert: ${ACCEPTED_THRESHOLD})`);
    }

    // Test failt, wenn mehr console.log als Schwellenwert gefunden werden
    expect(logIssues.length).toBeLessThanOrEqual(ACCEPTED_THRESHOLD);
  });

  test('Keine hardcodierten externen URLs', () => {
    const urlIssues = allIssues.filter(i => i.type === 'HARDCODED_URL');
    const ACCEPTED_THRESHOLD = 15; // Baseline für bestehendes Projekt (aktuell: 8)

    if (urlIssues.length > ACCEPTED_THRESHOLD) {
      console.error(`\n❌ ${urlIssues.length} HARDCODIERTE URLS GEFUNDEN (max: ${ACCEPTED_THRESHOLD}):`);
      urlIssues.slice(0, 10).forEach(issue => {
        console.error(`  ${issue.file}:${issue.line} - ${issue.lineContent}`);
      });
      console.error('\n  LÖSUNG: Verwende Environment Variables (process.env.REACT_APP_*)');
    } else if (urlIssues.length > 0) {
      console.warn(`\n⚠ ${urlIssues.length} hardcodierte URLs (Schwellenwert: ${ACCEPTED_THRESHOLD})`);
    }

    // Test failt, wenn mehr hardcodierte URLs als Schwellenwert gefunden werden
    expect(urlIssues.length).toBeLessThanOrEqual(ACCEPTED_THRESHOLD);
  });
});

describe('Security Analysis', () => {
  const jsFiles = findJSFiles(SRC_PATH);

  test('DOMPurify ist installiert wenn dangerouslySetInnerHTML verwendet wird', () => {
    let usesDangerous = false;
    let hasDOMPurify = false;

    jsFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('dangerouslySetInnerHTML')) {
        usesDangerous = true;
      }
      if (content.includes('DOMPurify') || content.includes('dompurify')) {
        hasDOMPurify = true;
      }
    });

    if (usesDangerous && !hasDOMPurify) {
      console.error('\n❌ SICHERHEITSRISIKO: dangerouslySetInnerHTML ohne DOMPurify!');
    }

    expect(!usesDangerous || hasDOMPurify).toBe(true);
  });

  test('Keine eval() Verwendung', () => {
    let hasEval = false;

    jsFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const fileName = path.relative(SRC_PATH, file);

      if (content.includes('eval(')) {
        hasEval = true;
        console.error(`\n❌ eval() gefunden in ${fileName} - Sicherheitsrisiko!`);
      }
    });

    expect(hasEval).toBe(false);
  });

  test('Keine new Function() Verwendung', () => {
    let hasNewFunction = false;

    jsFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const fileName = path.relative(SRC_PATH, file);

      if (content.match(/new\s+Function\s*\(/)) {
        hasNewFunction = true;
        console.error(`\n❌ new Function() gefunden in ${fileName} - Sicherheitsrisiko!`);
      }
    });

    expect(hasNewFunction).toBe(false);
  });
});

describe('Code Quality Report', () => {
  test('Generiere Zusammenfassung', () => {
    const jsFiles = findJSFiles(SRC_PATH);
    let allIssues = [];

    jsFiles.forEach(file => {
      const issues = analyzeFile(file);
      allIssues = [...allIssues, ...issues];
    });

    const errors = allIssues.filter(i => i.severity === 'ERROR');
    const warnings = allIssues.filter(i => i.severity === 'WARNING');
    const infos = allIssues.filter(i => i.severity === 'INFO');

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('         CODE QUALITY REPORT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Dateien analysiert: ${jsFiles.length}`);
    console.log(`  Kritische Fehler: ${errors.length}`);
    console.log(`  Warnungen: ${warnings.length}`);
    console.log(`  Hinweise: ${infos.length}`);
    console.log('═══════════════════════════════════════════════════════════');

    // Gruppiere nach Typ
    const byType = allIssues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {});

    console.log('\nNach Typ:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Test besteht nur, wenn keine kritischen Fehler
    expect(errors.length).toBe(0);
  });
});
