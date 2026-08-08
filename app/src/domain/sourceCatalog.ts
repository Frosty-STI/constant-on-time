import manifest from '../../../sources/manifest.json';

export interface SourceRecord {
  readonly citationId: string;
  readonly title: string;
  readonly author: string;
  readonly organization: string;
  readonly publicationDate: string | null;
  readonly sourceType: string;
  readonly url: string;
  readonly accessDate: string;
  readonly topicTags: readonly string[];
  readonly difficulty: string;
  readonly recommendedSections: readonly string[];
  readonly licenseOrAccessNote: string;
  readonly summary: string;
  readonly modelingRelevance: string;
  readonly knownLimitations: string;
}

const sources = manifest.sources as readonly SourceRecord[];

export const SOURCE_BY_ID = new Map(sources.map((source) => [source.citationId, source]));
export const SOURCE_COUNT = sources.length;

export const sourceById = (citationId: string): SourceRecord => {
  const source = SOURCE_BY_ID.get(citationId);
  if (!source) throw new Error(`Unknown source citation ID: ${citationId}`);
  return source;
};
