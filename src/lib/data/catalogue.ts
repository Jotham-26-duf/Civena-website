import { movies as localMovies, type Movie } from '@/data/movies';
import { series as localSeries, validateSeriesCatalogue, type SeriesEntry } from '@/data/series';
import { connection } from 'next/server';
import { lookup } from 'node:dns/promises';
import { getSupabaseEnvironment } from '@/lib/supabase/environment';

export type Catalogue = { movies: Movie[]; series: SeriesEntry[] };

const localSeriesErrors = validateSeriesCatalogue(localSeries);
if (localSeriesErrors.length)
  throw new Error(`Invalid CINEVA season catalogue: ${localSeriesErrors.join('; ')}`);

function includeLocalDevelopmentRecords<T extends { slug: string; id: number }>(published: T[], local: T[]): T[] {
  if (process.env.NODE_ENV !== 'development') return published;
  // Published rows with distinct content IDs are both retained. Local fallbacks have no
  // content ID, so match them to a published row by their shared legacy ID or slug.
  const publishedSlugs = new Set(published.map((item) => item.slug.toLowerCase()));
  const publishedIds = new Set(published.map((item) => item.id));
  return [...published, ...local.filter((item) =>
    !publishedSlugs.has(item.slug.toLowerCase()) && !publishedIds.has(item.id),
  )];
}

function uniquePublishedRecords<T extends { contentId?: string; slug: string; id: number }>(items: T[]): T[] {
  const seenContentIds = new Set<string>();
  const seenLegacyIds = new Set<number>();
  const seenSlugs = new Set<string>();
  return items.filter((item) => {
    const slug = item.slug.toLowerCase();
    if (item.contentId && seenContentIds.has(item.contentId)) return false;
    if (seenLegacyIds.has(item.id) || seenSlugs.has(slug)) return false;
    if (item.contentId) seenContentIds.add(item.contentId);
    seenLegacyIds.add(item.id);
    seenSlugs.add(slug);
    return true;
  });
}

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const rows = (value: unknown): Raw[] => Array.isArray(value) ? value.filter(isRecord) : [];
const text = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null;
const nullableNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const boolOrNull = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const stringArray = (value: unknown): string[] => rows(value).map((row) => text(row.name)).filter((name): name is string => name !== null);
function requiredText(row: Raw, key: string): string {
  const value = text(row[key]);
  if (!value) throw new Error(`Catalogue response has invalid ${key}.`);
  return value;
}
function requiredInteger(row: Raw, key: string, minimum = 0): number {
  const value = typeof row[key] === 'number' ? row[key] : typeof row[key] === 'string' && row[key].trim() ? Number(row[key]) : NaN;
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Catalogue response has invalid ${key}.`);
  return value;
}
function requiredObject(value: unknown, name: string): Raw {
  if (!isRecord(value)) throw new Error(`Catalogue response is missing ${name}.`);
  return value;
}

const catalogSelect = [
  'id,content_type,legacy_id,slug,title,description,release_year,legacy_created_date,language,narrator,quality,is_featured,is_new,published_at',
  'poster:media_assets!content_poster_asset_fk(provider,bucket,object_key)',
  'banner:media_assets!content_banner_asset_fk(provider,bucket,object_key)',
  'narrator_art:media_assets!content_narrator_asset_fk(provider,bucket,object_key)',
  'movies(rating,views_label,categories(name),movie_genres(genres(name)),movie_parts(id,part_number,title,media_sources(source_kind,external_reference,is_active,sort_order)))',
  'series(views_label,series_genres(genres(name)),seasons(id,season_number,title,episodes(id,episode_number,title,description,quality,thumbnail:media_assets!episode_thumbnail_asset_fk(provider,bucket,object_key),media_sources(source_kind,external_reference,is_active,sort_order))))',
].join(',');

function requestDiagnostics(error: unknown) {
  const root = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const cause = root.cause && typeof root.cause === 'object' ? root.cause as Record<string, unknown> : {};
  const code = typeof root.code === 'string' ? root.code : null;
  const causeCode = typeof cause.code === 'string' ? cause.code : null;
  const status = typeof root.statusCode === 'number' ? root.statusCode
    : typeof root.status === 'number' ? root.status : null;
  const timedOut = root.name === 'TimeoutError' || root.name === 'AbortError'
    || cause.name === 'TimeoutError' || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code ?? '')
    || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(causeCode ?? '');
  const tlsFailure = [code, causeCode].some((value) => Boolean(value && (/TLS|CERT|SSL/i.test(value))));
  const rawMessage = typeof root.message === 'string' ? root.message : 'Unknown request error';
  const safeMessage = rawMessage
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/(?:sb_publishable_|sb_secret_|service_role)[A-Za-z0-9_-]+/gi, '[REDACTED KEY]')
    .slice(0, 180);
  return {
    errorType: typeof root.name === 'string' ? root.name : 'UnknownError',
    errorMessage: safeMessage,
    errorCode: code,
    causeCode,
    httpResponseReceived: status !== null,
    httpStatus: status,
    timedOut,
    tlsFailure,
    tlsEstablished: status !== null ? true : tlsFailure ? false : null,
    proxyConfigured: Boolean(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.ALL_PROXY),
  };
}

async function hostnameResolution(baseUrl: string): Promise<{ resolved: boolean | null; errorCode?: string }> {
  try {
    await lookup(new URL(baseUrl).hostname);
    return { resolved: true };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code : undefined;
    return { resolved: false, ...(code ? { errorCode: code } : {}) };
  }
}

function publicAssetUrl(baseUrl: string, value: unknown): string | null {
  if (!isRecord(value)) return null;
  const key = text(value.object_key);
  if (!key) return null;
  if (value.provider === 'legacy_local') return key;
  const bucket = text(value.bucket);
  if (!bucket) return null;
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path}`;
}

function sourcesFor(sources: unknown, kind: string): string[] {
  const candidates = rows(sources)
    .filter((source) => source.source_kind === kind && source.is_active === true && typeof source.external_reference === 'string')
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  return [...new Set(candidates.map((source) => text(source.external_reference)).filter((value): value is string => Boolean(value)))];
}

function sourceFor(sources: unknown, kind: string): string | null {
  return sourcesFor(sources, kind)[0] ?? null;
}

function mapMovie(baseUrl: string, row: Raw): Movie {
  const subtype = requiredObject(row.movies, 'movie subtype');
  const movieTitle = requiredText(row, 'title');
  const genres = rows(subtype.movie_genres).flatMap((join) => stringArray([join.genres]));
  const parts = rows(subtype.movie_parts).sort((a, b) => Number(a.part_number) - Number(b.part_number)).map((part) => ({
    id: requiredText(part, 'id'),
    partNumber: requiredInteger(part, 'part_number', 1),
    title: text(part.title)?.trim() || `${movieTitle} - Part ${requiredInteger(part, 'part_number', 1)}`,
    videoUrls: sourcesFor(part.media_sources, 'playback'),
    trailerUrl: sourceFor(part.media_sources, 'trailer'),
    videoUrl: sourceFor(part.media_sources, 'playback'),
    downloadUrl: sourceFor(part.media_sources, 'download'),
  }));
  return {
    contentId: requiredText(row, 'id'),
    id: requiredInteger(row, 'legacy_id', 1), slug: requiredText(row, 'slug'), title: movieTitle, year: nullableNumber(row.release_year),
    rating: nullableNumber(subtype.rating), language: text(row.language), genres, narrator: text(row.narrator),
    narratorImage: publicAssetUrl(baseUrl, row.narrator_art), quality: text(row.quality), views: text(subtype.views_label),
    category: text(rows([subtype.categories])[0]?.name), poster: publicAssetUrl(baseUrl, row.poster),
    banner: publicAssetUrl(baseUrl, row.banner), description: text(row.description), featured: boolOrNull(row.is_featured),
    isNew: boolOrNull(row.is_new), published: text(row.published_at), createdAt: text(row.legacy_created_date), parts,
  };
}

function mapSeries(baseUrl: string, row: Raw): SeriesEntry[] {
  const subtype = requiredObject(row.series, 'series subtype');
  const genres = rows(subtype.series_genres).flatMap((join) => stringArray([join.genres]));
  const parentId = requiredText(row, 'id');
  const parentSlug = requiredText(row, 'slug');
  const parentTitle = requiredText(row, 'title');
  return rows(subtype.seasons).sort((a, b) => Number(a.season_number) - Number(b.season_number)).map((season, seasonIndex) => {
    const seasonNumber = requiredInteger(season, 'season_number', 1);
    const baseSlug = parentSlug.replace(/-season-\d+$/i, '');
    const baseTitle = parentTitle.replace(/\bseason\s*\d+\s*$/i, '').trim();
    const seasonSlug = `${baseSlug}-season-${seasonNumber}`;
    const seasonTitle = `${baseTitle} SEASON ${seasonNumber}`;
    return {
    contentId: parentId,
    // Stable positive numeric application ID derived from the preserved database season UUID.
    id: stableNumericSeasonId(requiredText(season, 'id')),
    slug: seasonSlug,
    title: seasonTitle,
    seasonNumber,
    legacySlug: seasonIndex === 0 ? parentSlug : undefined,
    year: nullableNumber(row.release_year) ?? undefined,
    narrator: text(row.narrator) ?? undefined, genres, narratorImage: publicAssetUrl(baseUrl, row.narrator_art) ?? undefined,
    quality: text(row.quality) ?? undefined, views: text(subtype.views_label) ?? undefined,
    image: publicAssetUrl(baseUrl, row.poster) ?? undefined, banner: publicAssetUrl(baseUrl, row.banner) ?? undefined,
    description: text(row.description) ?? undefined, published: text(row.published_at) ?? undefined,
    createdAt: text(row.legacy_created_date) ?? undefined,
    featured: boolOrNull(row.is_featured), language: text(row.language) ?? undefined,
    isNew: boolOrNull(row.is_new) ?? undefined,
    episodes: rows(season.episodes).sort((a, b) => Number(a.episode_number) - Number(b.episode_number)).map((episode) => ({
      id: requiredText(episode, 'id'), episodeNumber: requiredInteger(episode, 'episode_number', 1), title: text(episode.title) ?? `${seasonTitle} - Episode ${requiredInteger(episode, 'episode_number', 1)}`,
      description: text(episode.description) ?? undefined, quality: text(episode.quality) ?? undefined,
      image: publicAssetUrl(baseUrl, episode.thumbnail) ?? undefined,
      videoUrl: sourceFor(episode.media_sources, 'playback') ?? undefined,
      downloadUrl: sourceFor(episode.media_sources, 'download') ?? undefined,
    })),
    trailerUrl: rows(season.episodes).map((episode) => sourceFor(episode.media_sources, 'trailer')).find(Boolean) ?? undefined,
  };
  });
}

function stableNumericSeasonId(seasonId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seasonId.length; index++) hash = Math.imul(hash ^ seasonId.charCodeAt(index), 16777619);
  return 1_000_000_000 + (hash >>> 0);
}

async function fetchCatalogRows(baseUrl: string, apiKey: string): Promise<Raw[]> {
  const result: Raw[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const endpoint = new URL('/rest/v1/content_items', baseUrl);
    endpoint.searchParams.set('select', catalogSelect);
    endpoint.searchParams.set('content_type', 'in.(movie,series)');
    endpoint.searchParams.set('status', 'eq.published');
    endpoint.searchParams.set('order', 'title.asc,id.asc');
    const response = await fetch(endpoint, {
      headers: { apikey: apiKey, Range: `${offset}-${offset + pageSize - 1}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const error = new Error(`Catalogue service returned HTTP ${response.status}.`) as Error & { statusCode: number };
      error.statusCode = response.status;
      throw error;
    }
    const page = rows(await response.json());
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

export async function getCatalogue(): Promise<Catalogue> {
  // Supabase configuration may be injected at runtime; do not bake the local fallback into static output.
  await connection();
  let environment;
  try {
    environment = getSupabaseEnvironment();
  } catch (error) {
    console.error('CINEVA Supabase catalogue configuration is invalid.', requestDiagnostics(error));
    if (process.env.NODE_ENV === 'development') return { movies: localMovies, series: localSeries };
    throw new Error('The catalogue could not be loaded. Please try again later.');
  }
  if (!environment) return { movies: localMovies, series: localSeries };
  const { url: baseUrl, publishableKey: apiKey } = environment;

  try {
    const rows = await fetchCatalogRows(baseUrl, apiKey);
    const movieRows = rows.filter((row) => row.content_type === 'movie');
    const seriesRows = rows.filter((row) => row.content_type === 'series');
    const publishedSeries = seriesRows.flatMap((row) => mapSeries(baseUrl, row));
    const publishedSeriesErrors = validateSeriesCatalogue(publishedSeries);
    if (publishedSeriesErrors.length) throw new Error(`Database season catalogue is invalid: ${publishedSeriesErrors.join('; ')}`);
    const catalogueSeries = includeLocalDevelopmentRecords(uniquePublishedRecords(publishedSeries), localSeries);
    const catalogueSeriesErrors = validateSeriesCatalogue(catalogueSeries);
    if (catalogueSeriesErrors.length) throw new Error(`Application season catalogue is invalid: ${catalogueSeriesErrors.join('; ')}`);
    return {
      movies: includeLocalDevelopmentRecords(uniquePublishedRecords(movieRows.map((row) => mapMovie(baseUrl, row))), localMovies),
      series: catalogueSeries,
    };
  } catch (error) {
    const diagnostic = requestDiagnostics(error);
    const dns = await hostnameResolution(baseUrl);
    console.error('Failed to retrieve the public CINEVA catalogue.', { ...diagnostic, hostnameResolved: dns.resolved, dnsErrorCode: dns.errorCode ?? null });
    if (process.env.NODE_ENV === 'development') return { movies: localMovies, series: localSeries };
    throw new Error('The catalogue could not be loaded. Please try again later.');
  }
}
