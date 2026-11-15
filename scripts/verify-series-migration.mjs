import assert from 'node:assert/strict';

const [{ series: legacySeries }, { series: seasonEntries, validateSeriesCatalogue }] = await Promise.all([
  import('../src/data/series.legacy.ts'),
  import('../src/data/series.ts'),
]);

const errors = validateSeriesCatalogue(seasonEntries);
assert.deepEqual(errors, [], errors.join('\n'));
assert.equal(seasonEntries.some((entry) => 'seasons' in entry), false, 'application season entries must not contain a seasons array');

let oldEpisodeCount = 0;
for (const oldSeries of legacySeries) {
  for (const oldSeason of oldSeries.seasons) {
    const entry = seasonEntries.find((candidate) =>
      (candidate.legacySlug ?? candidate.slug) === oldSeries.slug && candidate.legacySeasonId === oldSeason.id,
    );
    assert.ok(entry, `missing migrated season ${oldSeason.id}`);
    assert.equal(entry.seasonNumber, oldSeason.seasonNumber);
    for (const field of ['year', 'rating', 'createdAt', 'narrator', 'narratorImage', 'quality', 'genres', 'views', 'image', 'banner', 'description', 'published', 'featured', 'language', 'isNew']) {
      assert.deepEqual(entry[field], oldSeries[field], `${field} changed for season ${entry.slug}`);
    }
    for (const oldEpisode of oldSeason.episodes) {
      oldEpisodeCount++;
      const migrated = entry.episodes.find((episode) => episode.id === oldEpisode.id);
      assert.ok(migrated, `missing episode ${oldEpisode.id} in ${entry.slug}`);
      for (const field of ['episodeNumber', 'title', 'description', 'trailerUrl', 'videoUrl', 'downloadUrl']) {
        assert.equal(migrated[field], oldEpisode[field], `${field} changed for episode ${oldEpisode.id}`);
      }
    }
  }
}

assert.equal(seasonEntries.reduce((total, entry) => total + entry.episodes.length, 0), oldEpisodeCount);
console.log(JSON.stringify({ preserved: true, seasons: seasonEntries.length, episodes: oldEpisodeCount }, null, 2));
