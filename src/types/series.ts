export type Episode = {
  id: string;
  episodeNumber: number;
  title: string;
  description?: string;
  videoUrl?: string;
  downloadUrl?: string;
  quality?: string;
  duration?: string;
  image?: string;
};

/** One catalogue record per season; episode data belongs directly to that season. */
export type SeriesEntry = {
  /** Existing content_items UUID when normalized from the current database schema. */
  contentId?: string;
  /** Numeric application catalogue ID, unique per season entry. */
  id: number;
  slug: string;
  title: string;
  seasonNumber: number;
  trailerUrl?: string;
  episodes: Episode[];
  /** Legacy season key used by the import/parity tools while the database schema remains unchanged. */
  legacySeasonId?: string;
  legacySeasonTitle?: string;
  year?: number;
  rating?: number | null;
  createdAt?: string | null;
  narrator?: string;
  narratorImage?: string;
  quality?: string;
  genres?: string[];
  views?: string;
  image?: string;
  banner?: string;
  description?: string;
  published?: string;
  featured?: boolean | null;
  language?: string;
  isNew?: boolean;
  /** Existing parent slug retained only to resolve saved links during the app reset. */
  legacySlug?: string;
};
