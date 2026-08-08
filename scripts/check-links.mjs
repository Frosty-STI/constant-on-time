import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('sources/manifest.json', 'utf8'));
const sources = manifest.sources ?? [];
const concurrency = Math.max(1, Number.parseInt(process.env.LINK_CHECK_CONCURRENCY ?? '8', 10));
const timeoutMs = Math.max(1_000, Number.parseInt(process.env.LINK_CHECK_TIMEOUT_MS ?? '20000', 10));
const retryCount = Math.max(0, Number.parseInt(process.env.LINK_CHECK_RETRIES ?? '2', 10));
const strict = process.env.LINK_CHECK_STRICT === '1';
const userAgent = 'constant-on-time-link-check/1.0 (+https://github.com/)';

const failures = [];
const warnings = [];
let nextIndex = 0;
let checked = 0;

async function request(source, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(source.url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/pdf,application/json;q=0.9,*/*;q=0.5',
        ...(method === 'GET' ? { Range: 'bytes=0-1023' } : {}),
      },
    });
    if (response.body) await response.body.cancel();
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function checkSource(source) {
  let lastError;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      let response = await request(source, 'HEAD');
      if ([400, 401, 403, 405, 406, 429, 501].includes(response.status)) {
        response = await request(source, 'GET');
      }

      if (response.url && new URL(response.url).protocol !== 'https:') {
        return { kind: 'failure', message: `${source.citationId}: redirected to non-HTTPS URL ${response.url}` };
      }
      if (response.ok || response.status === 206) {
        return { kind: 'ok', message: `${source.citationId}: HTTP ${response.status}` };
      }
      if ([401, 403, 429].includes(response.status)) {
        return {
          kind: strict ? 'failure' : 'warning',
          message: `${source.citationId}: HTTP ${response.status}; publisher blocks automated verification (${source.url})`,
        };
      }
      if ([404, 410].includes(response.status)) {
        return { kind: 'failure', message: `${source.citationId}: broken link, HTTP ${response.status} (${source.url})` };
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < retryCount) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  return {
    kind: 'failure',
    message: `${source.citationId}: link check failed after ${retryCount + 1} attempt(s): ${lastError?.message ?? 'unknown error'} (${source.url})`,
  };
}

async function worker() {
  while (nextIndex < sources.length) {
    const source = sources[nextIndex];
    nextIndex += 1;
    const result = await checkSource(source);
    checked += 1;
    if (result.kind === 'failure') failures.push(result.message);
    if (result.kind === 'warning') warnings.push(result.message);
    console.log(`[${String(checked).padStart(String(sources.length).length, ' ')}/${sources.length}] ${result.message}`);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, () => worker()));

for (const warning of warnings) console.warn(`warning: ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`error: ${failure}`);
  console.error(`Link check failed: ${failures.length} broken or unreachable source link(s).`);
  process.exit(1);
}

console.log(`Link check passed: ${sources.length} source URLs checked; ${warnings.length} publisher access warning(s).`);
