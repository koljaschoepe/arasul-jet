#!/usr/bin/env node
/**
 * Code Quality & Security Analysis
 *
 * Standalone quality gate — checks JS/JSX source for common issues.
 * Replaces the former codeQuality.test.js Jest suite.
 *
 * Usage: node scripts/test/check-code-quality.js
 * Exit code 0 = pass, 1 = critical errors found
 */

const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', '..', 'apps', 'dashboard-frontend', 'src');

// --- Thresholds (ratchet — never increase) -----------------------------------

const UNHANDLED_PROMISE_THRESHOLD = 170;
const CONSOLE_LOG_THRESHOLD = 20;
const HARDCODED_URL_THRESHOLD = 15;

// --- Helpers -----------------------------------------------------------------

function findJSFiles(dir, files = []) {
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !['node_modules', '__tests__', 'build'].includes(item)) {
      findJSFiles(fullPath, files);
    } else if (item.endsWith('.js') || item.endsWith('.jsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.relative(SRC_PATH, filePath);
  const lines = content.split('\n');
  const issues = [];

  // Memory leaks: useEffect with subscriptions but no cleanup
  const hasSubscription = content.includes('WebSocket') || content.includes('EventSource') || content.includes('setInterval') || content.includes('addEventListener');
  if (hasSubscription && content.includes('useEffect')) {
    const hasCleanup = /return\s*\(\s*\)\s*=>\s*\{/.test(content) || /return\s*\(\)\s*=>/.test(content) || content.includes('return () => {');
    if (!hasCleanup) {
      issues.push({ type: 'POTENTIAL_MEMORY_LEAK', severity: 'ERROR', file: fileName, message: 'useEffect mit Subscription ohne Cleanup' });
    }
  }

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // console.log (outside error handling)
    if (trimmed.includes('console.log(') && !trimmed.startsWith('//')) {
      const ctx = lines.slice(Math.max(0, index - 3), index).join('\n');
      if (!ctx.includes('catch') && !ctx.includes('error') && !ctx.includes('Error')) {
        issues.push({ type: 'CONSOLE_LOG', severity: 'INFO', file: fileName, line: lineNum, message: 'console.log Statement' });
      }
    }

    // dangerouslySetInnerHTML without DOMPurify
    if (trimmed.includes('dangerouslySetInnerHTML')) {
      const hasPurify = content.includes('DOMPurify') || content.includes('dompurify');
      if (!hasPurify) {
        issues.push({ type: 'XSS_RISK', severity: 'ERROR', file: fileName, line: lineNum, message: 'dangerouslySetInnerHTML ohne DOMPurify' });
      }
    }

    // fetch/axios without error handling
    if (trimmed.includes('fetch(') || (trimmed.includes('axios.') && trimmed.includes('('))) {
      const ctx = lines.slice(index, Math.min(lines.length, index + 10)).join('\n');
      if (!ctx.includes('.catch') && !ctx.includes('try {') && !ctx.includes('try{')) {
        issues.push({ type: 'UNHANDLED_PROMISE', severity: 'WARNING', file: fileName, line: lineNum, message: 'Fetch/Axios ohne Error-Handling' });
      }
    }

    // Hardcoded external URLs
    if ((trimmed.includes('http://') || trimmed.includes('https://')) && !trimmed.startsWith('//') && !trimmed.includes('localhost')) {
      issues.push({ type: 'HARDCODED_URL', severity: 'WARNING', file: fileName, line: lineNum, message: 'Hardcodierte URL' });
    }
  });

  return issues;
}

// --- Security checks ---------------------------------------------------------

function securityChecks(jsFiles) {
  const errors = [];
  let usesDangerous = false;
  let hasDOMPurify = false;
  let hasEval = false;
  let hasNewFunction = false;

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const name = path.relative(SRC_PATH, file);
    if (content.includes('dangerouslySetInnerHTML')) usesDangerous = true;
    if (content.includes('DOMPurify') || content.includes('dompurify')) hasDOMPurify = true;
    if (content.includes('eval(')) { hasEval = true; errors.push(`eval() in ${name}`); }
    if (/new\s+Function\s*\(/.test(content)) { hasNewFunction = true; errors.push(`new Function() in ${name}`); }
  }

  if (usesDangerous && !hasDOMPurify) errors.push('dangerouslySetInnerHTML ohne DOMPurify');
  return errors;
}

// --- Main --------------------------------------------------------------------

function main() {
  const jsFiles = findJSFiles(SRC_PATH);
  let allIssues = [];
  jsFiles.forEach(f => { allIssues = allIssues.concat(analyzeFile(f)); });

  const memLeaks = allIssues.filter(i => i.type === 'POTENTIAL_MEMORY_LEAK');
  const xss = allIssues.filter(i => i.type === 'XSS_RISK');
  const consoleLogs = allIssues.filter(i => i.type === 'CONSOLE_LOG');
  const promises = allIssues.filter(i => i.type === 'UNHANDLED_PROMISE');
  const urls = allIssues.filter(i => i.type === 'HARDCODED_URL');
  const secErrors = securityChecks(jsFiles);

  let failed = false;

  console.log('');
  console.log('===  Code Quality & Security Analysis  ===');
  console.log(`  JS/JSX-Dateien: ${jsFiles.length}`);
  console.log('');

  // Critical: Memory leaks
  if (memLeaks.length > 0) {
    console.log(`  FAIL  Memory Leaks: ${memLeaks.length}`);
    memLeaks.forEach(i => console.log(`        ${i.file} — ${i.message}`));
    failed = true;
  } else {
    console.log('  PASS  Keine Memory Leaks');
  }

  // Critical: XSS
  if (xss.length > 0) {
    console.log(`  FAIL  XSS-Risiken: ${xss.length}`);
    xss.forEach(i => console.log(`        ${i.file}:${i.line} — ${i.message}`));
    failed = true;
  } else {
    console.log('  PASS  Keine XSS-Risiken');
  }

  // Critical: Security
  if (secErrors.length > 0) {
    secErrors.forEach(e => console.log(`  FAIL  Security: ${e}`));
    failed = true;
  } else {
    console.log('  PASS  Security Checks bestanden');
  }

  // Threshold: Unhandled promises
  if (promises.length > UNHANDLED_PROMISE_THRESHOLD) {
    console.log(`  FAIL  Unhandled Promises: ${promises.length} (max ${UNHANDLED_PROMISE_THRESHOLD})`);
    failed = true;
  } else {
    console.log(`  PASS  Unhandled Promises: ${promises.length} (max ${UNHANDLED_PROMISE_THRESHOLD})`);
  }

  // Threshold: Console logs
  if (consoleLogs.length > CONSOLE_LOG_THRESHOLD) {
    console.log(`  FAIL  Console.log: ${consoleLogs.length} (max ${CONSOLE_LOG_THRESHOLD})`);
    failed = true;
  } else {
    console.log(`  PASS  Console.log: ${consoleLogs.length} (max ${CONSOLE_LOG_THRESHOLD})`);
  }

  // Threshold: Hardcoded URLs
  if (urls.length > HARDCODED_URL_THRESHOLD) {
    console.log(`  FAIL  Hardcoded URLs: ${urls.length} (max ${HARDCODED_URL_THRESHOLD})`);
    failed = true;
  } else {
    console.log(`  PASS  Hardcoded URLs: ${urls.length} (max ${HARDCODED_URL_THRESHOLD})`);
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
