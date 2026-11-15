import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const { movies } = await import('../src/data/movies.ts');
const { series } = await import('../src/data/series.ts');
const apply = process.argv.includes('--apply');
const root = process.cwd();
const report = { movies: movies.length, movieParts: 0, series: series.length, seasons: 0, episodes: 0, genres: 0, assets: 0, sources: 0, missingLocalAssets: [], emptyMediaUrls: [], invalidMediaSources: [] };
const plannedAssets = new Map();
const plannedGenres = new Set();

function supportedSource(reference, recordId, kind) {
  if (!reference?.trim()) return false;
  try {
    const parsed = new URL(reference);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('unsupported URL');
    return true;
  } catch {
    report.invalidMediaSources.push({ recordId, kind, value: reference });
    return false;
  }
}

const uuid = (key) => {
  const bytes = createHash('sha256').update(`cineva-catalogue-v1:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
const slugify = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (Boolean(url) !== Boolean(key)) throw new Error('Set both NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY to import.');

function validate() {
  const ids = new Set();
  const slugs = new Set();
  const partIds = new Set();
  for (const movie of movies) {
    if (!Number.isSafeInteger(movie.id) || movie.id <= 0 || ids.has(movie.id)) throw new Error(`Invalid or duplicate movie ID in slug ${movie.slug}`);
    if (!movie.slug || slugs.has(movie.slug)) throw new Error(`Missing or duplicate movie slug: ${movie.slug}`);
    ids.add(movie.id); slugs.add(movie.slug);
    if (!Array.isArray(movie.parts)) throw new Error(`Movie ${movie.slug} has no parts array`);
    const numbers = new Set();
    for (const part of movie.parts) {
      if (!part.id || partIds.has(part.id)) throw new Error(`Missing or duplicate movie-part ID in ${movie.slug}`);
      if (!Number.isInteger(part.partNumber) || part.partNumber <= 0 || numbers.has(part.partNumber)) throw new Error(`Invalid or duplicate part number in ${movie.slug}`);
      partIds.add(part.id); numbers.add(part.partNumber); report.movieParts++;
    }
  }
  const seriesIds = new Set(); const seriesSlugs = new Set(); const episodeIds = new Set();
  for (const item of series) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || seriesIds.has(item.id)) throw new Error(`Invalid or duplicate season catalogue ID in slug ${item.slug}`);
    if (!item.slug || seriesSlugs.has(item.slug)) throw new Error(`Missing or duplicate season slug: ${item.slug}`);
    if (!item.title?.trim() || !Number.isInteger(item.seasonNumber) || item.seasonNumber <= 0 || !Array.isArray(item.episodes)) throw new Error(`Invalid season catalogue entry ${item.slug}`);
    seriesIds.add(item.id); seriesSlugs.add(item.slug); report.seasons++;
    const episodeNumbers = new Set();
    for (const episode of item.episodes) {
      if (!episode.id || episodeIds.has(episode.id)) throw new Error(`Missing or duplicate episode ID in ${item.slug}`);
      if (typeof episode.title !== 'string' || !Number.isInteger(episode.episodeNumber) || episode.episodeNumber <= 0 || episodeNumbers.has(episode.episodeNumber)) throw new Error(`Invalid episode data in ${item.slug}`);
      episodeIds.add(episode.id); episodeNumbers.add(episode.episodeNumber); report.episodes++;
    }
  }
  for (const movie of movies) {
    for (const name of movie.genres) plannedGenres.add(slugify(name));
    for (const [path, type] of [[movie.poster, 'poster'], [movie.banner, 'banner'], [movie.narratorImage, 'narrator_image']]) if (path) plannedAssets.set(uuid(`asset:legacy_local:${path}`), { path, type });
    for (const part of movie.parts) {
      if (!part.videoUrl?.trim()) report.emptyMediaUrls.push({ recordId: part.id, kind: 'playback' });
      else if (supportedSource(part.videoUrl, part.id, 'playback')) report.sources++;
      if (!part.downloadUrl?.trim()) report.emptyMediaUrls.push({ recordId: part.id, kind: 'download' });
      else if (supportedSource(part.downloadUrl, part.id, 'download')) report.sources++;
      if (part.trailerUrl?.trim() && supportedSource(part.trailerUrl, part.id, 'trailer')) report.sources++;
    }
  }
  for (const item of series) {
    for (const name of item.genres ?? []) plannedGenres.add(slugify(name));
    for (const [path, type] of [[item.image, 'poster'], [item.banner, 'banner'], [item.narratorImage, 'narrator_image']]) if (path) plannedAssets.set(uuid(`asset:legacy_local:${path}`), { path, type });
    for (const episode of item.episodes) {
      if (episode.image) plannedAssets.set(uuid(`asset:legacy_local:${episode.image}`), { path: episode.image, type: 'thumbnail' });
      for (const [kind, value] of [['playback', episode.videoUrl], ['download', episode.downloadUrl], ['trailer', episode.trailerUrl]]) {
        if ((kind === 'playback' || kind === 'download') && !value?.trim()) report.emptyMediaUrls.push({ recordId: episode.id, kind });
        else if (value?.trim() && supportedSource(value, episode.id, kind)) report.sources++;
      }
    }
  }
  report.assets = plannedAssets.size;
  report.genres = plannedGenres.size;
  report.missingLocalAssets = [...plannedAssets.values()].filter(({ path }) => path.startsWith('/') && !existsSync(resolve(root, 'public', `.${path}`))).map(({ path }) => path);
}

async function upsert(table, rows, conflict = 'id') {
  if (!rows.length) return;
  const endpoint = new URL(`/rest/v1/${table}`, url);
  endpoint.searchParams.set('on_conflict', conflict);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Supabase import failed for ${table} (HTTP ${response.status}); response details were suppressed.`);
}

function assetRecord(path, type) {
  if (!path) return null;
  if (path.startsWith('/')) {
    return { id: uuid(`asset:legacy_local:${path}`), asset_type: type, provider: 'legacy_local', bucket: 'legacy', object_key: path };
  }
  return null;
}
function sourceRecord(parentField, parentId, kind, sourceUrl, index = 0) {
  if (!sourceUrl || !sourceUrl.trim()) return null;
  let parsed;
  try { parsed = new URL(sourceUrl); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
  return { id: uuid(`source:${parentId}:${kind}:${sourceUrl}`), [parentField]: parentId, source_kind: kind,
    provider: parsed.hostname.toLowerCase(), external_reference: sourceUrl, is_active: false, is_primary: index === 0, sort_order: index };
}

validate();
if (!apply) {
  console.log(JSON.stringify({ mode: 'dry-run', ...report }, null, 2));
  console.log('No database was contacted. Set configuration and pass --apply to write.');
  process.exit(0);
}
if (!url || !key) throw new Error('Import requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.');

const assets = new Map();
for (const movie of movies) {
  for (const [path, type] of [[movie.poster, 'poster'], [movie.banner, 'banner'], [movie.narratorImage, 'narrator_image']]) {
    const record = assetRecord(path, type); if (record) assets.set(record.id, record);
  }
}
for (const item of series) {
  for (const [path, type] of [[item.image, 'poster'], [item.banner, 'banner'], [item.narratorImage, 'narrator_image']]) {
    const record = assetRecord(path, type); if (record) assets.set(record.id, record);
  }
  for (const episode of item.episodes) {
    const record = assetRecord(episode.image, 'thumbnail'); if (record) assets.set(record.id, record);
  }
}
await upsert('media_assets', [...assets.values()]);

const allContent = [];
for (const movie of movies) {
  const id = uuid(`content:movie:${movie.id}`);
  const poster = movie.poster ? uuid(`asset:legacy_local:${movie.poster}`) : null;
  const banner = movie.banner ? uuid(`asset:legacy_local:${movie.banner}`) : null;
  const narrator = movie.narratorImage ? uuid(`asset:legacy_local:${movie.narratorImage}`) : null;
  allContent.push({ id, content_type: 'movie', legacy_id: movie.id, slug: movie.slug, title: movie.title,
    description: movie.description, release_year: movie.year, legacy_created_date: movie.createdAt,
    language: movie.language, narrator: movie.narrator, narrator_image_asset_id: narrator, quality: movie.quality,
    is_featured: movie.featured, is_new: movie.isNew, status: 'draft', poster_asset_id: poster, banner_asset_id: banner });
}
for (const item of series) {
  const id = uuid(`content:series:${item.id}`);
  const poster = item.image ? uuid(`asset:legacy_local:${item.image}`) : null;
  const banner = item.banner ? uuid(`asset:legacy_local:${item.banner}`) : null;
  const narrator = item.narratorImage ? uuid(`asset:legacy_local:${item.narratorImage}`) : null;
  allContent.push({ id, content_type: 'series', legacy_id: item.id, slug: item.slug, title: item.title,
    description: item.description ?? null, release_year: item.year ?? null, legacy_created_date: item.createdAt ?? null,
    language: item.language ?? null, narrator: item.narrator ?? null,
    narrator_image_asset_id: narrator, quality: item.quality ?? null, is_featured: item.featured ?? null, is_new: item.isNew ?? null,
    status: 'draft', poster_asset_id: poster, banner_asset_id: banner });
}
await upsert('content_items', allContent, 'content_type,legacy_id');

const movieSubtypes = movies.map((movie) => ({ content_id: uuid(`content:movie:${movie.id}`), rating: movie.rating, views_label: movie.views }));
await upsert('movies', movieSubtypes);
await upsert('series', series.map((item) => ({ content_id: uuid(`content:series:${item.id}`), views_label: item.views ?? null })));

const genreRows = new Map(); const movieGenreRows = []; const seriesGenreRows = [];
for (const movie of movies) for (const name of movie.genres) {
  const slug = slugify(name); const id = uuid(`genre:${slug}`); genreRows.set(id, { id, name, slug });
  movieGenreRows.push({ movie_id: uuid(`content:movie:${movie.id}`), genre_id: id });
}
for (const item of series) for (const name of item.genres ?? []) {
  const slug = slugify(name); const id = uuid(`genre:${slug}`); genreRows.set(id, { id, name, slug });
  seriesGenreRows.push({ series_id: uuid(`content:series:${item.id}`), genre_id: id });
}
await upsert('genres', [...genreRows.values()]); report.genres = genreRows.size;
await upsert('movie_genres', movieGenreRows, 'movie_id,genre_id');
await upsert('series_genres', seriesGenreRows, 'series_id,genre_id');

const parts = []; const seasons = []; const episodes = []; const sources = [];
for (const movie of movies) for (const part of movie.parts) {
  const partId = uuid(`movie-part:${movie.id}:${part.id}`);
  parts.push({ id: partId, movie_id: uuid(`content:movie:${movie.id}`), legacy_id: part.id, part_number: part.partNumber, title: part.title });
  for (const [kind, ref] of [['trailer', part.trailerUrl], ['playback', part.videoUrl], ['download', part.downloadUrl]]) {
    const source = sourceRecord('movie_part_id', partId, kind, ref); if (source) sources.push(source);
  }
}
for (const item of series) {
  const seasonKey = item.legacySeasonId ?? item.slug;
  const seasonId = uuid(`season:${item.id}:${seasonKey}`);
  seasons.push({ id: seasonId, series_id: uuid(`content:series:${item.id}`), legacy_id: seasonKey, season_number: item.seasonNumber, title: item.legacySeasonTitle ?? null });
  for (const episode of item.episodes) {
    const episodeId = uuid(`episode:${item.id}:${seasonKey}:${episode.id}`);
    episodes.push({ id: episodeId, season_id: seasonId, legacy_id: episode.id, episode_number: episode.episodeNumber,
      title: episode.title, description: episode.description ?? null, quality: episode.quality ?? null,
      thumbnail_asset_id: episode.image ? uuid(`asset:legacy_local:${episode.image}`) : null });
    for (const [kind, ref] of [['trailer', episode.trailerUrl], ['playback', episode.videoUrl], ['download', episode.downloadUrl]]) {
      const source = sourceRecord('episode_id', episodeId, kind, ref); if (source) sources.push(source);
    }
  }
}
await upsert('movie_parts', parts);
await upsert('seasons', seasons);
await upsert('episodes', episodes);
await upsert('media_sources', sources);

console.log(JSON.stringify({ mode: 'applied', ...report, importedParts: parts.length, importedSeasons: seasons.length,
  importedEpisodes: episodes.length, importedSources: sources.length, sourceState: 'inactive pending authorization/operational review' }, null, 2));
