import type { SeriesEntry } from "@/types/series";

/** Returns validation errors without changing or filling source records. */
export function validateSeriesCatalogue(
  entries: readonly SeriesEntry[],
): string[] {
  const errors: string[] = [];
  const ids = new Set<number>();
  const slugs = new Set<string>();
  const episodeIds = new Set<string>();

  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.id) || entry.id <= 0 || ids.has(entry.id))
      errors.push(`Invalid or duplicate season catalogue ID: ${entry.id}`);
    ids.add(entry.id);
    if (!entry.slug.trim() || slugs.has(entry.slug))
      errors.push(`Missing or duplicate season slug: ${entry.slug}`);
    slugs.add(entry.slug);
    if (!entry.title.trim()) errors.push(`Missing season title: ${entry.slug}`);
    if (!Number.isSafeInteger(entry.seasonNumber) || entry.seasonNumber <= 0)
      errors.push(`Invalid season number: ${entry.slug}`);
    if (!Array.isArray(entry.episodes)) {
      errors.push(`Missing episodes array: ${entry.slug}`);
      continue;
    }
    const episodeNumbers = new Set<number>();
    let previousEpisodeNumber = 0;
    for (const episode of entry.episodes) {
      if (!episode.id.trim() || episodeIds.has(episode.id))
        errors.push(`Missing or duplicate episode ID: ${episode.id}`);
      episodeIds.add(episode.id);
      if (
        !Number.isSafeInteger(episode.episodeNumber) ||
        episode.episodeNumber <= 0 ||
        episodeNumbers.has(episode.episodeNumber)
      ) {
        errors.push(
          `Invalid or duplicate episode number ${episode.episodeNumber} in ${entry.slug}`,
        );
      }
      if (episode.episodeNumber < previousEpisodeNumber)
        errors.push(
          `Episodes are not ordered by episodeNumber in ${entry.slug}`,
        );
      previousEpisodeNumber = episode.episodeNumber;
      episodeNumbers.add(episode.episodeNumber);
      if (typeof episode.title !== "string")
        errors.push(`Missing episode title field for ${episode.id}`);
      for (const key of ["videoUrl", "downloadUrl"] as const) {
        const value = episode[key];
        if (value === undefined || value === "") continue;
        try {
          const parsed = new URL(value);
          if (
            (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
            !parsed.hostname
          )
            throw new Error("invalid URL");
        } catch {
          errors.push(`Invalid ${key} for episode ${episode.id}`);
        }
      }
    }
    if (entry.trailerUrl) {
      try {
        const parsed = new URL(entry.trailerUrl);
        if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname)
          throw new Error("invalid URL");
      } catch {
        errors.push(`Invalid trailerUrl for season ${entry.slug}`);
      }
    }
  }

  return errors;
}
