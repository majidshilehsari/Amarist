import { Sigma } from "lucide-react";
import AboutApp from "./about-app";

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
            <Sigma className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-sm font-extrabold text-stone-900 dark:text-stone-100">آماریست</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              دستیار هوشمند تحلیل آماری برای اساتید و دانشجویان
            </p>
          </div>
        </div>

        <AboutApp />
      </div>
    </footer>
  );
}
