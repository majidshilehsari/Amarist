import { ArrowLeft, Check, Download, Sparkles } from "lucide-react";

const bars = [
  { cluster: "کنترل", label: "پیش", value: 52, height: "69%", color: "bg-stone-300" },
  { cluster: "کنترل", label: "پس", value: 54, height: "72%", color: "bg-stone-300" },
  { cluster: "درمان", label: "پیش", value: 53, height: "71%", color: "bg-gradient-to-t from-indigo-600 to-violet-500" },
  { cluster: "درمان", label: "پس", value: 71, height: "95%", color: "bg-gradient-to-t from-indigo-600 to-violet-500" },
];

const trust = ["بدون ثبت‌نام", "ذخیره در مرورگر", "خروجی اکسل و CSV"];

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* پس‌زمینه تزئینی */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-indigo-200/50 blur-3xl" />
        <div className="absolute top-40 -right-24 h-96 w-96 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:py-24">
        {/* متن */}
        <div className="text-center lg:text-start">
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-stone-600 shadow-sm">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            ابزار تخصصی اساتید آمار و روش تحقیق
          </span>

          <h1 className="mt-6 text-4xl font-black leading-[1.3] tracking-tight text-stone-900 sm:text-5xl">
            تحلیل آماری واقعی
            <br />
            و{" "}
            <span className="bg-gradient-to-l from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              تولید داده‌های تمرینی هدفمند
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-stone-600 lg:mx-0">
            آمارایست دو کار برایتان انجام می‌دهد: داده‌های پژوهشی واقعی را
            تحلیل می‌کند و داده‌های تمرینی شبیه‌سازی‌شده‌ای می‌سازد که
            دانشجوها با کار روی آن‌ها به نتایجِ مورد انتظار برسند.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <a
              href="#cta"
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30"
            >
              شروع با ابزارها
              <ArrowLeft className="h-5 w-5" />
            </a>
            <a
              href="#modes"
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-7 py-3.5 text-base font-semibold text-stone-800 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-600"
            >
              چهار حالت پژوهشی
            </a>
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-stone-500 lg:justify-start">
            {trust.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* ویزوال */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          {/* کارت گزارش تحلیل */}
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-900/5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-900">
                گزارش تحلیل — کارآزمایی بالینی
              </h3>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                تحلیل انجام شد
              </span>
            </div>

            {/* نمودار میله‌ای */}
            <div className="mt-5 flex items-end justify-center gap-8">
              {[0, 1].map((cluster) => (
                <div key={cluster} className="flex flex-col items-center gap-2">
                  <div className="flex items-end justify-center gap-2.5">
                    {bars
                      .filter((b) => b.cluster === (cluster === 0 ? "کنترل" : "درمان"))
                      .map((b) => (
                        <div key={b.label} className="flex w-10 flex-col items-center gap-1.5">
                          <span className="text-xs font-bold text-stone-700">{b.value}</span>
                          <div
                            className={`h-36 w-10 rounded-t-lg ${b.color} shadow-sm`}
                            style={{ height: `calc(9rem * ${parseFloat(b.height) / 100})` }}
                          />
                          <span className="text-[11px] font-medium text-stone-500">{b.label}</span>
                        </div>
                      ))}
                  </div>
                  <span className="text-xs font-bold text-stone-700">
                    {cluster === 0 ? "گروه کنترل" : "گروه درمان"}
                  </span>
                </div>
              ))}
            </div>

            {/* آماره‌ها */}
            <div className="mt-6 grid grid-cols-3 gap-2 border-t border-dashed border-stone-200 pt-4 text-center">
              <div>
                <p className="text-[11px] font-medium text-stone-500">آزمون t</p>
                <p className="mt-0.5 text-sm font-bold text-stone-900">t = ۴٫۳۲</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-stone-500">p-value</p>
                <p className="mt-0.5 text-sm font-bold text-emerald-700">p &lt; ۰٫۰۰۱</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-stone-500">اندازه اثر</p>
                <p className="mt-0.5 text-sm font-bold text-indigo-700">d = ۰٫۹۴</p>
              </div>
            </div>
          </div>

          {/* کارت داده تمرینی */}
          <div className="absolute -bottom-10 -start-6 hidden w-56 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl shadow-stone-900/10 sm:block">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Download className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-stone-900">داده تمرینی تولید شد</p>
                <p className="text-[11px] text-stone-500">۴۸ ردیف · ۴ متغیر</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2">
              <span className="text-[11px] font-medium text-stone-600">
                تمرین_کارآزمایی.xlsx
              </span>
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                CSV
              </span>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-stone-500">
              کلید پاسخ و نتایج مورد انتظار، جداگانه برای استاد.
            </p>
          </div>

          {/* برچسب‌های شناور */}
          <span className="absolute -top-5 -end-2 hidden rotate-3 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-bold text-violet-700 shadow-md lg:block">
            SEM · CFI = ۰٫۹۶
          </span>
          <span className="absolute -bottom-6 end-10 hidden -rotate-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 shadow-md lg:block">
            پیش‌بینی رگرسیونی · R² = ۰٫۷۸
          </span>
        </div>
      </div>
    </section>
  );
}
