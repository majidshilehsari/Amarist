"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_STORAGE_KEY = "amarist-theme";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** منبعِ حقیقت، کلاسِ روی <html> است؛ همان چیزی که اسکریپتِ پیش از هیدریشن تنظیم می‌کند. */
function getSnapshot(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.classList.contains("dark");
}

/** پیش‌فرضِ برنامه دارک است (سرور هم همین را رندر می‌کند). */
function getServerSnapshot(): boolean {
  return true;
}

function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // ذخیره‌سازی در دسترس نبود؛ تغییرِ ظاهر همچنان اعمال شده است.
  }
  listeners.forEach((listener) => listener());
}

/**
 * سوییچِ لایت / دارک — در هدرِ صفحهٔ فرود و هدرِ همهٔ ابزارها استفاده می‌شود.
 * پیش‌فرضِ برنامه دارک است و انتخابِ کاربر در localStorage می‌ماند.
 */
export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-stone-200 bg-white p-0.5 shadow-sm dark:border-stone-700 dark:bg-slate-800"
      role="radiogroup"
      aria-label="حالت نمایش"
    >
      <button
        type="button"
        role="radio"
        aria-checked={!dark}
        onClick={() => setTheme(false)}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
          !dark ? "bg-indigo-600 text-white shadow" : "text-stone-500 hover:text-stone-700 dark:text-stone-400"
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
        لایت
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={dark}
        onClick={() => setTheme(true)}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
          dark ? "bg-indigo-600 text-white shadow" : "text-stone-500 hover:text-stone-700 dark:text-stone-400"
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
        دارک
      </button>
    </div>
  );
}
