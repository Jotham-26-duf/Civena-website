"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Search,
  Bell,
  MessageSquareText,
  Heart,
  Sun,
  Moon,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Play,
  Plus,
  ArrowRight,
  Clapperboard,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  MonitorPlay,
  CircleHelp,
  Download,
  Share2,
  House,
  Film,
  Tv,
  Eye,
  Mic,
  MessageCircle,
  CalendarDays,
  Clock3,
  Globe2,
  ListVideo,
} from "lucide-react";
import type { Movie, MoviePart } from "@/data/movies";
import type { SeriesEntry, Episode } from "@/data/series";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DiscussionClient } from "@/components/DiscussionClient";
import { ExpandableDescription } from "@/components/ExpandableDescription";
import { readGuestFavorites, removeSyncedGuestFavorites, writeGuestFavorites } from "@/lib/guest-persistence";

type Props = { initial?: "movies" | "series" | "services" | "favorites"; detail?: string; movies: Movie[]; series: SeriesEntry[] };
const links = [
  { label: "Home", href: "/", Icon: House },
  { label: "Movies", href: "/movies", Icon: Film },
  { label: "Series", href: "/series", Icon: Tv },
  { label: "Favorites", href: "/favorites", Icon: Heart },
  { label: "Services", href: "/services", Icon: MonitorPlay },
];
const palettes = [
  "#572c48,#17254c",
  "#654332,#182844",
  "#31234d,#163b46",
  "#613141,#202544",
  "#4a402a,#202744",
  "#303e5d,#322647",
];
function Poster({
  title,
  index,
  large = false,
  image = "",
  clean = false,
}: {
  title: string;
  index: number;
  large?: boolean;
  image?: string | null;
  clean?: boolean;
}) {
  const unoptimizedImage = !image?.startsWith("/");
  return (
    <div
      className={`poster ${large ? "poster-large" : ""}`}
      style={
        { "--poster": palettes[index % palettes.length] } as React.CSSProperties
      }
    >
      {image && (
        <Image
          className="poster-image"
          src={image}
          alt={title}
          fill
          sizes="(max-width: 767px) 45vw, (max-width: 1199px) 30vw, 17vw"
          quality={82}
          unoptimized={unoptimizedImage}
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
      )}
      <span className="poster-fallback" aria-hidden="true" style={{ display: image ? "none" : "flex" }}><Clapperboard size={28} /><b>{title}</b><small>CINEVA · FILMS STREAMING</small></span>
      {!clean && <>
        <div className="poster-glow" />
        <span className="poster-mark">C<span>·</span></span>
        <b>{title}</b>
        <small>CINEVA · FILMS STREAMING</small>
      </>}
    </div>
  );
}

function favoriteKey(item: Movie | SeriesEntry) {
  return item.contentId ?? `local:${item.slug.toLowerCase()}`;
}

function getYouTubeEmbedUrl(trailerUrl: string) {
  try {
    const url = new URL(trailerUrl);
    const host = url.hostname.toLowerCase();
    let videoId = "";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com" ||
      host === "www.youtube-nocookie.com"
    ) {
      videoId =
        url.searchParams.get("v") ??
        url.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/)?.[1] ??
        "";
    } else {
      return undefined;
    }

    return /^[\w-]{11}$/.test(videoId)
      ? `https://www.youtube.com/embed/${videoId}`
      : undefined;
  } catch {
    return undefined;
  }
}

function getPlayableVideoUrl(videoUrl?: string | null): string | null {
  if (!videoUrl?.trim()) return null;
  try {
    const parsed = new URL(videoUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? videoUrl : null;
  } catch {
    return null;
  }
}

function getGoogleDrivePreviewUrl(videoUrl?: string | null): string | null {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    if (url.hostname !== "drive.google.com") return null;
    const fileId = url.pathname.match(/^\/file\/d\/([^/]+)/)?.[1];
    return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;
  } catch {
    return null;
  }
}

function isSupportedTrailerSource(value: string): boolean {
  return Boolean(getYouTubeEmbedUrl(value) || getGoogleDrivePreviewUrl(value) ||
    (getPlayableVideoUrl(value) && /\.(?:mp4|webm|ogg|m3u8)(?:[?#]|$)/i.test(value)));
}

type PlaybackTarget = { url: string; partId?: string; episodeId?: string };

function firstPlaybackTarget(item: Movie | SeriesEntry): PlaybackTarget | null {
  if ("parts" in item) {
    const part = item.parts.find((candidate) => getPlayableVideoUrl(candidate.videoUrl));
    return part ? { url: getPlayableVideoUrl(part.videoUrl)!, partId: part.id } : null;
  }
  for (const episode of item.episodes) {
    const url = getPlayableVideoUrl(episode.videoUrl);
    if (url) return { url, episodeId: episode.id };
  }
  return null;
}

function parseViewCount(label: string): number | null {
  const match = label.trim().replace(/,/g, "").toUpperCase().match(/^(\d+(?:\.\d+)?)\s*([KMB])?(?:\s+VIEWS?)?$/);
  if (!match) return null;
  const multiplier = match[2] === "K" ? 1_000 : match[2] === "M" ? 1_000_000 : match[2] === "B" ? 1_000_000_000 : 1;
  const count = Number(match[1]) * multiplier;
  return Number.isFinite(count) ? count : null;
}

function contentDate(item: Movie | SeriesEntry): string | null | undefined {
  return item.published ?? item.createdAt;
}

function contentTimestamp(item: Movie | SeriesEntry): number | null {
  for (const value of [item.published, item.createdAt]) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function relativeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "Today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function isRecentlyAdded(item: Movie | SeriesEntry): boolean {
  const value = contentDate(item);
  if (!value) return false;
  const timestamp = Date.parse(value);
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= 7 * 86_400_000;
}

function formatViewCount(count: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

function TrailerInfoCard({ item, index, trailerUrl }: { item: Movie | SeriesEntry; index: number; trailerUrl?: string | null }) {
  const artwork = "parts" in item ? item.poster : item.image;
  const safeLink = getPlayableVideoUrl(trailerUrl);
  return <div className="trailer-info-card" role="status">
    <div className="trailer-info-art"><Poster title={item.title} index={index} image={artwork} clean /></div>
    <div className="trailer-info-copy">
      <span className="trailer-unavailable-label">Trailer unavailable</span>
      <h2>{item.title}</h2>
      <div className="trailer-info-meta">
        {item.year != null && <span>{item.year}</span>}
        {item.genres?.length ? <span>{item.genres.join(" · ")}</span> : null}
        {item.language && <span>{item.language}</span>}
        {item.rating != null && <span>★ {item.rating.toFixed(1)}</span>}
      </div>
      {item.description?.trim() && <p>{item.description}</p>}
      {safeLink && <a className="secondary trailer-source-link" href={safeLink} target="_blank" rel="noreferrer">Open trailer link</a>}
    </div>
  </div>;
}

function TrailerFrame({ trailerUrl, item, index }: { trailerUrl?: string | null; item: Movie | SeriesEntry; index: number }) {
  const [loaded, setLoaded] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  useEffect(() => { setLoaded(false); setMediaFailed(false); }, [trailerUrl]);
  const source = trailerUrl?.trim();
  if (mediaFailed || !source) return <TrailerInfoCard item={item} index={index} trailerUrl={source} />;

  const embedUrl = getYouTubeEmbedUrl(source);
  const drivePreview = getGoogleDrivePreviewUrl(source);
  if (drivePreview) {
    return <><iframe className="trailer-frame" src={drivePreview} title={`${item.title} trailer`} allow="autoplay; encrypted-media" allowFullScreen onLoad={() => setLoaded(true)} onError={() => setMediaFailed(true)} />{!loaded && <span className="trailer-loading" role="status">Loading trailer…</span>}</>;
  }

  if (embedUrl) {
    return <><iframe className="trailer-frame" src={embedUrl} title={`${item.title} trailer`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen onLoad={() => setLoaded(true)} onError={() => setMediaFailed(true)} />{!loaded && <span className="trailer-loading" role="status">Loading trailer…</span>}</>;
  }

  if (getPlayableVideoUrl(source) && /\.(?:mp4|webm|ogg|m3u8)(?:[?#]|$)/i.test(source)) {
    return <><video className="trailer-frame" controls preload="metadata" src={source} onCanPlay={() => setLoaded(true)} onError={() => setMediaFailed(true)} />{!loaded && <span className="trailer-loading" role="status">Loading trailer…</span>}</>;
  }

  // Invalid YouTube links and unsupported providers render the content card instead of a blank frame.
  return <TrailerInfoCard item={item} index={index} trailerUrl={source} />;
}

function MovieCard({
  item,
  index,
  onWatch,
  favorite,
  onFavorite,
  layout = "poster",
}: {
  item: Movie | SeriesEntry;
  index: number;
  onWatch: () => void;
  favorite: boolean;
  onFavorite: () => void;
  layout?: "poster" | "feed";
}) {
  const isSeries = !("parts" in item);
  const viewCount = item.views ? parseViewCount(item.views) : null;
  const episodeCount = isSeries ? item.episodes.length : 0;
  const addedDate = relativeDate(contentDate(item));
  const favoriteButton = <button
    className={`poster-badge favorite-badge card-favorite ${favorite ? "is-fav" : ""}`}
    aria-label={favorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`}
    aria-pressed={favorite}
    type="button"
    onClick={onFavorite}
  >
    <Heart size={14} fill={favorite ? "currentColor" : "none"} />
  </button>;
  return (
    <article className={`card cinema-card${layout === "feed" ? " recent-feed-card" : ""}`}>
      <div className="card-badges">
        {item.narrator && <span className="card-narrator-badge">
          {item.narratorImage && <img className="narrator-image" src={item.narratorImage} alt="" />}
          <Mic size={13} /> {item.narrator}
        </span>}
        {item.quality && <span className="card-quality-badge">{item.quality}</span>}
      </div>
      <div className="poster-stage">
        <a className="poster-frame" href={`/details/${encodeURIComponent(item.slug)}`} aria-label={`View details for ${item.title}`}>
          <Poster title={item.title} index={index} image={"poster" in item ? item.poster : item.image} clean />
        </a>
      </div>
      <div className="card-info">
        <div className="card-heading">
          <h3 className="card-title"><a href={`/details/${encodeURIComponent(item.slug)}`}>{item.title}</a></h3>
          {favoriteButton}
        </div>
        <div className="card-meta cinema-card-meta">
          <span className="cinema-card-type">{isSeries ? "Season" : "Movie"}</span>
          {item.year != null && <span>{item.year}</span>}
          {isSeries && <span>Season {item.seasonNumber} • {episodeCount} {episodeCount === 1 ? "Episode" : "Episodes"}</span>}
          {!isSeries && item.parts.length > 1 && <span>{item.parts.length} Parts</span>}
          {!isSeries && item.language && <span>{item.language}</span>}
          {viewCount !== null && <span className="cinema-card-views"><Eye size={13} /> {formatViewCount(viewCount)} views</span>}
          {addedDate && <span>{addedDate}</span>}
          {isRecentlyAdded(item) && <span className="cinema-card-new">NEW</span>}
        </div>
        <button className="card-watch-button" type="button" onClick={onWatch} aria-label={`Watch ${item.title}`}>
          <Play size={14} fill="currentColor" /> WATCH
        </button>
      </div>
    </article>
  );
}

function stableContentIdentity(item: Movie | SeriesEntry): string {
  return "parts" in item ? `movie:${item.contentId ?? `legacy-${item.id}`}` : `season:${item.slug}`;
}

function uniqueContent<T extends Movie | SeriesEntry>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const identity = stableContentIdentity(item);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function newestFirst<T extends Movie | SeriesEntry>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aFeatured = a.featured === true;
    const bFeatured = b.featured === true;
    if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
    const aId = Number(a.id);
    const bId = Number(b.id);
    const safeA = Number.isFinite(aId) ? aId : Number.NEGATIVE_INFINITY;
    const safeB = Number.isFinite(bId) ? bId : Number.NEGATIVE_INFINITY;
    return safeB - safeA;
  });
}

function recentlyAddedFirst(movies: Movie[], series: SeriesEntry[]): (Movie | SeriesEntry)[] {
  const items = uniqueContent([...movies, ...series]);
  return items.sort((a, b) => {
    const aTimestamp = contentTimestamp(a);
    const bTimestamp = contentTimestamp(b);
    if (aTimestamp === null) return bTimestamp === null ? 0 : 1;
    if (bTimestamp === null) return -1;
    return bTimestamp - aTimestamp;
  });
}

function interleaveFeatured(movies: Movie[], series: SeriesEntry[]): (Movie | SeriesEntry)[] {
  const latest = <T extends Movie | SeriesEntry>(items: T[]) => uniqueContent(items).sort((a, b) => {
    const dateA = contentTimestamp(a), dateB = contentTimestamp(b);
    if (dateA !== null || dateB !== null) return (dateB ?? 0) - (dateA ?? 0);
    return b.id - a.id;
  }).slice(0, 2);
  const seenSeries = new Set<string>();
  const distinctSeries = series.filter((item) => {
    const id = item.contentId ?? item.legacySlug ?? item.slug.replace(/-season-\d+$/i, "");
    if (seenSeries.has(id)) return false;
    seenSeries.add(id);
    return true;
  });
  return [...latest(distinctSeries), ...latest(movies)];
}

function Row({
  title,
  items,
  onWatch,
  favorites,
  toggle,
  href,
}: {
  title: string;
  items: (Movie | SeriesEntry)[];
  onWatch: (item: Movie | SeriesEntry) => void;
  favorites: string[];
  toggle: (item: Movie | SeriesEntry) => void;
  href: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const update = () => {
      setCanScrollLeft(node.scrollLeft > 2);
      setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 2);
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => { node.removeEventListener("scroll", update); window.removeEventListener("resize", update); observer.disconnect(); };
  }, [items.length]);
  return (
    <section className="catalog-row">
      <div className="section-head">
        <h2>
          {title === "All Movies" ? <Film size={27} /> : title === "All Series" ? <Tv size={27} /> : <Clapperboard size={27} />} {title}
        </h2>
        <a className="view-all" href={href}>
          View all <ArrowRight size={16} />
        </a>
      </div>
      <div className="rail-wrap">
          <div className="card-rail" ref={rail} tabIndex={0} role="region" aria-label={`${title} carousel`}>
        {items.map((m, i) => (
          <MovieCard
            key={stableContentIdentity(m)}
            item={m}
            index={i}
            onWatch={() => onWatch(m)}
            favorite={favorites.includes(favoriteKey(m))}
            onFavorite={() => toggle(m)}
          />
        ))}
      </div>
      <button className="rail-arrow rail-arrow-left" aria-label={`Scroll ${title} left`} disabled={!canScrollLeft} onClick={() => { const node = rail.current; if (node) node.scrollBy({ left: -node.clientWidth * 0.9, behavior: "smooth" }); }}>
        <ChevronLeft size={23} />
      </button>
      <button className="rail-arrow rail-arrow-right" aria-label={`Scroll ${title} right`} disabled={!canScrollRight} onClick={() => { const node = rail.current; if (node) node.scrollBy({ left: node.clientWidth * 0.9, behavior: "smooth" }); }}>
        <ChevronRight size={23} />
      </button>
      </div>
    </section>
  );
}

function RecentlyAddedFeed({
  items,
  onWatch,
  favorites,
  toggle,
}: {
  items: (Movie | SeriesEntry)[];
  onWatch: (item: Movie | SeriesEntry) => void;
  favorites: string[];
  toggle: (item: Movie | SeriesEntry) => void;
}) {
  return (
    <section className="recent-feed" aria-labelledby="recent-feed-title">
      <div className="section-head"><h2 id="recent-feed-title"><Clapperboard size={27} /> Recently Added Movies &amp; Series</h2></div>
      <div className="recent-feed-list">
        {items.map((item, index) => <MovieCard
          key={stableContentIdentity(item)}
          item={item}
          index={index}
          onWatch={() => onWatch(item)}
          favorite={favorites.includes(favoriteKey(item))}
          onFavorite={() => toggle(item)}
          layout="feed"
        />)}
      </div>
    </section>
  );
}
export default function Studio({ initial, detail, movies, series }: Props) {
  const [active, setActive] = useState(0),
    [heroCycle, setHeroCycle] = useState(0),
    [query, setQuery] = useState(""),
    [mobile, setMobile] = useState(false),
    [favorites, setFavorites] = useState<string[]>([]),
    [busyFavoriteIds, setBusyFavoriteIds] = useState<Set<string>>(() => new Set()),
    [favoritesLoading, setFavoritesLoading] = useState(true),
    [favoritesError, setFavoritesError] = useState(""),
    [viewer, setViewer] = useState<string | null>(null),
    [unreadMessages, setUnreadMessages] = useState<number | null>(null),
    [unreadNotifications, setUnreadNotifications] = useState<number | null>(null),
    [onlyFav, setOnlyFav] = useState(false),
    [light, setLight] = useState(false),
    [settingsLoaded, setSettingsLoaded] = useState(false),
    [notice, setNotice] = useState(""),
    [email, setEmail] = useState(""),
    [showScrollTop, setShowScrollTop] = useState(false),
    [selectedPartId, setSelectedPartId] = useState(""),
    [selectedEpisodeId, setSelectedEpisodeId] = useState(""),
    [playerSrc, setPlayerSrc] = useState(""),
    [watchMode, setWatchMode] = useState(false);
  useEffect(() => {
    const update = () => setShowScrollTop(window.scrollY > 480);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    try {
      setLight(window.localStorage.getItem("cineva-theme") === "light");
      setOnlyFav(window.localStorage.getItem("cineva-favorites-filter") === "on");
    } catch { /* Private browsing can disable local storage; controls still work for this visit. */ }
    setSettingsLoaded(true);
  }, []);
  useEffect(() => {
    if (!settingsLoaded) return;
    try { window.localStorage.setItem("cineva-theme", light ? "light" : "dark"); } catch { /* Keep the current session state. */ }
  }, [light, settingsLoaded]);
  useEffect(() => {
    if (!settingsLoaded) return;
    try { window.localStorage.setItem("cineva-favorites-filter", onlyFav ? "on" : "off"); } catch { /* Keep the current session state. */ }
  }, [onlyFav, settingsLoaded]);
  const all: (Movie | SeriesEntry)[] = [...movies, ...series];
  const publishedContentIds = new Set(all.map((item) => item.contentId).filter((id): id is string => Boolean(id)));
  const featuredSlides = useMemo(() => {
    return interleaveFeatured(movies, series);
  }, [movies, series]);
  const categories = useMemo(() => [...new Set(all.flatMap((item) => ["genres" in item ? item.genres ?? [] : [], "category" in item ? item.category ?? [] : []]).flat().filter((value): value is string => Boolean(value)))].sort(), [movies, series]);
  const [category, setCategory] = useState("");
  const watchRowIds = useRef(new Map<string, { id: string; userId: string }>());
  const busyFavoriteIdsRef = useRef(new Set<string>());
  const watchEvents = useRef(new Set<string>());
  const lastProgressWrite = useRef(0);
  const found = useMemo(
    () =>
      all.filter(
        (x) =>
          (x.title.toLowerCase().includes(query.toLowerCase()) || (x.narrator || "").toLowerCase().includes(query.toLowerCase())) &&
          (!category || ("genres" in x && (x.genres ?? []).includes(category)) || ("category" in x && x.category === category)),
      ),
    [all, query, category],
  );
  useEffect(() => {
    let active = true;
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | undefined;
    void (async () => {
      const guestFavorites = readGuestFavorites();
      if (!active) return;
      setFavorites(guestFavorites.keys);
      if (!guestFavorites.ok) setFavoritesError("Favorites saved on this device could not be read. Check your browser storage settings.");
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (!active) return;
        if (userError || !user) { setFavoritesLoading(false); return; }
        setViewer(user.id);
        const { data: profile, error: profileError } = await supabase.from("profiles").select("account_status").eq("id", user.id).maybeSingle();
        if (profileError) { setFavoritesError("Account favorites could not be checked. Your device favorites are still available."); setFavoritesLoading(false); return; }
        if (profile?.account_status !== "active") { setFavoritesError("Account favorites are unavailable. Your device favorites are still available."); setFavoritesLoading(false); return; }
        const [{ data: favoriteRows, error: favoriteLoadError }, { count: notificationCount, error: notificationError }] = await Promise.all([
          supabase.from("favorites").select("content_id").eq("user_id", user.id),
          supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", user.id).is("read_at", null),
        ]);
        if (!active) return;
        if (favoriteLoadError) {
          setFavoritesError("Account favorites could not be loaded. Your device favorites are still available.");
        } else {
          const accountFavorites = favoriteRows?.map((row) => row.content_id) ?? [];
          const syncableFavorites = guestFavorites.keys.filter((id) => publishedContentIds.has(id));
          let localFavoritesToKeep = guestFavorites.keys;
          let syncedFavorites: string[] = [];
          if (syncableFavorites.length) {
            const { error: mergeError } = await supabase.from("favorites").upsert(
              syncableFavorites.map((content_id) => ({ user_id: user.id, content_id })),
              { onConflict: "user_id,content_id", ignoreDuplicates: true },
            );
            if (mergeError) {
              setFavoritesError("Device favorites could not be synced. They remain saved on this device.");
            } else {
              syncedFavorites = syncableFavorites;
              if (removeSyncedGuestFavorites(syncableFavorites)) {
                localFavoritesToKeep = guestFavorites.keys.filter((id) => !syncableFavorites.includes(id));
              } else {
                setFavoritesError("Your favorites were synced, but the device copy could not be cleared. No favorites were lost.");
              }
            }
          }
          setFavorites([...new Set([...accountFavorites, ...syncedFavorites, ...localFavoritesToKeep])]);
        }
        if (!notificationError) setUnreadNotifications(notificationCount ?? 0);
        setFavoritesLoading(false);
        const refreshUnread = async () => {
          const { data, error } = await supabase.rpc("get_unread_message_count");
          if (!active) return;
          if (!error && data !== null) { setUnreadMessages(data); return; }
          // Compatible with projects before the aggregate RPC migration; table RLS still limits this to participant messages.
          const { data: visibleMessages, error: fallbackError } = await supabase.from("messages").select("id,sender_id,deleted_at,moderation_status,message_read_receipts(user_id)").neq("sender_id", user.id);
          if (!active || fallbackError || !visibleMessages) return;
          setUnreadMessages(visibleMessages.filter((message) => !message.deleted_at && message.moderation_status === "visible" && !message.message_read_receipts.some((receipt) => receipt.user_id === user.id)).length);
        };
        await refreshUnread();
        channel = supabase.channel(`home-inbox:${user.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => { void refreshUnread(); })
          .on("postgres_changes", { event: "*", schema: "public", table: "message_read_receipts", filter: `user_id=eq.${user.id}` }, () => { void refreshUnread(); })
          .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, async () => {
            const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", user.id).is("read_at", null);
            if (active) setUnreadNotifications(count ?? 0);
          })
          .subscribe((status) => { if (active && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) msg("Live message counts are reconnecting."); });
      } catch {
        // Missing URL or network configuration leaves the public catalogue usable.
        if (active) { setFavoritesError("Account favorites could not be loaded. Device favorites remain available."); setFavoritesLoading(false); }
      }
    })();
    return () => { active = false; if (channel) void createSupabaseBrowserClient().removeChannel(channel); };
  }, []);
  useEffect(() => {
    if (initial || detail || query || featuredSlides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => setActive((x) => (x + 1) % featuredSlides.length), 8000);
    return () => window.clearTimeout(timer);
  }, [initial, detail, query, featuredSlides, active, heroCycle]);
  const msg = (s: string) => {
    setNotice(s);
    window.setTimeout(() => setNotice(""), 3000);
  };
  const setBusyFavorite = (id: string, busy: boolean) => setBusyFavoriteIds((current) => {
    const next = new Set(current);
    if (busy) next.add(id); else next.delete(id);
    return next;
  });
  const trackPlayback = async (partId: string | null, episodeId: string | null, positionSeconds = 0, durationSeconds: number | null = null, completed = false) => {
    const targetId = partId ?? episodeId;
    if (!targetId || (partId && episodeId)) return;
    const supabase = createSupabaseBrowserClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return;
    const key = `${user.id}:${targetId}`;
    const existing = watchRowIds.current.get(key);
    const payload = { position_seconds: Math.max(0, Math.floor(positionSeconds)), duration_seconds: durationSeconds === null ? null : Math.max(0, Math.floor(durationSeconds)), is_completed: completed, last_watched_at: new Date().toISOString() };
    if (existing) {
      await supabase.from("watch_history").update(payload).eq("id", existing.id).eq("user_id", user.id);
      return;
    }
    const lookup = supabase.from("watch_history").select("id").eq("user_id", user.id);
    const result = partId ? await lookup.eq("movie_part_id", partId).maybeSingle() : await lookup.eq("episode_id", episodeId!).maybeSingle();
    if (result.data?.id) {
      watchRowIds.current.set(key, { id: result.data.id, userId: user.id });
      await supabase.from("watch_history").update(payload).eq("id", result.data.id).eq("user_id", user.id);
    } else {
      const { data } = partId
        ? await supabase.from("watch_history").insert({ user_id: user.id, movie_part_id: partId, ...payload }).select("id").single()
        : await supabase.from("watch_history").insert({ user_id: user.id, episode_id: episodeId!, ...payload }).select("id").single();
      if (data?.id) watchRowIds.current.set(key, { id: data.id, userId: user.id });
    }
  };
  const onPlaybackStart = () => {
    const partId = selectedMovie?.contentId && selectedPart?.id ? selectedPart.id : null;
    const episodeId = selectedSeries?.contentId && selectedEpisode?.id ? selectedEpisode.id : null;
    const contentId = partId ?? episodeId;
    if (!contentId || watchEvents.current.has(contentId)) return;
    watchEvents.current.add(contentId);
    void trackPlayback(partId, episodeId);
  };
  const onPlaybackProgress = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (Date.now() - lastProgressWrite.current < 15000) return;
    lastProgressWrite.current = Date.now();
    const partId = selectedMovie?.contentId && selectedPart?.id ? selectedPart.id : null;
    const episodeId = selectedSeries?.contentId && selectedEpisode?.id ? selectedEpisode.id : null;
    void trackPlayback(partId, episodeId, event.currentTarget.currentTime, Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null);
  };
  const toggle = async (item: Movie | SeriesEntry) => {
    const key = favoriteKey(item);
    if (busyFavoriteIdsRef.current.has(key)) return;
    busyFavoriteIdsRef.current.add(key);
    setBusyFavorite(key, true);
    try {
      if (!viewer || !item.contentId) {
        const stored = readGuestFavorites();
        if (!stored.ok) throw new Error("storage");
        const next = stored.keys.includes(key) ? stored.keys.filter((id) => id !== key) : [...stored.keys, key];
        if (!writeGuestFavorites(next)) throw new Error("storage");
        setFavorites(next);
        setFavoritesError("");
        msg(next.includes(key) ? "Favorite saved on this device." : "Favorite removed.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      setFavoritesError("");
      const { data: { user }, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !user) {
        setViewer(null);
        const stored = readGuestFavorites();
        if (!stored.ok) throw new Error("storage");
        const next = stored.keys.includes(key) ? stored.keys.filter((id) => id !== key) : [...stored.keys, key];
        if (!writeGuestFavorites(next)) throw new Error("storage");
        setFavorites(next);
        msg(next.includes(key) ? "Favorite saved on this device." : "Favorite removed.");
        return;
      }
      if (favorites.includes(item.contentId)) {
        const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("content_id", item.contentId);
        if (error) throw error;
        const stored = readGuestFavorites();
        if (stored.ok && stored.keys.includes(item.contentId) && !removeSyncedGuestFavorites([item.contentId])) {
          throw new Error("storage");
        }
        setFavorites((current) => current.filter((id) => id !== item.contentId));
      } else {
        const { error } = await supabase.from("favorites").insert({ user_id: user.id, content_id: item.contentId });
        if (error) throw error;
        setFavorites((current) => [...current, item.contentId!]);
      }
    } catch {
      setFavoritesError("Favorite could not be saved. Check your connection or browser storage and try again.");
    } finally {
      busyFavoriteIdsRef.current.delete(key);
      setBusyFavorite(key, false);
    }
  };
  const open = (item: Movie | SeriesEntry) => {
    window.location.href = `/details/${encodeURIComponent(item.slug)}`;
  };
  const watch = (item: Movie | SeriesEntry) => {
    const target = firstPlaybackTarget(item);
    if (!target) { open(item); return; }
    const params = new URLSearchParams({ watch: "1" });
    if (target.partId) params.set("part", target.partId);
    if (target.episodeId) params.set("episode", target.episodeId);
    window.location.assign(`/details/${encodeURIComponent(item.slug)}?${params.toString()}`);
  };
  const selectedMovie = detail ? movies.find((item) => item.slug === detail || String(item.id) === detail) : undefined;
  const selectedSeries = detail ? series.find((item) => item.slug === detail || item.legacySlug === detail || String(item.id) === detail) : undefined;
  const selectedPart: MoviePart | undefined = selectedMovie?.parts.find((part) => part.id === selectedPartId);
  const selectedEpisode: Episode | undefined = selectedSeries?.episodes.find((episode) => episode.id === selectedEpisodeId);
  const selectedContent: MoviePart | Episode | undefined = selectedPart ?? selectedEpisode;
  const playbackUrl = getPlayableVideoUrl(selectedContent?.videoUrl);
  const selectedDrivePreview = selectedSeries ? getGoogleDrivePreviewUrl(selectedEpisode?.videoUrl) : null;
  const detailTitle = selectedMovie?.title ?? selectedSeries?.title ?? detail?.replaceAll("-", " ") ?? "Title";
  const selectedDetailItem = selectedMovie ?? selectedSeries;
  const movieTrailerCandidates = selectedMovie?.parts.map((part) => part.trailerUrl?.trim()).filter((url): url is string => Boolean(url)) ?? [];
  const selectedTrailerUrl = selectedMovie
    ? movieTrailerCandidates.find(isSupportedTrailerSource) ?? movieTrailerCandidates[0]
    : selectedSeries?.trailerUrl;
  const heroIndex = featuredSlides.length ? active % featuredSlides.length : 0;
  const hero = featuredSlides[heroIndex];
  const heroIsSeries = hero ? "episodes" in hero : false;
  const selectHeroSlide = (index: number) => {
    setActive(index);
    setHeroCycle((current) => current + 1);
  };
  const moveHeroSlide = (direction: -1 | 1) => {
    if (featuredSlides.length < 2) return;
    selectHeroSlide((heroIndex + direction + featuredSlides.length) % featuredSlides.length);
  };
  const visibleMovies = onlyFav || initial === "favorites"
    ? movies.filter((x) => favorites.includes(favoriteKey(x)))
    : movies;
  const visibleSeries = onlyFav || initial === "favorites"
    ? series.filter((x) => favorites.includes(favoriteKey(x)))
    : series;
  const categoryMovies = category ? visibleMovies.filter((item) => item.genres.includes(category) || item.category === category) : visibleMovies;
  const categorySeries = category ? visibleSeries.filter((item) => item.genres?.includes(category)) : visibleSeries;
  const sortedMovies = useMemo(() => newestFirst(uniqueContent(categoryMovies)), [categoryMovies]);
  const sortedSeries = useMemo(() => newestFirst(uniqueContent(categorySeries)), [categorySeries]);
  const recentFeedItems = useMemo(() => recentlyAddedFirst(movies, series), [movies, series]);
  useEffect(() => {
    setSelectedPartId("");
    setSelectedEpisodeId("");
    setPlayerSrc("");
    const params = new URLSearchParams(window.location.search);
    const isWatchMode = params.get("watch") === "1";
    setWatchMode(isWatchMode);
    if (!isWatchMode) return;
    if (selectedMovie) {
      const part = selectedMovie.parts.find((candidate) => candidate.id === params.get("part"));
      if (part?.videoUrl) { setSelectedPartId(part.id); setPlayerSrc(part.videoUrl); }
    } else if (selectedSeries) {
      const episode = selectedSeries.episodes.find((candidate) => candidate.id === params.get("episode"));
      if (episode) { setSelectedEpisodeId(episode.id); setPlayerSrc(episode.videoUrl ?? ""); }
    }
  }, [detail]);
  const selectEpisode = (episode: Episode) => {
    if (!episode.videoUrl?.trim() || !selectedSeries) return;
    window.location.assign(`/details/${encodeURIComponent(selectedSeries.slug)}?watch=1&episode=${encodeURIComponent(episode.id)}`);
  };
  return (
    <main className={light ? "app light" : "app"}>
      <header className="nav">
        <a href="/" className="brand">
          <span className="brand-icon">
            <Clapperboard size={19} />
          </span>
          <span>
            <b>CINEVA</b>
            <small>FILMS STREAMING</small>
          </span>
        </a>
        <div className="search">
          <Search size={17} />
          <input
            placeholder="Search movies, series..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌘ K</kbd>
          {query && (
            <button onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
        </div>
        <nav className={mobile ? "nav-links open" : "nav-links"}>
          {links.map((l) => (
            <a
              key={l.href}
              className={
                (initial === "movies" && l.label === "Movies") ||
                (initial === "series" && l.label === "Series") ||
                (initial === "services" && l.label === "Services") ||
                (!initial && !detail && l.label === "Home")
                  ? "active"
                  : ""
              }
              href={l.href}
            >
              <l.Icon size={17} strokeWidth={2.1} />
              {l.label}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <button
            className="icon-btn notification"
            aria-label={viewer ? `${unreadMessages ?? 0} unread messages` : "Messages"}
            onClick={() => { window.location.href = "/messages"; }}
          >
            <MessageSquareText size={18} />
            {viewer && <i>{unreadMessages === null ? "…" : unreadMessages > 99 ? "99+" : unreadMessages}</i>}
          </button>
          <button className="icon-btn notification" aria-label={viewer ? `${unreadNotifications ?? 0} unread notifications` : "Notifications"} onClick={() => { window.location.href = "/notifications"; }}>
            <Bell size={18} />{viewer && <i>{unreadNotifications === null ? "…" : unreadNotifications > 99 ? "99+" : unreadNotifications}</i>}
          </button>
          <button
            className={`icon-btn ${onlyFav ? "selected" : ""}`}
            aria-label="Favorites"
            onClick={() => {
              setOnlyFav((x) => !x);
              msg(
                onlyFav ? "Showing full catalogue" : "Showing your favorites",
              );
            }}
          >
            <Heart size={18} fill={onlyFav ? "currentColor" : "none"} />
          </button>
          <button
            className="icon-btn"
            aria-label="Toggle theme"
            onClick={() => setLight((x) => !x)}
          >
            {light ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <a className="signin" href="/account">{viewer ? "My Account" : "Account"}</a>
        </div>
        <button
          className="menu-toggle"
          onClick={() => setMobile((x) => !x)}
          aria-label="Toggle navigation"
        >
          {mobile ? <X /> : <Menu />}
        </button>
      </header>
      {!detail && initial !== "services" && categories.length > 0 && <div className="catalog-filters"><label htmlFor="catalog-category">Browse by category</label><select id="catalog-category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>}
      {!detail && favoritesError && <p className="auth-error favorite-status" role="alert">{favoritesError}</p>}
      {!detail && viewer && favoritesLoading && <p className="empty favorite-status" role="status">Loading your favorites…</p>}
      {!detail && busyFavoriteIds.size > 0 && <p className="empty favorite-status" role="status">Saving favorite…</p>}
      {!detail && (onlyFav || initial === "favorites") && !favoritesLoading && !favoritesError && !visibleMovies.length && !visibleSeries.length && <p className="empty favorite-status">You haven’t saved any titles yet.</p>}
      {detail ? (
        <>
        <section className="detail-page">
          <div className="detail-main-column">
            <section className="detail-copy detail-panel">
              <p className="eyebrow">CINEVA · {selectedSeries ? `SEASON ${selectedSeries.seasonNumber}` : "MOVIE"}</p>
              <h1>{detailTitle}</h1>
              <div className="detail-meta-grid">
                {(selectedMovie?.rating != null || selectedSeries?.rating != null) && <span><span className="meta-star">★</span> {(selectedMovie?.rating ?? selectedSeries?.rating)?.toFixed(1)} <small>/ 10</small></span>}
                {(selectedMovie?.year ?? selectedSeries?.year) && <span><CalendarDays size={15} /> {selectedMovie?.year ?? selectedSeries?.year}</span>}
                {(selectedMovie?.quality ?? selectedSeries?.quality) && <span className="quality-pill">{selectedMovie?.quality ?? selectedSeries?.quality}</span>}
                {(selectedMovie?.language ?? selectedSeries?.language) && <span><Globe2 size={15} /> {selectedMovie?.language ?? selectedSeries?.language}</span>}
                {selectedSeries && <span><ListVideo size={15} /> Season {selectedSeries.seasonNumber} · {selectedSeries.episodes.length} {selectedSeries.episodes.length === 1 ? "episode" : "episodes"}</span>}
                {(selectedMovie?.views ?? selectedSeries?.views) && <span><Eye size={15} /> {selectedMovie?.views ?? selectedSeries?.views} views</span>}
                {(selectedMovie?.narrator || selectedSeries?.narrator) && <span><Mic size={15} /> {selectedMovie?.narrator ?? selectedSeries?.narrator}</span>}
              </div>
              {(selectedMovie?.genres ?? selectedSeries?.genres)?.length ? <div className="detail-tags">{(selectedMovie?.genres ?? selectedSeries?.genres)?.map((genre) => <span key={genre}>{genre}</span>)}</div> : null}
              {(selectedMovie?.description ?? selectedSeries?.description)?.trim() && <ExpandableDescription text={(selectedMovie?.description ?? selectedSeries?.description)!} />}
              <div className="detail-actions">
                <button className="secondary" aria-pressed={Boolean((selectedMovie || selectedSeries) && favorites.includes(favoriteKey((selectedMovie ?? selectedSeries)!)))} onClick={() => { const item = selectedMovie ?? selectedSeries; if (item) void toggle(item); }}><Heart size={17} fill={(selectedMovie || selectedSeries) && favorites.includes(favoriteKey((selectedMovie ?? selectedSeries)!)) ? "currentColor" : "none"} /> Favorite</button>
                <button className="secondary" onClick={() => { void navigator.clipboard?.writeText(window.location.href).then(() => msg("Link copied.")); }}><Share2 size={17} /> Share</button>
              </div>
              {watchMode && <a className="watch-back-link" href={`/details/${encodeURIComponent(detail ?? "")}`}>← Back to details</a>}
              {!watchMode && selectedDetailItem && <div className="detail-trailer"><TrailerFrame trailerUrl={selectedTrailerUrl} item={selectedDetailItem} index={selectedDetailItem.id} /></div>}
              {watchMode && selectedMovie && selectedPart && playerSrc && <video key={selectedPart.id} className="detail-player" controls autoPlay src={playerSrc} onPlay={onPlaybackStart} onTimeUpdate={onPlaybackProgress} onEnded={() => { void trackPlayback(selectedPart.id, null, 0, null, true); }} />}
              {watchMode && selectedSeries && selectedEpisode && (selectedDrivePreview ? <iframe key={selectedEpisode.id} className="detail-player" src={selectedDrivePreview} title={`${detailTitle}, episode ${selectedEpisode.episodeNumber}`} allow="autoplay; encrypted-media" allowFullScreen /> : playerSrc && <video key={selectedEpisode.id} className="detail-player" controls autoPlay src={playerSrc} onPlay={onPlaybackStart} onTimeUpdate={onPlaybackProgress} onEnded={() => { void trackPlayback(null, selectedEpisode.id, 0, null, true); }} />)}
              {watchMode && selectedSeries && !selectedEpisode && <p className="unavailable-note" role="status">That episode is not available.</p>}
              {watchMode && selectedMovie && !selectedPart && <p className="unavailable-note" role="status">That movie part is not available.</p>}
              {watchMode && selectedMovie && selectedPart && !playbackUrl && <p className="unavailable-note">Streaming link unavailable.</p>}
            </section>
            {selectedSeries && !watchMode && <section className="episodes-section">
              <div className="section-head"><div><p className="eyebrow">SEASON {selectedSeries.seasonNumber}</p><h2>Episodes</h2></div><span className="episode-total">{selectedSeries.episodes.length} total</span></div>
              {!selectedSeries.episodes.length && <p className="unavailable-note">Episode listings have not been supplied.</p>}
              <div className="episode-list">{selectedSeries.episodes.map((episode) => {
                  const source = episode.videoUrl?.trim();
                  return <article className="episode-card" key={episode.id}>
                    <div className="episode-art">{(episode.image || selectedSeries.image) && <img src={episode.image || selectedSeries.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}<span className="episode-art-fallback"><Clapperboard size={20} /></span></div>
                    <div className="episode-info"><small>EPISODE {episode.episodeNumber}{episode.duration ? ` · ${episode.duration}` : ""}</small><h3>{episode.title.trim() || `${selectedSeries.title} - Episode ${episode.episodeNumber}`}</h3>{episode.description && episode.description !== episode.title && <p>{episode.description}</p>}</div>
                    <div className="episode-actions"><button className="episode-watch" disabled={!source} aria-pressed={selectedEpisode?.id === episode.id} onClick={() => selectEpisode(episode)}><Play size={14} fill="currentColor" /> Watch</button>{episode.downloadUrl?.trim() && <a className="episode-download" href={episode.downloadUrl} target="_blank" rel="noreferrer"><Download size={14} /> Download</a>}</div>
                  </article>;
                })}</div>
            </section>}
            {selectedMovie && !watchMode && <section className="episodes-section movie-options"><div className="section-head"><div><p className="eyebrow">AVAILABLE PLAYBACK</p><h2>{selectedMovie.parts.length > 1 ? "Movie parts" : "Watch movie"}</h2></div></div>
              {selectedMovie.parts.length ? selectedMovie.parts.map((part) => {
                const partImage = part.image?.trim() || selectedMovie.poster?.trim() || null;
                const partTitle = part.title?.trim() || `${selectedMovie.title} - Part ${part.partNumber}`;
                const partSources = part.videoUrls?.filter((url) => url.trim()) ?? (part.videoUrl?.trim() ? [part.videoUrl] : []);
                return <article className="episode-card" key={part.id}>
                  <div className="episode-art">{partImage && <img src={partImage} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}<span className="episode-art-fallback"><Clapperboard size={20} /></span></div>
                  <div className="episode-info"><small>{selectedMovie.parts.length > 1 ? `PART ${part.partNumber}` : "FULL MOVIE"}</small><h3>{partTitle}</h3></div>
                  <div className="episode-actions">{partSources.length ? partSources.map((url, sourceIndex) => <a className="episode-watch" key={`${part.id}:${sourceIndex}`} href={url} target="_blank" rel="noreferrer"><Play size={14} fill="currentColor" /> {partSources.length === 1 ? "Watch Now" : `Source ${sourceIndex + 1}`}</a>) : <span className="episode-unavailable">Watch unavailable</span>}{part.downloadUrl?.trim() && <a className="episode-download" href={part.downloadUrl} target="_blank" rel="noreferrer"><Download size={14} /> Download</a>}</div>
                </article>;
              }) : <p className="unavailable-note">Movie parts and viewing links have not been supplied.</p>}
            </section>}
          </div>
          <aside className="detail-sidebar">
            <div className="detail-panel sidebar-panel"><h2>About this {selectedSeries ? "season" : "movie"}</h2>
              {(selectedMovie?.genres ?? selectedSeries?.genres)?.length ? <div className="detail-info-row"><span>Genre</span><strong>{(selectedMovie?.genres ?? selectedSeries?.genres)?.join(", ")}</strong></div> : null}
              {(selectedMovie?.language ?? selectedSeries?.language) && <div className="detail-info-row"><span>Language</span><strong>{selectedMovie?.language ?? selectedSeries?.language}</strong></div>}
              {(selectedMovie?.year ?? selectedSeries?.year) && <div className="detail-info-row"><span>Year</span><strong>{selectedMovie?.year ?? selectedSeries?.year}</strong></div>}
              {(selectedMovie?.views ?? selectedSeries?.views) && <div className="detail-info-row"><span>Views</span><strong>{selectedMovie?.views ?? selectedSeries?.views}</strong></div>}
              {(selectedMovie?.narrator || selectedSeries?.narrator) && <div className="detail-info-row"><span>Narrator</span><strong>{selectedMovie?.narrator ?? selectedSeries?.narrator}</strong></div>}
            </div>
          </aside>
        </section>
        {(selectedMovie?.contentId || selectedSeries?.contentId) && <DiscussionClient contentId={(selectedMovie?.contentId ?? selectedSeries?.contentId)!} />}
        </>
      ) : initial === "services" ? (
        <section className="services-page">
          <p className="eyebrow">HERE FOR EVERY FRAME</p>
          <h1>
            Entertainment, <em>made simple.</em>
          </h1>
          <p className="services-intro">
            Your home for movie discoveries, fresh updates and a little Kigali
            warmth.
          </p>
          <div className="service-grid">
            <article>
              <MonitorPlay />
              <h3>Movie streaming</h3>
              <p>
                Discover movies and series in one curated place. Playback
                appears when an official stream is connected.
              </p>
            </article>
            <article>
              <Sparkles />
              <h3>Fresh updates</h3>
              <p>
                Keep up with new titles, featured picks and catalogue updates.
              </p>
            </article>
            <article>
              <Phone />
              <h3>WhatsApp channel</h3>
              <p>Read the latest updates from the CINEVA team.</p>
              <a href="/announcements">View announcements <ArrowRight size={15} /></a>
              <a
                href="https://wa.me/250725426553"
                target="_blank"
                rel="noreferrer"
              >
                Chat on WhatsApp <ArrowRight size={15} />
              </a>
            </article>
            <article>
              <CircleHelp />
              <h3>How it works</h3>
              <p>
                Browse the catalogue, search for a title, and open its details.
                Where no official viewing link is provided, playback remains
                unavailable.
              </p>
            </article>
          </div>
          <div className="contact-box">
            <h2>Let’s talk</h2>
            <p>
              <Mail size={16} /> <a href="mailto:Irakabahodjabiri@gmail.com">Irakabahodjabiri@gmail.com</a>
            </p>
            <p>
              <Phone size={16} /> <a href="tel:+250725426553">0725 426 553</a>
            </p>
            <p>
              <MapPin size={16} /> Kigali, Rwanda
            </p>
            <div className="faq">
              <details>
                <summary>Why can’t I watch a title yet?</summary>
                <p>
                  A working video player requires an authorized video URL. The
                  current catalogue has no streaming links supplied.
                </p>
              </details>
              <details>
                <summary>How do I get platform updates?</summary>
                <p>
                  Subscribe below; subscription storage needs a backend
                  connection before signups can be saved.
                </p>
              </details>
            </div>
          </div>
        </section>
      ) : (
        <>
          {!initial && !query && hero && (
            <section
              className="hero"
              style={
                {
                  "--hero-palette": palettes[heroIndex % palettes.length],
                } as React.CSSProperties
              }
            >
              <div className="hero-poster-card"><Poster title={hero.title} index={heroIndex} image={"episodes" in hero ? hero.image : hero.poster} clean /></div>
              <div className="hero-copy">
                <div className="hero-kicker">
                  <span className="live-dot" /> {heroIsSeries ? `TV · SEASON ${"episodes" in hero ? hero.seasonNumber : ""}` : "parts" in hero && hero.parts.length > 1 ? "MULTI-PART MOVIE" : "MOVIE"}{" "}
                  {"episodes" in hero && <span className="hero-season-count">SEASON {hero.seasonNumber}</span>}
                  <span className="line" />
                </div>
                <div className="hero-tags">
                  {hero.year && <span>{hero.year}</span>}
                  {("episodes" in hero ? hero.genres?.[0] : hero.category) && <span>{"episodes" in hero ? hero.genres?.[0] : hero.category}</span>}
                  {hero.quality && <span className="tag">{hero.quality}</span>}
                  {hero.language && <span>{hero.language}</span>}
                  {hero.rating != null && <span className="hero-rating">★ {hero.rating.toFixed(1)}</span>}
                </div>
                <h1>{hero.title}</h1>
                {hero.description && <p>{hero.description}</p>}
                <div className="hero-reference-actions">
                  <a className="hero-service-cta" href="/services"><MonitorPlay size={19} /> Our Services</a>
                  <a className="hero-whatsapp-cta" href="https://wa.me/250725426553" target="_blank" rel="noreferrer"><MessageCircle size={19} /> WhatsApp Channel</a>
                </div>
                <div className="hero-buttons">
                  <button className="hero-watch-action" onClick={() => watch(hero)} disabled={!firstPlaybackTarget(hero)} title={!firstPlaybackTarget(hero) ? "No streaming link is available" : undefined}>
                    <Play size={18} fill="currentColor" /> Watch Now
                  </button>
                  <button className="hero-detail-action" onClick={() => open(hero)}>
                    <Plus size={18} /> More Details
                  </button>
                </div>
              </div>
              {featuredSlides.length > 1 && <div className="hero-controls" role="group" aria-label="Featured slider controls">
                <button type="button" aria-label="Previous featured title" onClick={() => moveHeroSlide(-1)}><ChevronLeft size={23} /></button>
                <span>{heroIndex + 1}<i>/</i>{featuredSlides.length}</span>
                <button type="button" aria-label="Next featured title" onClick={() => moveHeroSlide(1)}><ChevronRight size={23} /></button>
              </div>}
              {featuredSlides.length > 1 && <div className="hero-dots" role="group" aria-label="Featured title navigation">
                {featuredSlides.map((item, i) => (
                  <button
                    key={stableContentIdentity(item)}
                    onClick={() => selectHeroSlide(i)}
                    className={i === heroIndex ? "on" : ""}
                    aria-label={`Show featured ${"episodes" in item ? "season" : "movie"} ${item.title}`}
                    aria-current={i === heroIndex ? "true" : undefined}
                  ><span /></button>
                ))}
              </div>}
            </section>
          )}
          {!initial && !query && !hero && <section className="hero hero-empty" aria-labelledby="featured-empty-title"><div className="hero-scrim" /><div className="hero-empty-copy"><p className="hero-kicker">CINEVA FEATURED</p><h1 id="featured-empty-title">Featured titles are coming soon</h1><p>No movies or series are currently marked as featured.</p><div className="hero-buttons"><a className="primary" href="/movies">Browse Movies</a><a className="secondary hero-details" href="/series">Browse Series</a></div></div></section>}
          {query ? (
            <section className="search-results">
              <div className="section-head">
                <div>
                  <p className="eyebrow">SEARCH RESULTS</p>
                  <h2>
                    {found.length
                      ? `Results for “${query}”`
                      : "No titles found"}
                  </h2>
                </div>
              </div>
              {found.length ? (
                <div className="search-grid">
                  {found.map((m, i) => (
                    <MovieCard
                      key={stableContentIdentity(m)}
                      item={m}
                      index={i}
                      onWatch={() => watch(m)}
                      favorite={favorites.includes(favoriteKey(m))}
                      onFavorite={() => void toggle(m)}
                    />
                  ))}
                </div>
              ) : (
                <p className="empty">Try another title or narrator name.</p>
              )}
            </section>
          ) : (
            <>
              {initial && <section className="welcome">
                <div>
                  <p className="eyebrow">A LITTLE MORE MAGIC, EVERY DAY</p>
                  <h2>
                    {initial === "favorites" ? <>Your <em>favorites.</em></> : <>Find your next <em>favorite.</em></>}
                  </h2>
                  <p>{initial === "favorites" ? "Your saved movies and series, all in one place." : "Stories worth staying in for, handpicked for you."}</p>
                </div>
                <div className="welcome-badge">
                  <span>✦</span>
                  <small>
                    MADE IN
                    <br />
                    RWANDA
                  </small>
                </div>
              </section>}
              <div className="catalogue">
                {!initial && <Row
                  title="Featured Content"
                  items={interleaveFeatured(movies, series)}
                  onWatch={watch}
                  favorites={favorites}
                  toggle={toggle}
                  href="/movies"
                />}
                {initial === "movies" ? (
                  <Row
                    title="All Movies"
                    items={sortedMovies}
                    onWatch={watch}
                    favorites={favorites}
                    toggle={toggle}
                    href="/movies"
                  />
                ) : initial === "series" ? (
                  <Row
                    title="All Series"
                    items={sortedSeries}
                    onWatch={watch}
                    favorites={favorites}
                    toggle={toggle}
                    href="/series"
                  />
                ) : (
                  <>
                    <Row
                      title="All Movies"
                      items={sortedMovies}
                      onWatch={watch}
                      favorites={favorites}
                      toggle={toggle}
                      href="/movies"
                    />
                    <Row
                      title="All Series"
                      items={sortedSeries}
                      onWatch={watch}
                      favorites={favorites}
                      toggle={toggle}
                      href="/series"
                    />
                  </>
                )}
                {!initial && <RecentlyAddedFeed
                  items={recentFeedItems}
                  onWatch={watch}
                  favorites={favorites}
                  toggle={toggle}
                />}
              </div>
              {!initial && (
                <section className="newsletter">
                  <div>
                    <p className="eyebrow">THE CINEVA EDIT</p>
                    <h2>
                      Stay in the <em>loop.</em>
                    </h2>
                    <p>
                      Get new releases, exclusive content and updates straight
                      to your inbox.
                    </p>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        msg("Please enter a valid email address.");
                        return;
                      }
                      msg("Newsletter signup is not active yet; CINEVA needs a subscription backend to save signups.");
                    }}
                  >
                    <input
                      type="email"
                      required
                      placeholder="Your email address"
                      aria-label="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <button className="primary" type="submit">
                      Subscribe{" "}
                      <ArrowRight size={16} />
                    </button>
                    <small>
                      By subscribing, you agree to receive CINEVA updates.
                    </small>
                  </form>
                </section>
              )}
            </>
          )}
        </>
      )}
      <footer className="footer">
        <div className="footer-main">
          <div className="footer-brand">
            <a href="/" className="brand">
              <span className="brand-icon">
                <Clapperboard size={19} />
              </span>
              <span>
                <b>CINEVA</b>
                <small>PREMIUM STREAMING</small>
              </span>
            </a>
            <p>
              Your ultimate destination for movies and TV series. Stream
              unlimited entertainment with crystal-clear quality, anytime,
              anywhere.
            </p>
            <span className="rwanda">♥ Made with love in Rwanda</span>
          </div>
          <div>
            <h4>EXPLORE</h4>
            {links.map((x) => (
              <a key={x.href} href={x.href}>
                {x.label}
              </a>
            ))}
          </div>
          <div>
            <h4>CONTACT</h4>
            <a href="mailto:Irakabahodjabiri@gmail.com">Irakabahodjabiri@gmail.com</a>
            <a href="tel:+250725426553">0725 426 553</a>
            <span>Kigali, Rwanda</span>
          </div>
          <div className="about-footer">
            <h4>ABOUT CINEVA</h4>
            <p>
              CINEVA is a premium African streaming platform based in Kigali,
              Rwanda. We bring you the best local and international movies and
              series in HD quality.
            </p>
            <span className="hd-label">✦ HD STREAMING · RWANDA</span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © 2026 CINEVA. All rights reserved.{" "}
            <span>Made with ❤️ in Rwanda</span>
          </span>
          <div>
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
          </div>
        </div>
      </footer>
      {showScrollTop && <button type="button" className="scroll-top" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ChevronUp size={22} /></button>}
      <a
        className="whatsapp-float"
              href="https://wa.me/250725426553"
        target="_blank"
        rel="noreferrer"
        aria-label="Open CINEVA on WhatsApp"
      >
        <MessageCircle />
      </a>
      {notice && (
        <div className="toast">
          <Sparkles size={16} />
          {notice}
        </div>
      )}
    </main>
  );
}
