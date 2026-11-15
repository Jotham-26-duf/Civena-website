"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { signInFromModal } from "@/app/actions/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const dismissedKey = "cineva-login-prompt-dismissed";
type LoginState = { error?: string; success?: boolean };

export function HomeLoginModal({
  openOnFirstVisit,
  forceOpen,
  returnTo,
  onClose,
}: {
  openOnFirstVisit: boolean;
  forceOpen: boolean;
  returnTo?: string;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [nextPath, setNextPath] = useState(returnTo ?? "/");
  const [state, action, pending] = useActionState<LoginState, FormData>(signInFromModal, {});
  const dialogRef = useRef<HTMLElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNextPath(returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`);
  }, [returnTo]);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    if (!openOnFirstVisit || window.sessionStorage.getItem(dismissedKey) === "1") return;

    let current = true;
    try {
      const supabase = createSupabaseBrowserClient();
      void supabase.auth.getSession().then(({ data, error }) => {
        if (current && !data.session) setOpen(true);
      }).catch(() => {
        // Keep the catalogue available if session storage or network access is unavailable.
      });
    } catch {
      setOpen(true);
    }
    return () => { current = false; };
  }, [forceOpen, openOnFirstVisit]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    emailRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!state.success) return;
    window.sessionStorage.setItem(dismissedKey, "1");
    window.location.assign(nextPath || "/");
  }, [state.success, nextPath]);

  function dismiss() {
    window.sessionStorage.setItem(dismissedKey, "1");
    setOpen(false);
    onClose();
  }

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled])',
    ));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  if (!open) return null;

  const nextQuery = encodeURIComponent(nextPath || "/");
  return (
    <div className="login-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section ref={dialogRef} className="auth-card login-modal" role="dialog" aria-modal="true" aria-labelledby="guest-login-title" onKeyDown={trapFocus}>
        <button className="login-modal-close" type="button" aria-label="Close sign-in window" onClick={dismiss}><X size={20} /></button>
        <Link href="/" className="brand"><span className="brand-icon">C</span><span><b>CINEVA</b><small>FILMS STREAMING</small></span></Link>
        <p className="eyebrow">WELCOME TO CINEVA</p>
        <h1 id="guest-login-title">Enjoy the movies</h1>
        <p className="login-modal-intro">Sign in to save favorites and message the CINEVA community. You can also browse as a guest.</p>
        {state.error && <p className="auth-error" role="alert">{state.error}</p>}
        <form action={action}>
          <input type="hidden" name="next" value={nextPath || "/"} />
          <label>Email<input ref={emailRef} name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="primary" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        </form>
        <p><Link href={`/forgot-password?next=${nextQuery}`}>Forgot password?</Link></p>
        <p>New to CINEVA? <Link href={`/register?next=${nextQuery}`}>Create an account</Link></p>
        <button className="secondary login-guest-button" type="button" onClick={dismiss}>Continue as Guest</button>
      </section>
    </div>
  );
}
