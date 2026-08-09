import { readFile, lstat } from 'node:fs/promises';
import { isProbablyBinary, repositoryFiles } from './lib/repository-files.mjs';

const files = await repositoryFiles();
const findings = [];
const rules = [
  { name: 'private key material', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { name: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { name: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: 'npm access token', pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: 'Stripe live secret', pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  {
    name: 'assigned credential-like value',
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["'](?!example|placeholder|replace|test|dummy|none)[^"'\r\n]{12,}["']/gi,
  },
];

for (const file of files) {
  if (/^\.env(?:\.|$)/.test(file) && !/\.example$/.test(file)) {
    findings.push(`${file}: environment file must not be committed`);
  }
  const info = await lstat(file);
  if (!info.isFile() || info.size > 5 * 1024 * 1024) continue;
  const buffer = await readFile(file);
  if (isProbablyBinary(buffer)) continue;
  const lines = buffer.toString('utf8').split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    if (line.includes('secret-scan: allow')) continue;
    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) findings.push(`${file}:${lineIndex + 1}: ${rule.name}`);
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) console.error(`error: ${finding}`);
  console.error(`Secret scan failed with ${findings.length} finding(s); matched values are intentionally not printed.`);
  process.exit(1);
}

console.log(`Secret scan passed: ${files.length} repository file(s) inspected; no credential patterns found.`);
