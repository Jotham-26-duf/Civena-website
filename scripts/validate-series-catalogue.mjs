const { series, validateSeriesCatalogue } = await import('../src/data/series.ts');

const errors = validateSeriesCatalogue(series);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const episodeCount = series.reduce((total, season) => total + season.episodes.length, 0);
  console.log(JSON.stringify({ valid: true, seasons: series.length, episodes: episodeCount }, null, 2));
}
