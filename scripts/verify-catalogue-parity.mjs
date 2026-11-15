import { createHash } from 'node:crypto';

const { movies } = await import('../src/data/movies.ts');
const { series } = await import('../src/data/series.ts');
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!baseUrl || !secret) throw new Error('Parity verification requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.');

const uuid = (key) => {
  const bytes = createHash('sha256').update(`cineva-catalogue-v1:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
const slugify = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const assetId = (path) => uuid(`asset:legacy_local:${path}`);
const contentId = (type, id) => uuid(`content:${type}:${id}`);
const canonical = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());

async function fetchRows(table, select = '*') {
  const result = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const endpoint = new URL(`/rest/v1/${table}`, baseUrl);
    endpoint.searchParams.set('select', select);
    endpoint.searchParams.set('order', 'id.asc');
    const response = await fetch(endpoint, { headers: { apikey: secret, Authorization: `Bearer ${secret}`, Range: `${offset}-${offset + size - 1}` }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Parity query failed for ${table} (HTTP ${response.status}); response details were suppressed.`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Parity query returned an invalid ${table} response.`);
    result.push(...page);
    if (page.length < size) return result;
  }
}

const checks = [];
const invalidSourceReferences = [];
function compare(name, expected, actual) {
  const left = expected.map(canonical).sort();
  const right = actual.map(canonical).sort();
  const expectedSet = new Set(left);
  const actualSet = new Set(right);
  const missing = left.filter((row) => !actualSet.has(row)).length;
  const extra = right.filter((row) => !expectedSet.has(row)).length;
  checks.push({ name, expected: expected.length, actual: actual.length, missing, extra, passed: missing === 0 && extra === 0 });
}

const contentExpected = [];
const movieExpected = [];
const seriesExpected = [];
const partExpected = [];
const seasonExpected = [];
const episodeExpected = [];
const genreBySlug = new Map();
const movieGenreExpected = [];
const seriesGenreExpected = [];
const assetById = new Map();
const sourceExpected = [];
const addAsset = (path, type) => {
  if (path?.startsWith('/')) assetById.set(assetId(path), { id: assetId(path), asset_type: type, provider: 'legacy_local', bucket: 'legacy', object_key: path });
};
const addSource = (parentField, parentId, kind, reference) => {
  if (!reference?.trim()) return;
  let parsed;
  try { parsed = new URL(reference); } catch { invalidSourceReferences.push({ parentId, kind, value: reference }); return; }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) { invalidSourceReferences.push({ parentId, kind, value: reference }); return; }
  sourceExpected.push({ id: uuid(`source:${parentId}:${kind}:${reference}`), movie_part_id: parentField === 'movie_part_id' ? parentId : null,
    episode_id: parentField === 'episode_id' ? parentId : null, source_kind: kind, provider: parsed.hostname.toLowerCase(),
    external_reference: reference, is_active: false, is_public: false });
};

for (const movie of movies) {
  const id = contentId('movie', movie.id);
  contentExpected.push({ id, content_type: 'movie', legacy_id: movie.id, slug: movie.slug, title: movie.title, description: movie.description ?? null,
    release_year: movie.year ?? null, legacy_created_date: movie.createdAt ?? null, language: movie.language ?? null, narrator: movie.narrator ?? null,
    quality: movie.quality ?? null, is_featured: movie.featured ?? null, is_new: movie.isNew ?? null, status: 'draft',
    poster_asset_id: movie.poster ? assetId(movie.poster) : null, banner_asset_id: movie.banner ? assetId(movie.banner) : null,
    narrator_image_asset_id: movie.narratorImage ? assetId(movie.narratorImage) : null });
  movieExpected.push({ content_id: id, rating: movie.rating ?? null, views_label: movie.views ?? null });
  addAsset(movie.poster, 'poster'); addAsset(movie.banner, 'banner'); addAsset(movie.narratorImage, 'narrator_image');
  for (const name of movie.genres) {
    const slug = slugify(name); const genreId = uuid(`genre:${slug}`);
    genreBySlug.set(slug, { id: genreId, name, slug });
    movieGenreExpected.push({ movie_id: id, genre_id: genreId });
  }
  for (const part of movie.parts) {
    const partId = uuid(`movie-part:${movie.id}:${part.id}`);
    partExpected.push({ id: partId, movie_id: id, legacy_id: part.id, part_number: part.partNumber, title: part.title });
    addSource('movie_part_id', partId, 'trailer', part.trailerUrl); addSource('movie_part_id', partId, 'playback', part.videoUrl); addSource('movie_part_id', partId, 'download', part.downloadUrl);
  }
}
for (const item of series) {
  const id = contentId('series', item.id);
  contentExpected.push({ id, content_type: 'series', legacy_id: item.id, slug: item.slug, title: item.title, description: item.description ?? null,
    release_year: item.year ?? null, legacy_created_date: item.createdAt ?? null, language: item.language ?? null, narrator: item.narrator ?? null, quality: item.quality ?? null,
    is_featured: item.featured ?? null, is_new: item.isNew ?? null, status: 'draft', poster_asset_id: item.image ? assetId(item.image) : null,
    banner_asset_id: item.banner ? assetId(item.banner) : null, narrator_image_asset_id: item.narratorImage ? assetId(item.narratorImage) : null });
  seriesExpected.push({ content_id: id, views_label: item.views ?? null });
  addAsset(item.image, 'poster'); addAsset(item.banner, 'banner'); addAsset(item.narratorImage, 'narrator_image');
  for (const name of item.genres ?? []) {
    const slug = slugify(name); const genreId = uuid(`genre:${slug}`);
    genreBySlug.set(slug, { id: genreId, name, slug });
    seriesGenreExpected.push({ series_id: id, genre_id: genreId });
  }
  const seasonKey = item.legacySeasonId ?? item.slug;
  const seasonId = uuid(`season:${item.id}:${seasonKey}`);
  seasonExpected.push({ id: seasonId, series_id: id, legacy_id: seasonKey, season_number: item.seasonNumber, title: item.legacySeasonTitle ?? null });
  for (const episode of item.episodes) {
    const episodeId = uuid(`episode:${item.id}:${seasonKey}:${episode.id}`);
    episodeExpected.push({ id: episodeId, season_id: seasonId, legacy_id: episode.id, episode_number: episode.episodeNumber,
      title: episode.title, description: episode.description ?? null, quality: episode.quality ?? null,
      thumbnail_asset_id: episode.image ? assetId(episode.image) : null });
    addAsset(episode.image, 'thumbnail');
    addSource('episode_id', episodeId, 'trailer', episode.trailerUrl); addSource('episode_id', episodeId, 'playback', episode.videoUrl); addSource('episode_id', episodeId, 'download', episode.downloadUrl);
  }
}

const [contentRows, movieRows, seriesRows, partRows, seasonRows, episodeRows, genreRows, movieGenreRows, seriesGenreRows, assetRows, sourceRows] = await Promise.all([
  fetchRows('content_items', 'id,content_type,legacy_id,slug,title,description,release_year,legacy_created_date,language,narrator,quality,is_featured,is_new,status,poster_asset_id,banner_asset_id,narrator_image_asset_id'),
  fetchRows('movies', 'content_id,rating,views_label'), fetchRows('series', 'content_id,views_label'),
  fetchRows('movie_parts', 'id,movie_id,legacy_id,part_number,title'), fetchRows('seasons', 'id,series_id,legacy_id,season_number,title'),
  fetchRows('episodes', 'id,season_id,legacy_id,episode_number,title,description,quality,thumbnail_asset_id'),
  fetchRows('genres', 'id,name,slug'), fetchRows('movie_genres', 'movie_id,genre_id'), fetchRows('series_genres', 'series_id,genre_id'),
  fetchRows('media_assets', 'id,asset_type,provider,bucket,object_key'), fetchRows('media_sources', 'id,movie_part_id,episode_id,source_kind,provider,external_reference,is_active,is_public'),
]);

const movieContentIds = new Set(movies.map((movie) => contentId('movie', movie.id)));
const seriesContentIds = new Set(series.map((item) => contentId('series', item.id)));
const expectedPartIds = new Set(partExpected.map((row) => row.id));
const expectedSeasonIds = new Set(seasonExpected.map((row) => row.id));
const expectedEpisodeIds = new Set(episodeExpected.map((row) => row.id));
const expectedGenreIds = new Set([...genreBySlug.values()].map((row) => row.id));
const expectedAssetPaths = new Set([...assetById.values()].map((row) => row.object_key));
compare('content_items', contentExpected, contentRows.filter((row) => contentExpected.some((expected) => expected.content_type === row.content_type && expected.legacy_id === Number(row.legacy_id))));
compare('movies subtype', movieExpected, movieRows.filter((row) => movieContentIds.has(row.content_id)));
compare('series subtype', seriesExpected, seriesRows.filter((row) => seriesContentIds.has(row.content_id)));
compare('movie_parts', partExpected, partRows.filter((row) => movieContentIds.has(row.movie_id)));
compare('seasons', seasonExpected, seasonRows.filter((row) => seriesContentIds.has(row.series_id)));
compare('episodes', episodeExpected, episodeRows.filter((row) => expectedSeasonIds.has(row.season_id)));
compare('genres', [...genreBySlug.values()], genreRows.filter((row) => genreBySlug.has(row.slug)));
compare('movie_genres', movieGenreExpected, movieGenreRows.filter((row) => movieContentIds.has(row.movie_id) && expectedGenreIds.has(row.genre_id)));
compare('series_genres', seriesGenreExpected, seriesGenreRows.filter((row) => seriesContentIds.has(row.series_id)));
compare('legacy artwork metadata', [...assetById.values()], assetRows.filter((row) => row.provider === 'legacy_local' && expectedAssetPaths.has(row.object_key)));
compare('media_sources', sourceExpected, sourceRows.filter((row) => expectedPartIds.has(row.movie_part_id) || expectedEpisodeIds.has(row.episode_id)));

const failed = checks.filter((check) => !check.passed);
console.log(JSON.stringify({ mode: 'read-only-parity-check', source: { movies: movies.length, parts: partExpected.length, series: series.length, seasons: seasonExpected.length, episodes: episodeExpected.length }, passed: failed.length === 0 && invalidSourceReferences.length === 0, checks, invalidSourceReferences }, null, 2));
if (failed.length || invalidSourceReferences.length) process.exitCode = 1;
