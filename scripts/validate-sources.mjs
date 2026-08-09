import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

const requiredFields = [
  'citationId',
  'title',
  'author',
  'organization',
  'publicationDate',
  'sourceType',
  'url',
  'accessDate',
  'topicTags',
  'difficulty',
  'recommendedSections',
  'licenseOrAccessNote',
  'summary',
  'modelingRelevance',
  'knownLimitations',
];

const requiredTopics = [
  'Buck fundamentals',
  'Synchronous rectification',
  'Magnetics and ripple',
  'CCM and DCM',
  'Small-signal modeling',
  'Bode and loop analysis',
  'Error amplifier',
  'Compensation',
  'Voltage-mode control',
  'Peak-current-mode control',
  'Slope compensation',
  'Constant on-time control',
  'Adaptive on-time control',
  'Hysteretic control',
  'Ripple injection',
  'Multiphase interleaving',
  'Current sharing',
  'Phase shedding',
  'PSpice ABM',
  'Numerical convergence',
  'Advanced or optional',
];

const requiredSourceDocuments = [
  'docs/sources/core-reading-path.md',
  'docs/sources/annotated-bibliography.md',
  'docs/sources/source-comparison.md',
  'docs/sources/research-gaps.md',
];

const manifestPath = path.join(root, 'sources/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sources = Array.isArray(manifest.sources) ? manifest.sources : [];
const sourceById = new Map();
const urls = new Map();
const representedTopics = new Set();
const usedCitationIds = new Set();

if (manifest.schemaVersion !== 1) errors.push('sources/manifest.json: schemaVersion must be 1');
if (manifest.project !== 'Constant On-Time Lab') {
  errors.push('sources/manifest.json: project must be "Constant On-Time Lab"');
}
if (sources.length < 30) errors.push('sources/manifest.json: at least 30 sources are required');

for (const [index, source] of sources.entries()) {
  const location = `sources/manifest.json source ${index + 1}`;
  for (const field of requiredFields) {
    const value = source[field];
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
      errors.push(`${location}: missing ${field}`);
    }
  }

  const id = source.citationId;
  if (typeof id !== 'string' || !/^[A-Z0-9][A-Z0-9-]*$/.test(id)) {
    errors.push(`${location}: invalid citationId ${JSON.stringify(id)}`);
    continue;
  }
  if (sourceById.has(id)) errors.push(`${location}: duplicate citationId ${id}`);
  sourceById.set(id, source);

  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:') errors.push(`${location}: ${id} URL must use HTTPS`);
    const normalized = url.href;
    if (urls.has(normalized)) {
      warnings.push(`${id} shares a URL with ${urls.get(normalized)}`);
    } else {
      urls.set(normalized, id);
    }
  } catch {
    errors.push(`${location}: ${id} has an invalid URL`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.accessDate ?? '')) {
    errors.push(`${location}: ${id} accessDate must be YYYY-MM-DD`);
  }
  if (!Array.isArray(source.topicTags)) {
    errors.push(`${location}: ${id} topicTags must be an array`);
  } else {
    source.topicTags.forEach((topic) => representedTopics.add(topic));
  }
  if (!Array.isArray(source.recommendedSections)) {
    errors.push(`${location}: ${id} recommendedSections must be an array`);
  }
}

for (const topic of requiredTopics) {
  if (!representedTopics.has(topic)) errors.push(`manifest does not represent required topic: ${topic}`);
}

for (const documentPath of requiredSourceDocuments) {
  try {
    const body = await readFile(path.join(root, documentPath), 'utf8');
    if (body.trim().length < 100) errors.push(`${documentPath}: document is unexpectedly short`);
  } catch {
    errors.push(`${documentPath}: required source document is missing`);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) errors.push('CSV parser: unterminated quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

const bibliographyRows = parseCsv(await readFile(path.join(root, 'sources/bibliography.csv'), 'utf8'));
const expectedBibliographyHeader = [
  'citation_id', 'title', 'author', 'organization', 'publication_date',
  'source_type', 'url', 'access_date', 'topic_tags', 'difficulty',
];
if (bibliographyRows.length === 0 || bibliographyRows[0].join('|') !== expectedBibliographyHeader.join('|')) {
  errors.push('sources/bibliography.csv: unexpected header');
} else {
  const bibliographyIds = new Set();
  for (const [rowIndex, row] of bibliographyRows.slice(1).entries()) {
    if (row.length !== expectedBibliographyHeader.length) {
      errors.push(`sources/bibliography.csv row ${rowIndex + 2}: expected ${expectedBibliographyHeader.length} fields, got ${row.length}`);
      continue;
    }
    const [id, title, , , , , url] = row;
    if (bibliographyIds.has(id)) errors.push(`sources/bibliography.csv: duplicate citation ID ${id}`);
    bibliographyIds.add(id);
    const manifestSource = sourceById.get(id);
    if (!manifestSource) {
      errors.push(`sources/bibliography.csv: unknown citation ID ${id}`);
    } else {
      if (title !== manifestSource.title) errors.push(`sources/bibliography.csv: title differs for ${id}`);
      if (url !== manifestSource.url) errors.push(`sources/bibliography.csv: URL differs for ${id}`);
    }
  }
  for (const id of sourceById.keys()) {
    if (!bibliographyIds.has(id)) errors.push(`sources/bibliography.csv: missing ${id}`);
  }
}

function validateCitation(id, location) {
  if (!sourceById.has(id)) {
    errors.push(`${location}: unknown citation ID ${id}`);
  } else {
    usedCitationIds.add(id);
  }
}

const moduleDirectory = path.join(root, 'packages/lesson-content/modules');
const moduleIndex = JSON.parse(await readFile(path.join(moduleDirectory, 'index.json'), 'utf8'));
if (!Array.isArray(moduleIndex.modules) || moduleIndex.modules.length !== 13) {
  errors.push('packages/lesson-content/modules/index.json: expected exactly 13 modules');
} else {
  const lessonIds = new Set();
  for (const [moduleIndexNumber, filename] of moduleIndex.modules.entries()) {
    const filePath = path.join(moduleDirectory, filename);
    const module = JSON.parse(await readFile(filePath, 'utf8'));
    const expectedId = `module-${String(moduleIndexNumber).padStart(2, '0')}`;
    if (module.id !== expectedId) errors.push(`${filename}: expected id ${expectedId}`);
    if (module.number !== moduleIndexNumber) errors.push(`${filename}: expected number ${moduleIndexNumber}`);
    if (!Array.isArray(module.lessons) || module.lessons.length === 0) {
      errors.push(`${filename}: must contain at least one lesson`);
      continue;
    }
    for (const lesson of module.lessons) {
      const location = `${filename} lesson ${lesson.id ?? '(missing id)'}`;
      if (!lesson.id || lessonIds.has(lesson.id)) errors.push(`${location}: missing or duplicate lesson id`);
      lessonIds.add(lesson.id);
      for (const field of [
        'title', 'physicalIntuition', 'mathematicalDerivation', 'modelingConsequence',
        'interaction', 'transferQuestion',
      ]) {
        if (typeof lesson[field] !== 'string' || lesson[field].trim() === '') {
          errors.push(`${location}: missing ${field}`);
        }
      }
      for (const field of ['concepts', 'assumptions', 'citations', 'evidenceLabels']) {
        if (!Array.isArray(lesson[field]) || lesson[field].length === 0) {
          errors.push(`${location}: ${field} must be a non-empty array`);
        }
      }
      for (const id of lesson.citations ?? []) validateCitation(id, location);
    }
  }
}

const labsSource = await readFile(path.join(root, 'app/src/domain/labs.ts'), 'utf8');
const labCitationGroups = [...labsSource.matchAll(/\bsources:\s*\[([^\]]*)\]/g)];
if (labCitationGroups.length < 17) {
  errors.push(`app/src/domain/labs.ts: expected citations for at least 17 labs, found ${labCitationGroups.length}`);
}
for (const [groupIndex, match] of labCitationGroups.entries()) {
  const ids = [...match[1].matchAll(/['"]([A-Z0-9][A-Z0-9-]*)['"]/g)].map((item) => item[1]);
  if (ids.length === 0) errors.push(`app/src/domain/labs.ts lab ${groupIndex + 1}: no source IDs`);
  ids.forEach((id) => validateCitation(id, `app/src/domain/labs.ts lab ${groupIndex + 1}`));
}

const modulesSource = await readFile(path.join(root, 'app/src/domain/modules.ts'), 'utf8');
const firstSources = [...modulesSource.matchAll(/\bfirstSource:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
if (firstSources.length !== 13) {
  errors.push(`app/src/domain/modules.ts: expected 13 firstSource values, found ${firstSources.length}`);
}
firstSources.forEach((id, index) => validateCitation(id, `app/src/domain/modules.ts module ${index}`));

const flashcardRows = parseCsv(await readFile(path.join(root, 'docs/flashcards.csv'), 'utf8'));
if (flashcardRows[0]?.join('|') !== 'front|back|module|citations') {
  errors.push('docs/flashcards.csv: unexpected header');
} else {
  const allowedAnnotations = new Set(['modeling choice', 'derived', 'exact', 'approximation', 'heuristic']);
  for (const [index, row] of flashcardRows.slice(1).entries()) {
    if (row.length !== 4) {
      errors.push(`docs/flashcards.csv row ${index + 2}: expected 4 fields, got ${row.length}`);
      continue;
    }
    const references = row[3].split(';').map((value) => value.trim()).filter(Boolean);
    const sourceReferences = references.filter((value) => !allowedAnnotations.has(value.toLowerCase()));
    if (sourceReferences.length === 0 && !references.some((value) => allowedAnnotations.has(value.toLowerCase()))) {
      errors.push(`docs/flashcards.csv row ${index + 2}: no source citation or evidence label`);
    }
    sourceReferences.forEach((id) => validateCitation(id, `docs/flashcards.csv row ${index + 2}`));
  }
}

const knownPrefixes = new Set([...sourceById.keys()].map((id) => id.split('-')[0]));
for (const documentPath of requiredSourceDocuments) {
  const body = await readFile(path.join(root, documentPath), 'utf8');
  for (const match of body.matchAll(/`([A-Z0-9][A-Z0-9-]+)`/g)) {
    const candidate = match[1];
    if (knownPrefixes.has(candidate.split('-')[0])) validateCitation(candidate, documentPath);
  }
}

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', 'playwright-report', 'test-results', '.git'].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
  }
  return files;
}

for (const filePath of await markdownFiles(root)) {
  const body = await readFile(filePath, 'utf8');
  const location = path.relative(root, filePath);
  for (const match of body.matchAll(/(?:\[|`)([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)(?:\]|`)/g)) {
    const candidate = match[1];
    const prefix = candidate.split('-')[0];
    if (sourceById.has(candidate) || (candidate.includes('-') && knownPrefixes.has(prefix)) || prefix === 'SRC') validateCitation(candidate, location);
  }
}

for (const id of sourceById.keys()) {
  if (!usedCitationIds.has(id)) warnings.push(`${id} is in the extended library but not referenced by structured lessons, labs, flashcards, or core source docs`);
}

if (warnings.length > 0) {
  for (const warning of warnings) console.warn(`warning: ${warning}`);
}
if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  console.error(`Source validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  `Source validation passed: ${sources.length} sources, ${representedTopics.size} topics, ` +
  `${moduleIndex.modules.length} modules, ${usedCitationIds.size} referenced citation IDs.`,
);
