"use client";

import { CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";
import { usePlayerStore, type ToastItem } from "@/store/player";

const ICONS = {
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
} as const;

function Toast({ toast }: { toast: ToastItem }) {
  const dismissToast = usePlayerStore((s) => s.dismissToast);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => dismissToast(toast.id),
      toast.kind === "error" ? 6500 : 4200,
    );
    return () => window.clearTimeout(timeout);
  }, [toast.id, toast.kind, dismissToast]);

  const Icon = ICONS[toast.kind];

  return (
    <div className="toast animate-fade-up" role="status" data-kind={toast.kind}>
      <Icon size={16} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1 text-sm leading-snug">{toast.message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="toast-close"
        onClick={() => dismissToast(toast.id)}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = usePlayerStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 left-4 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
