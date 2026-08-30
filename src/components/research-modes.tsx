"use client";

import Link from "next/link";
import {
  ArrowLeft,
  FlaskConical,
  GitCompareArrows,
  Network,
  TrendingUp,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

type Mode = {
  icon: LucideIcon;
  title: string;
  href: string;
  /** گرادیانِ هویتِ هر ابزار (روشن و تاریک) */
  accent: {
    gradient: string;
    iconWrap: string;
    ring: string;
    glow: string;
  };
};

const MODES: Mode[] = [
  {
    icon: FlaskConical,
    title: "اثربخشی یک مداخله",
    href: "/tools/one-treatment",
    accent: {
      gradient: "from-rose-500 to-orange-500",
      iconWrap: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
      ring: "hover:border-rose-400/70 dark:hover:border-rose-500/60",
      glow: "group-hover:shadow-rose-500/20",
    },
  },
  {
    icon: GitCompareArrows,
    title: "مقایسه اثربخشی دو درمان",
    href: "/tools/compare-treatments",
    accent: {
      gradient: "from-violet-500 to-purple-500",
      iconWrap: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
      ring: "hover:border-violet-400/70 dark:hover:border-violet-500/60",
      glow: "group-hover:shadow-violet-500/20",
    },
  },
  {
    icon: Waypoints,
    title: "تحلیل مسیر",
    href: "/tools/sem",
    accent: {
      gradient: "from-sky-500 to-cyan-500",
      iconWrap: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
      ring: "hover:border-sky-400/70 dark:hover:border-sky-500/60",
      glow: "group-hover:shadow-sky-500/20",
    },
  },
  {
    icon: Network,
    title: "مدل معادلات ساختاری (SEM)",
    href: "/tools/sem",
    accent: {
      gradient: "from-indigo-500 to-blue-500",
      iconWrap: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
      ring: "hover:border-indigo-400/70 dark:hover:border-indigo-500/60",
      glow: "group-hover:shadow-indigo-500/20",
    },
  },
  {
    icon: TrendingUp,
    title: "پیش‌بینی رگرسیونی",
    href: "/tools/regression",
    accent: {
      gradient: "from-emerald-500 to-teal-500",
      iconWrap: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
      ring: "hover:border-emerald-400/70 dark:hover:border-emerald-500/60",
      glow: "group-hover:shadow-emerald-500/20",
    },
  },
];

export default function ResearchModes() {
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-[#faf9f6] py-14 dark:bg-slate-900 lg:py-20"
    >
      {/* هاله‌های رنگیِ پس‌زمینه */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 right-1/4 h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-600/20" />
        <div className="absolute -bottom-28 left-1/4 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl dark:bg-violet-600/20" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center">
          <h1 className="text-balance text-3xl font-black leading-tight tracking-tight text-stone-900 dark:text-white sm:text-4xl lg:text-5xl">
            دستیار هوشمند تحلیل آماری برای اساتید و دانشجویان
          </h1>
        </div>

        <div id="modes" className="mt-12 scroll-mt-24">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {MODES.map((mode) => (
              <Link
                key={mode.title}
                href={mode.href}
                className={`group relative flex flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${mode.accent.ring} ${mode.accent.glow}`}
              >
                {/* نوارِ رنگیِ بالای کارت */}
                <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${mode.accent.gradient}`} />

                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${mode.accent.iconWrap}`}
                >
                  <mode.icon className="h-6 w-6" strokeWidth={2.2} />
                </span>

                <h3 className="mt-4 flex-1 text-[15px] font-extrabold leading-7 text-stone-900 dark:text-stone-100">
                  {mode.title}
                </h3>

                <span
                  className={`mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-l px-3 py-2.5 text-[13px] font-extrabold text-white shadow-md transition group-hover:brightness-110 ${mode.accent.gradient}`}
                >
                  ورود به ابزار
                  <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
