"use client";

import { useActionState } from "react";
import { readReportedMessage } from "@/app/actions/admin";

type ReviewState = { error?: string; message?: unknown };
async function reviewAction(_state: ReviewState, formData: FormData): Promise<ReviewState> {
  return readReportedMessage(formData);
}

export function ReportedMessageReview({ messageId }: { messageId: string }) {
  const [state, action, pending] = useActionState(reviewAction, {});
  return <section className="review-message"><form action={action}><input type="hidden" name="messageId" value={messageId} /><button className="primary" type="submit" disabled={pending}>{pending ? "Loading…" : "Open audited message view"}</button></form>{state.error && <p className="auth-error" role="alert">{state.error}</p>}{state.message !== undefined && <pre>{JSON.stringify(state.message, null, 2)}</pre>}</section>;
}
