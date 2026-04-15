/**
 * Process Helpers
 *
 * Safe wrappers around child_process.spawn for piping:
 * - spawnToFile: run a command and write stdout to a file
 * - spawnFromFile: run a command with stdin from a file
 *
 * These avoid shell=true and prevent command injection.
 * Extracted from services/app/updateService.js.
 */

const fs = require('fs');
const { spawn } = require('child_process');

/**
 * Run a command and write stdout to a file (replaces exec with shell redirection)
 * @param {string} command - Command to run
 * @param {string[]} args - Arguments array
 * @param {string} outputPath - File to write stdout to
 * @returns {Promise<void>}
 */
function spawnToFile(command, args, outputPath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outputPath);
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.pipe(out);
    let stderr = '';
    proc.stderr.on('data', data => {
      stderr += data;
    });
    proc.on('close', code => {
      out.close();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      }
    });
    proc.on('error', reject);
  });
}

/**
 * Run a command with stdin from a file (replaces exec with shell redirection)
 * @param {string} command - Command to run
 * @param {string[]} args - Arguments array
 * @param {string} inputPath - File to pipe to stdin
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function spawnFromFile(command, args, inputPath) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(inputPath);
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    input.pipe(proc.stdin);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', data => {
      stdout += data;
    });
    proc.stderr.on('data', data => {
      stderr += data;
    });
    proc.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      }
    });
    proc.on('error', reject);
  });
}

module.exports = { spawnToFile, spawnFromFile };
