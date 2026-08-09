import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'app/dist');
const errors = [];

async function requireFile(relativePath) {
  try {
    await access(path.join(dist, relativePath));
  } catch {
    errors.push(`app/dist/${relativePath}: required production artifact is missing`);
  }
}

for (const file of ['index.html', 'manifest.webmanifest', 'sw.js', 'favicon.svg']) {
  await requireFile(file);
}

if (errors.length === 0) {
  const indexHtml = await readFile(path.join(dist, 'index.html'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.webmanifest'), 'utf8'));
  const serviceWorker = await readFile(path.join(dist, 'sw.js'), 'utf8');

  if (!/Content-Security-Policy/i.test(indexHtml)) {
    errors.push('app/dist/index.html: Content-Security-Policy meta element is missing');
  }
  const cspMeta = indexHtml.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0]
    ?? indexHtml.match(/<meta\b[^>]*content=["'][^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0];
  const csp = cspMeta?.match(/\bcontent="([^"]*)"/i)?.[1]
    ?? cspMeta?.match(/\bcontent='([^']*)'/i)?.[1];
  if (!csp || !/connect-src\s+'self'(?=;|$)/.test(csp)) {
    errors.push("app/dist/index.html: CSP must constrain connect-src to 'self'");
  }

  for (const match of indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const reference = match[1];
    if (/^(?:https?:)?\/\//i.test(reference)) {
      errors.push(`app/dist/index.html: external runtime asset ${reference}`);
      continue;
    }
    if (/^(?:data:|blob:|#)/i.test(reference)) continue;
    const cleanReference = decodeURIComponent(reference.split(/[?#]/, 1)[0]).replace(/^\//, '');
    if (cleanReference) await requireFile(cleanReference);
  }

  if (manifest.name !== 'Constant On-Time Lab') {
    errors.push('app/dist/manifest.webmanifest: unexpected application name');
  }
  if (manifest.display !== 'standalone') {
    errors.push('app/dist/manifest.webmanifest: display must be standalone');
  }
  for (const icon of manifest.icons ?? []) {
    if (/^(?:https?:)?\/\//i.test(icon.src ?? '')) {
      errors.push(`app/dist/manifest.webmanifest: external icon ${icon.src}`);
    } else if (icon.src) {
      await requireFile(icon.src.replace(/^\//, ''));
    }
  }

  if (!serviceWorker.includes('precacheAndRoute')) {
    errors.push('app/dist/sw.js: Workbox precache manifest is missing');
  }
  const precachedFiles = new Set(
    [...serviceWorker.matchAll(/\{url:["']([^"']+)["']/g)].map((match) => match[1].replace(/^\//, '')),
  );
  for (const required of ['index.html', 'manifest.webmanifest', 'favicon.svg']) {
    if (!precachedFiles.has(required)) errors.push(`app/dist/sw.js: ${required} is not precached`);
  }
  for (const precached of precachedFiles) await requireFile(precached);

  const sourceAssetReferences = [...indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)]
    .map((match) => match[1].split(/[?#]/, 1)[0].replace(/^\//, ''))
    .filter((reference) => reference.startsWith('assets/'));
  for (const reference of sourceAssetReferences) {
    if (!precachedFiles.has(reference)) errors.push(`app/dist/sw.js: entry asset ${reference} is not precached`);
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

try {
  const textFiles = (await walk(dist)).filter((file) => /\.(?:html|css|js|mjs)$/i.test(file));
  const prohibitedRuntimePatterns = [
    { name: 'absolute fetch', pattern: /\bfetch\s*\(\s*["'`]https?:\/\//i },
    { name: 'absolute XMLHttpRequest', pattern: /\.open\s*\(\s*["'`](?:GET|POST|PUT|PATCH|DELETE)["'`]\s*,\s*["'`]https?:\/\//i },
    { name: 'remote importScripts', pattern: /\bimportScripts\s*\(\s*["'`]https?:\/\//i },
    { name: 'remote WebSocket', pattern: /\bnew\s+WebSocket\s*\(\s*["'`]wss?:\/\//i },
    { name: 'telemetry beacon', pattern: /\bnavigator\.sendBeacon\s*\(/i },
    { name: 'remote CSS asset', pattern: /url\(\s*["']?https?:\/\//i },
    { name: 'known hosted analytics', pattern: /(?:google-analytics\.com|googletagmanager\.com|plausible\.io|api\.segment\.io|posthog\.com)/i },
  ];
  for (const file of textFiles) {
    const text = await readFile(file, 'utf8');
    for (const check of prohibitedRuntimePatterns) {
      if (check.pattern.test(text)) {
        errors.push(`${path.relative(root, file)}: found ${check.name}; normal runtime must remain local-only`);
      }
    }
  }
} catch (error) {
  errors.push(`app/dist: cannot inspect production bundle (${error.message})`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  console.error(`Offline bundle verification failed with ${errors.length} error(s). Run npm run build first.`);
  process.exit(1);
}

console.log('Offline bundle verification passed: all entry assets are local, the PWA shell is precached, and no automatic remote transport was found.');
