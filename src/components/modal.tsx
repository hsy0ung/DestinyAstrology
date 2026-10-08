"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export function Modal({ title, subtitle, children, onClose, wide = false }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const selectable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], textarea:not([disabled]), [tabindex="0"]') ?? []);
    selectable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const items = selectable();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal ${wide ? "modal-wide" : ""}`}>
      <button className="icon-button modal-close" onClick={onClose} aria-label="닫기"><X size={20} /></button>
      <div className="modal-heading"><div className="mini-spark">✦</div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      {children}
    </div>
  </div>;
}
