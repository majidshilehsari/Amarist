"use client";

import { useRef, useState, type ReactNode } from "react";
import { Maximize, Move, ZoomIn, ZoomOut } from "lucide-react";

/**
 * نمایش محتوای بزرگ (SVG مدل) با قابلیت زوم (اسکرول + دکمه) و کشیدن با ماوس (pan).
 * اندازه محتوا به اندازه نیاز مدل است و هرگز کوچک نمی‌شود.
 */
export default function ZoomableDiagram({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragging = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomBy = (factor: number) => {
    setScale((s) => Math.min(5, Math.max(0.3, s * factor)));
  };

  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setScale((s) => Math.min(5, Math.max(0.3, s * factor)));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = { x: e.clientX, y: e.clientY, tx, ty };
    e.preventDefault();
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging.current) {
      setTx(dragging.current.tx + (e.clientX - dragging.current.x));
      setTy(dragging.current.ty + (e.clientY - dragging.current.y));
    }
  };

  const onMouseUp = () => {
    dragging.current = null;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          title="بزرگ‌نمایی"
          onClick={() => zoomBy(1.2)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-300"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="کوچک‌نمایی"
          onClick={() => zoomBy(1 / 1.2)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-300"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="تناسب با صفحه"
          onClick={reset}
          className="flex h-8 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 text-[11px] font-bold text-stone-600 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-300"
        >
          <Maximize className="h-3.5 w-3.5" />
          تناسب
        </button>
        <span className="flex items-center gap-1 rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-500 dark:bg-slate-800 dark:text-stone-400">
          <Move className="h-3.5 w-3.5" />
          {Math.round(scale * 100)}٪ — چرخ ماوس: زوم · کشیدن: جابه‌جایی
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative h-[70vh] cursor-grab overflow-auto rounded-xl border border-stone-200 bg-[#fbfdff] active:cursor-grabbing dark:border-stone-700 dark:bg-slate-950"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div
          className="min-h-full min-w-full p-6"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: "0 0" }}
        >
          {children}
        </div>
      </div>
      <p className="text-center text-[11px] text-stone-400 dark:text-stone-500">
        برای زوم از چرخ ماوس یا دکمه‌ها استفاده کنید؛ برای جابه‌جایی، محتوا را بگیرید و بکشید.
      </p>
    </div>
  );
}
