import { readFile } from 'node:fs/promises';

const requiredFields = [
  'citationId', 'title', 'author', 'organization', 'publicationDate',
  'sourceType', 'url', 'accessDate', 'topicTags', 'difficulty',
  'recommendedSections', 'licenseOrAccessNote', 'summary',
  'modelingRelevance', 'knownLimitations'
];

const requiredTopics = [
  'Buck fundamentals', 'Synchronous rectification', 'Magnetics and ripple',
  'CCM and DCM', 'Small-signal modeling', 'Bode and loop analysis',
  'Error amplifier', 'Compensation', 'Voltage-mode control',
  'Peak-current-mode control', 'Slope compensation', 'Constant on-time control',
  'Adaptive on-time control', 'Hysteretic control', 'Ripple injection',
  'Multiphase interleaving', 'Current sharing', 'Phase shedding',
  'PSpice ABM', 'Numerical convergence', 'Advanced or optional'
];

const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
const errors = [];
const ids = new Set();
const topics = new Set();

if (!Array.isArray(manifest.sources) || manifest.sources.length < 30) {
  errors.push('manifest must contain at least 30 sources');
}

for (const [index, source] of manifest.sources.entries()) {
  for (const field of requiredFields) {
    if (!(field in source) || source[field] === '' || source[field] == null) {
      errors.push(`source ${index} is missing ${field}`);
    }
  }
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(source.citationId ?? '')) {
    errors.push(`invalid citation ID: ${source.citationId}`);
  }
  if (ids.has(source.citationId)) errors.push(`duplicate citation ID: ${source.citationId}`);
  ids.add(source.citationId);
  try {
    const parsed = new URL(source.url);
    if (parsed.protocol !== 'https:') errors.push(`${source.citationId} URL is not HTTPS`);
  } catch {
    errors.push(`${source.citationId} has an invalid URL`);
  }
  if (!Array.isArray(source.topicTags) || source.topicTags.length === 0) {
    errors.push(`${source.citationId} has no topic tags`);
  } else {
    source.topicTags.forEach((topic) => topics.add(topic));
  }
  if (!Array.isArray(source.recommendedSections) || source.recommendedSections.length === 0) {
    errors.push(`${source.citationId} has no recommended sections`);
  }
}

for (const topic of requiredTopics) {
  if (!topics.has(topic)) errors.push(`required topic is not represented: ${topic}`);
}

if (process.argv.includes('--network')) {
  for (const source of manifest.sources) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      let response = await fetch(source.url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
      if (response.status === 405 || response.status === 403) {
        response = await fetch(source.url, {
          method: 'GET', redirect: 'follow', signal: controller.signal,
          headers: { Range: 'bytes=0-1024' }
        });
      }
      if (!response.ok && response.status !== 206) {
        errors.push(`${source.citationId} returned HTTP ${response.status}`);
      }
    } catch (error) {
      errors.push(`${source.citationId} link check failed: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${manifest.sources.length} sources, ${ids.size} unique IDs, and ${topics.size} topic tags.`);
