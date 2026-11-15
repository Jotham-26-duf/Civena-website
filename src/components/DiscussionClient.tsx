"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readGuestDiscussionDraft, readGuestRating, updateGuestDiscussionDraft, writeGuestDiscussionDraft, writeGuestRating } from "@/lib/guest-persistence";
import Link from "next/link";

type Review = { id: string; user_id: string; author_name: string; title: string | null; body: string; status: string; created_at: string; updated_at: string; deleted_at: string | null };
type Comment = { id: string; user_id: string; author_name: string; parent_comment_id: string | null; body: string; status: string; created_at: string; updated_at: string; deleted_at: string | null };

export function DiscussionClient({ contentId }: { contentId: string }) {
  const [userId, setUserId] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [rating, setRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
        const [{ data: auth, error: authError }, discussionResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("get_content_discussion", { target_content_id: contentId }),
      ]);
      if (discussionResult.error) throw new Error("Discussion could not be loaded. The discussion feed migration may not be applied yet.");
      const id = auth?.user?.id ?? "";
      setUserId(id);
      const localDraft = readGuestDiscussionDraft(contentId);
      const rows = discussionResult.data ?? [];
      const own = rows.find((row) => row.entry_kind === "review" && row.user_id === id);
      setReviews(rows.filter((row) => row.entry_kind === "review") as Review[]);
      setComments(rows.filter((row) => row.entry_kind === "comment") as Comment[]);
      setReviewTitle(localDraft.draft?.reviewTitle ?? own?.title ?? "");
      setReviewBody(localDraft.draft?.reviewBody ?? own?.body ?? "");
      setCommentBody(localDraft.draft?.commentBody ?? "");
      if (!localDraft.ok) setError("A saved discussion draft could not be read from this device.");
      if (authError) setError("Your session could not be checked. Guest drafts will remain on this device.");
      if (id) {
        const { data: ownRating } = await supabase.from("user_ratings").select("rating").eq("content_id", contentId).eq("user_id", id).maybeSingle();
        setRating(ownRating?.rating ?? readGuestRating(contentId));
      } else setRating(readGuestRating(contentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discussion could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [contentId]);

  useEffect(() => { void load(); }, [load]);

  async function saveRating(value: number) {
    if (!userId) {
      if (!writeGuestRating(contentId, value)) { setError("Your rating could not be saved on this device. Check browser storage settings."); return; }
      setRating(value);
      setError("");
      setNotice("Your rating was saved on this device.");
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: saveError } = await supabase.from("user_ratings").upsert({ content_id: contentId, user_id: userId, rating: value }, { onConflict: "user_id,content_id" });
    if (saveError) setError("Your rating could not be saved. Please try again.");
    else { setRating(value); setNotice("Your rating was saved."); }
    setBusy(false);
  }

  async function submitReview(formData: FormData) {
    const body = String(formData.get("body") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    if (!body || body.length > 5000 || title.length > 160) { setError("Enter a review with up to 5,000 characters and a title up to 160 characters."); return; }
    if (!userId) {
      const saved = writeGuestDiscussionDraft(contentId, { reviewTitle: title, reviewBody: body, commentBody });
      if (!saved) { setError("Your review draft could not be saved. Check browser storage settings and keep this page open."); return; }
      setReviewTitle(title); setReviewBody(body); setError(""); setNotice("Review draft saved on this device.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    const supabase = createSupabaseBrowserClient();
    const existing = reviews.find((review) => review.user_id === userId);
    const result = existing
      ? await supabase.from("reviews").update({ title: title || null, body, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("user_id", userId)
      : await supabase.from("reviews").insert({ content_id: contentId, user_id: userId, title: title || null, body });
    if (result.error) setError("Your review could not be saved. You may already have a review for this title.");
    else { updateGuestDiscussionDraft(contentId, { reviewTitle: "", reviewBody: "" }); setReviewTitle(""); setReviewBody(""); setNotice("Review saved. It may need moderation before it is public."); await load(); }
    setBusy(false);
  }

  async function submitComment(formData: FormData) {
    const body = String(formData.get("body") ?? "").trim();
    if (!body || body.length > 2000) { setError("Enter a comment between 1 and 2,000 characters."); return; }
    if (!userId) {
      const saved = writeGuestDiscussionDraft(contentId, { reviewTitle, reviewBody, commentBody: body });
      if (!saved) { setError("Your comment draft could not be saved. Check browser storage settings and keep this page open."); return; }
      setCommentBody(body); setError(""); setNotice("Comment draft saved on this device.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    const supabase = createSupabaseBrowserClient();
    const { error: saveError } = await supabase.from("comments").insert({ content_id: contentId, user_id: userId, parent_comment_id: null, body });
    if (saveError) setError("Your comment could not be saved. Please try again.");
    else { updateGuestDiscussionDraft(contentId, { commentBody: "" }); setCommentBody(""); setNotice("Comment saved. It may need moderation before it is public."); await load(); }
    setBusy(false);
  }

  async function remove(kind: "reviews" | "comments", id: string) {
    if (!userId || !window.confirm("Delete this item?")) return;
    setBusy(true); setError("");
    const { error: removeError } = await createSupabaseBrowserClient().from(kind).delete().eq("id", id).eq("user_id", userId);
    if (removeError) setError(removeError.code === "42501" ? "This comment has replies from other members and cannot be deleted." : "This item could not be deleted.");
    else { setNotice("Deleted."); await load(); }
    setBusy(false);
  }

  async function editComment(comment: Comment) {
    const body = window.prompt("Edit your comment", comment.body)?.trim();
    if (!body || body === comment.body) return;
    if (body.length > 2000) { setError("Comments must be no longer than 2,000 characters."); return; }
    setBusy(true); setError("");
    const { error: editError } = await createSupabaseBrowserClient().from("comments").update({ body, updated_at: new Date().toISOString() }).eq("id", comment.id).eq("user_id", userId);
    if (editError) setError("This comment could not be edited."); else { setNotice("Comment updated."); await load(); }
    setBusy(false);
  }

  const ownReview = reviews.find((review) => review.user_id === userId);
  const visibleReviews = reviews.filter((review) => review.status === "published" && !review.deleted_at || review.user_id === userId);
  const visibleComments = comments.filter((comment) => comment.status === "published" && !comment.deleted_at || comment.user_id === userId);

  return <section className="discussion" aria-labelledby="discussion-title">
    <div className="section-head"><h2 id="discussion-title">Reviews &amp; discussion</h2></div>
    {error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="auth-success" role="status">{notice}</p>}
    {loading ? <p className="empty">Loading reviews and comments…</p> : <>
      <div className="discussion-rating"><b>Your rating</b>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" disabled={busy} aria-pressed={rating === value} aria-label={`Rate ${value} out of 5`} onClick={() => void saveRating(value)}>{value <= rating ? "★" : "☆"}</button>)}{!userId && <span>Guest ratings are saved on this device.</span>}</div>
      {!userId && <p className="empty">You can draft a review or comment while browsing. Publishing it requires an account; these drafts stay on this device. <Link href="/account">Open your account</Link></p>}
      <form action={submitReview} className="discussion-form"><h3>{ownReview ? "Edit your review" : "Write a review"}</h3><input name="title" value={reviewTitle} onChange={(event) => { setReviewTitle(event.target.value); if (!userId) updateGuestDiscussionDraft(contentId, { reviewTitle: event.target.value, reviewBody, commentBody }); }} maxLength={160} placeholder="Review title (optional)" disabled={busy} /><textarea name="body" value={reviewBody} onChange={(event) => { setReviewBody(event.target.value); if (!userId) updateGuestDiscussionDraft(contentId, { reviewTitle, reviewBody: event.target.value, commentBody }); }} maxLength={5000} rows={4} placeholder="Share your thoughts about this title…" required disabled={busy} /><button className="primary" disabled={busy}>{busy ? "Saving…" : ownReview ? "Update review" : userId ? "Submit review" : "Save review draft"}</button></form>
      {!visibleReviews.length ? <p className="empty">No published reviews yet.</p> : visibleReviews.map((review) => <article className="discussion-item" key={review.id}><header><b>{review.user_id === userId ? "You" : review.author_name}</b><time>{new Date(review.created_at).toLocaleDateString()}</time>{review.status !== "published" && <span className="eyebrow">{review.status}</span>}</header>{review.title && <h3>{review.title}</h3>}<p>{review.body}</p>{review.user_id === userId && <><button type="button" className="text-button" disabled={busy} onClick={() => { setReviewTitle(review.title ?? ""); setReviewBody(review.body); document.querySelector(".discussion-form")?.scrollIntoView({ behavior: "smooth" }); }}>Edit review</button><button type="button" className="text-button" disabled={busy} onClick={() => void remove("reviews", review.id)}>Delete review</button></>}</article>)}
      <form action={submitComment} className="discussion-form"><h3>Join the discussion</h3><textarea name="body" value={commentBody} onChange={(event) => { setCommentBody(event.target.value); if (!userId) updateGuestDiscussionDraft(contentId, { reviewTitle, reviewBody, commentBody: event.target.value }); }} maxLength={2000} rows={3} placeholder="Write a comment…" required disabled={busy} /><button className="primary" disabled={busy}>{busy ? "Saving…" : userId ? "Post comment" : "Save comment draft"}</button></form>
      {!visibleComments.length ? <p className="empty">No published comments yet.</p> : visibleComments.map((comment) => <article className="discussion-item" key={comment.id} style={{ marginInlineStart: comment.parent_comment_id ? 24 : 0 }}><header><b>{comment.user_id === userId ? "You" : comment.author_name}</b><time>{new Date(comment.created_at).toLocaleDateString()}</time>{comment.status !== "published" && <span className="eyebrow">{comment.status}</span>}</header><p>{comment.body}</p>{comment.user_id === userId && <><button type="button" className="text-button" disabled={busy} onClick={() => void editComment(comment)}>Edit</button><button type="button" className="text-button" disabled={busy} onClick={() => void remove("comments", comment.id)}>Delete</button></>}</article>)}
    </>}
  </section>;
}
