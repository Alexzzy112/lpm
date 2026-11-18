import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, 'dataset');
const zip = path.join(dir, 'student-performance.zip');
mkdirSync(dir, { recursive: true });
if (existsSync(path.join(dir, 'student-por.csv'))) {
  console.log('Portuguese dataset already present.');
  process.exit(0);
}
const url = 'https://archive.ics.uci.edu/static/public/320/student+performance.zip';
await pipeline(await new Promise((resolve, reject) => https.get(url, response => {
  if (response.statusCode !== 200) return reject(new Error(`UCI returned HTTP ${response.statusCode}`));
  resolve(response);
}).on('error', reject)), createWriteStream(zip));
if (process.platform === 'win32') execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`]);
else execFileSync('unzip', ['-o', zip, '-d', dir]);
if (!existsSync(path.join(dir, 'student-por.csv'))) throw new Error('UCI archive did not contain student-por.csv');
console.log('Downloaded UCI Student Performance Portuguese records (649 rows).');
