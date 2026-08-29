"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical, GitCompareArrows, Network, TrendingUp, Waypoints, type LucideIcon } from "lucide-react";

type Mode = {
  icon: LucideIcon;
  title: string;
  bullets: string[];
  href: string;
  accent: {
    cardRing: string;
    iconBg: string;
    chip: string;
  };
};

const MODES: Mode[] = [
  {
    icon: FlaskConical,
    title: "اثربخشی یک مداخله",
    bullets: ["یک گروه آزمایش و یک گروه کنترل", "پیش‌آزمون و پس‌آزمون"],
    href: "/tools/one-treatment",
    accent: {
      cardRing: "hover:border-rose-300",
      iconBg: "bg-rose-100 text-rose-700",
      chip: "bg-rose-50 text-rose-600",
    },
  },
  {
    icon: GitCompareArrows,
    title: "مقایسه اثربخشی دو درمان",
    bullets: ["سه گروه: کنترل، درمان ۱، درمان ۲", "پیش/پس + مرحله پیگیری اختیاری"],
    href: "/tools/compare-treatments",
    accent: {
      cardRing: "hover:border-violet-300",
      iconBg: "bg-violet-100 text-violet-700",
      chip: "bg-violet-50 text-violet-600",
    },
  },
  {
    icon: Waypoints,
    title: "تحلیل مسیر",
    bullets: ["متغیرهای مشاهده‌شده", "روابط مستقیم و غیرمستقیم"],
    href: "/tools/sem",
    accent: {
      cardRing: "hover:border-sky-300",
      iconBg: "bg-sky-100 text-sky-700",
      chip: "bg-sky-50 text-sky-600",
    },
  },
  {
    icon: Network,
    title: "مدل معادلات ساختاری (SEM)",
    bullets: ["متغیر پنهان و اندازه‌گیری", "شاخص‌های برازش: CFI / RMSEA"],
    href: "/tools/sem",
    accent: {
      cardRing: "hover:border-indigo-300",
      iconBg: "bg-indigo-100 text-indigo-700",
      chip: "bg-indigo-50 text-indigo-600",
    },
  },
  {
    icon: TrendingUp,
    title: "پیش‌بینی رگرسیونی",
    bullets: ["رگرسیون خطی چندگانه", "R² و ضرایب استاندارد"],
    href: "/tools/regression",
    accent: {
      cardRing: "hover:border-emerald-300",
      iconBg: "bg-emerald-100 text-emerald-700",
      chip: "bg-emerald-50 text-emerald-600",
    },
  },
];

export default function ResearchModes() {
  const [followup, setFollowup] = useState(true);

  return (
    <section id="modes" className="scroll-mt-20 bg-white py-10 lg:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-black tracking-tight text-stone-900">حالت‌های پژوهشی</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-stone-500">
            ابزار مناسب پژوهش خود را انتخاب کنید؛ هر ابزار داده تمرینی هدفمند تولید می‌کند و تحلیل و گزارش کامل می‌دهد.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {MODES.map((mode) => {
            const compareCard = mode.title === "مقایسه اثربخشی دو درمان";
            const href = compareCard ? `${mode.href}?followup=${followup ? "1" : "0"}` : mode.href;

            const inner = (
              <>
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${mode.accent.iconBg}`}>
                  <mode.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-3 text-[15px] font-extrabold leading-6 text-stone-900">{mode.title}</h3>
                <ul className="mt-2 flex-1 space-y-1.5">
                  {mode.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-1.5 text-[12px] leading-5 text-stone-600">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" />
                      {b}
                    </li>
                  ))}
                </ul>

                {compareCard && (
                  <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-2.5 py-2 dark:border-stone-700 dark:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={followup}
                      onChange={(e) => setFollowup(e.target.checked)}
                      className="h-4 w-4 accent-indigo-600"
                    />
                    <span className="text-[11px] font-bold leading-4 text-stone-600 dark:text-stone-300">
                      مرحله پیگیری داشته باشد
                    </span>
                  </label>
                )}

                <span className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-extrabold text-stone-700 transition group-hover:border-indigo-300 group-hover:text-indigo-700 dark:border-stone-700 dark:bg-slate-800 dark:text-stone-200">
                  ورود به ابزار
                  <ArrowLeft className="h-4 w-4" />
                </span>
              </>
            );

            return (
              <Link
                key={mode.title}
                href={href}
                className={`group flex flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${mode.accent.cardRing}`}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
