import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(desktopRoot, '..');
const mode = process.argv[2];
const explicitExecutable = process.argv[3];

if (!['--runtime', '--exe'].includes(mode)) {
  throw new Error('Usage: node scripts/smoke.mjs --runtime | --exe [path-to-executable]');
}

async function findPortableExecutable() {
  if (explicitExecutable) return path.resolve(explicitExecutable);
  const desktopPackage = JSON.parse(
    await readFile(path.join(desktopRoot, 'package.json'), 'utf8'),
  );
  return path.join(
    repositoryRoot,
    'release',
    `Constant-On-Time-Lab-${desktopPackage.version}-portable-x64.exe`,
  );
}

const command = mode === '--runtime'
  ? require('electron')
  : await findPortableExecutable();
const commandArguments = mode === '--runtime'
  ? [path.join(desktopRoot, 'main.cjs')]
  : [];
const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'cotlab-smoke-'));
const resultPath = path.join(tempDirectory, 'result.json');
commandArguments.push(`--smoke-test-output=${resultPath}`, '--disable-gpu');

const child = spawn(command, commandArguments, {
  cwd: repositoryRoot,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let standardError = '';
child.stderr.on('data', (chunk) => {
  standardError += chunk.toString();
});

const deadline = Date.now() + 45_000;
let result;

try {
  while (Date.now() < deadline) {
    try {
      result = JSON.parse(await readFile(resultPath, 'utf8'));
      break;
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (!result) {
    child.kill();
    throw new Error(`Desktop smoke test timed out.${standardError ? `\n${standardError}` : ''}`);
  }

  if (!result.passed || result.exitCode !== 0) {
    throw new Error(`Desktop smoke test failed:\n${JSON.stringify(result, null, 2)}`);
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}
