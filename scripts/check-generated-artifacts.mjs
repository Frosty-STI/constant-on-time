import { lstat, readFile } from 'node:fs/promises';
import { isProbablyBinary, repositoryFiles } from './lib/repository-files.mjs';

const errors = [];
const files = await repositoryFiles();
const forbiddenPaths = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /(^|\/)playwright-report\//,
  /(^|\/)test-results\//,
  /(^|\/)\.vite\//,
  /(^|\/)\.cache\//,
  /\.tsbuildinfo$/,
  /\.log$/,
  /(^|\/)\.DS_Store$/,
  /(?:~|\.bak|\.orig|\.rej)$/,
];

for (const file of files) {
  if (forbiddenPaths.some((pattern) => pattern.test(file))) {
    errors.push(`${file}: generated, cache, log, or editor artifact must not be committed`);
    continue;
  }
  const info = await lstat(file);
  if (info.isSymbolicLink()) {
    errors.push(`${file}: symbolic links are not allowed in this educational repository`);
    continue;
  }
  if (!info.isFile()) continue;
  if (info.size > 10 * 1024 * 1024) errors.push(`${file}: file exceeds the 10 MiB repository hygiene limit`);

  if (info.size <= 5 * 1024 * 1024) {
    const buffer = await readFile(file);
    if (!isProbablyBinary(buffer)) {
      const text = buffer.toString('utf8');
      if (/^(?:<{7}|={7}|>{7})(?: |$)/m.test(text)) {
        errors.push(`${file}: unresolved merge-conflict marker`);
      }
      if (file.startsWith('.github/workflows/')) {
        for (const match of text.matchAll(/^\s*uses:\s*([^\s#]+)\s*$/gm)) {
          const action = match[1];
          if (action.startsWith('./')) continue;
          const separator = action.lastIndexOf('@');
          const reference = separator >= 0 ? action.slice(separator + 1) : '';
          if (!/^(?:v\d+|[a-f0-9]{40})$/.test(reference)) {
            errors.push(`${file}: GitHub Action ${action} must be pinned to a major version or full commit SHA`);
          }
        }
      }
    }
  }
}

const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'));
if ((packageLock.lockfileVersion ?? 0) < 3) {
  errors.push('package-lock.json: lockfileVersion 3 or newer is required for reproducible npm ci');
}

if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  console.error(`Generated-artifact hygiene failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`Generated-artifact hygiene passed: ${files.length} repository file(s) inspected.`);
