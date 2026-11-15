const FAVORITES_KEY = "cineva.guest-favorites.v1";
const MESSAGE_DRAFT_KEY = "cineva.guest-message-draft.v1";

export type GuestDiscussionDraft = {
  reviewTitle: string;
  reviewBody: string;
  commentBody: string;
};

function available() {
  return typeof window !== "undefined";
}

function notifyFavoritesChanged() {
  if (available()) window.dispatchEvent(new Event("cineva:guest-favorites-changed"));
}

export function readGuestFavorites(): { keys: string[]; ok: boolean } {
  if (!available()) return { keys: [], ok: false };
  try {
    const stored = window.localStorage.getItem(FAVORITES_KEY);
    if (!stored) return { keys: [], ok: true };
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length > 200)) {
      return { keys: [], ok: false };
    }
    return { keys: [...new Set(value)], ok: true };
  } catch {
    return { keys: [], ok: false };
  }
}

export function writeGuestFavorites(keys: string[]): boolean {
  if (!available()) return false;
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify([...new Set(keys)]));
    notifyFavoritesChanged();
    return true;
  } catch {
    return false;
  }
}

export function removeSyncedGuestFavorites(keys: string[]): boolean {
  const current = readGuestFavorites();
  if (!current.ok) return false;
  const synced = new Set(keys);
  return writeGuestFavorites(current.keys.filter((key) => !synced.has(key)));
}

function discussionKey(contentId: string) {
  return `cineva.guest-discussion.v1.${contentId}`;
}

export function readGuestDiscussionDraft(contentId: string): { draft: GuestDiscussionDraft | null; ok: boolean } {
  if (!available()) return { draft: null, ok: false };
  try {
    const stored = window.localStorage.getItem(discussionKey(contentId));
    if (!stored) return { draft: null, ok: true };
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object") return { draft: null, ok: false };
    const draft = value as Partial<GuestDiscussionDraft>;
    if (typeof draft.reviewTitle !== "string" || typeof draft.reviewBody !== "string" || typeof draft.commentBody !== "string") {
      return { draft: null, ok: false };
    }
    return { draft: draft as GuestDiscussionDraft, ok: true };
  } catch {
    return { draft: null, ok: false };
  }
}

export function writeGuestDiscussionDraft(contentId: string, draft: GuestDiscussionDraft): boolean {
  if (!available()) return false;
  try {
    window.localStorage.setItem(discussionKey(contentId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestDiscussionDraft(contentId: string): boolean {
  if (!available()) return false;
  try {
    window.localStorage.removeItem(discussionKey(contentId));
    return true;
  } catch {
    return false;
  }
}

export function updateGuestDiscussionDraft(contentId: string, update: Partial<GuestDiscussionDraft>): boolean {
  const current = readGuestDiscussionDraft(contentId);
  if (!current.ok) return false;
  const next = {
    reviewTitle: update.reviewTitle ?? current.draft?.reviewTitle ?? "",
    reviewBody: update.reviewBody ?? current.draft?.reviewBody ?? "",
    commentBody: update.commentBody ?? current.draft?.commentBody ?? "",
  };
  if (!next.reviewTitle && !next.reviewBody && !next.commentBody) return clearGuestDiscussionDraft(contentId);
  return writeGuestDiscussionDraft(contentId, next);
}

function ratingKey(contentId: string) {
  return `cineva.guest-rating.v1.${contentId}`;
}

export function readGuestRating(contentId: string): number {
  if (!available()) return 0;
  try {
    const value = Number(window.localStorage.getItem(ratingKey(contentId)));
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
  } catch {
    return 0;
  }
}

export function writeGuestRating(contentId: string, rating: number): boolean {
  if (!available() || !Number.isInteger(rating) || rating < 1 || rating > 5) return false;
  try {
    window.localStorage.setItem(ratingKey(contentId), String(rating));
    return true;
  } catch {
    return false;
  }
}

export function readGuestMessageDraft(): string {
  if (!available()) return "";
  try {
    return window.localStorage.getItem(MESSAGE_DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeGuestMessageDraft(body: string): boolean {
  if (!available()) return false;
  try {
    window.localStorage.setItem(MESSAGE_DRAFT_KEY, body.slice(0, 5000));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestMessageDraft(): boolean {
  if (!available()) return false;
  try {
    window.localStorage.removeItem(MESSAGE_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}
