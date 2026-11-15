"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmitButton({ children, pendingLabel, className = "primary" }: { children: React.ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending}>{pending ? pendingLabel : children}</button>;
}
