"use client";
import { LoaderCircle, ArrowUpRight, Sparkles } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button({
  children,
  variant = "primary",
  busy = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`button ${variant} ${className}`}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Brand() {
  return (
    <a className="brand" href="/">
      <span className="brand-mark">
        <Sparkles size={23} strokeWidth={1.7} />
      </span>
      nova<span className="brand-dot">.</span>
    </a>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`notice ${error ? "error" : ""}`}
    >
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Sparkles size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export const Arrow = () => <ArrowUpRight size={17} />;
export { browserApi as api } from "@/lib/browser/api";
