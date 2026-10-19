"use client";

/**
 * Small styled primitives shared across the app. Visual treatment lives in
 * globals.css (.icon-btn, .switch, .menu, .seg, ...) so every control picks
 * up theme variables automatically.
 */

import clsx from "clsx";
import { Check } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

// ------------------------------------------------------------------- buttons

export function IconButton({
  className,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" data-on={active || undefined} className={clsx("icon-btn", className)} {...props} />
  );
}

export function AccentButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={clsx("accent-btn", className)} {...props} />;
}

export function GhostButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={clsx("ghost-btn", className)} {...props} />;
}

// -------------------------------------------------------------------- switch

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-on={checked || undefined}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  );
}

// -------------------------------------------------------------------- slider

export function Slider({
  value,
  min,
  max,
  step = 1,
  label,
  disabled,
  onChange,
  valueText,
  dangerFrom,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  valueText?: string;
  dangerFrom?: number;
  className?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const dangerPct = dangerFrom === undefined ? undefined : ((dangerFrom - min) / (max - min)) * 100;
  const style = {
    "--fill": `${pct}%`,
    ...(dangerPct !== undefined ? { "--danger-from": `${dangerPct}%` } : {}),
  } as CSSProperties;
  return (
    <input
      type="range"
      className={clsx("ld-range", dangerFrom !== undefined && "ld-range--danger", className)}
      aria-label={label}
      aria-valuetext={valueText}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      style={style}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

// ----------------------------------------------------------------- segmented

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={clsx("seg", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          data-on={value === option.value || undefined}
          className="seg-item"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------- menu

export function Menu({
  button,
  children,
  align = "left",
  label,
}: {
  button: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {button({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div role="menu" aria-label={label} className={clsx("menu", align === "right" ? "right-0" : "left-0")}>
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

export function MenuRadioItem({
  checked,
  onSelect,
  children,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      data-on={checked || undefined}
      className="menu-item"
      onClick={onSelect}
    >
      <span className="flex h-4 w-4 items-center justify-center">{checked && <Check size={14} aria-hidden />}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate">{children}</span>
        {description && <span className="block truncate text-[11px] fg-faint">{description}</span>}
      </span>
    </button>
  );
}
