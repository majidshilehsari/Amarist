import {
  ChartColumn,
  Check,
  Dices,
  FileSpreadsheet,
  Gauge,
  KeyRound,
  Repeat,
} from "lucide-react";
import SectionHeading from "./section-heading";

const services = [
  {
    icon: ChartColumn,
    title: "تحلیل داده‌های واقعی",
    description:
      "داده‌های پژوهشی خود را وارد کنید؛ آمارایست تحلیل توصیفی و استنباطی را انجام می‌دهد و گزارش آماری قابل‌ارائه تحویل می‌دهد.",
    features: [
      "ورود داده با اکسل، CSV یا دستی",
      "آمار توصیفی، آزمون فرضیه و اندازه اثر",
      "گزارش و نمودار آماده ارائه",
      "سازگار با هر چهار حالت پژوهشی",
    ],
    accent: {
      iconBg: "bg-indigo-100 text-indigo-700",
      ring: "hover:border-indigo-300",
      tag: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
  },
  {
    icon: Dices,
    title: "تولید داده‌های تمرینی هدفمند",
    description:
      "سناریوی پژوهشی و ویژگی‌های آماری را مشخص کنید؛ داده‌ی تمرینی شبیه‌سازی‌شده با مشخصات دقیق تولید می‌شود تا دانشجوها به نتایج مورد انتظار برسند.",
    features: [
      "تعیین حجم نمونه، اندازه اثر و پارامترها",
      "خروجی CSV و اکسل برای دانشجوها",
      "کلید پاسخ و نتایج مورد انتظار برای استاد",
      "بازتولیدپذیر با شماره دانه (Seed)",
    ],
    accent: {
      iconBg: "bg-emerald-100 text-emerald-700",
      ring: "hover:border-emerald-300",
      tag: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
  },
];

const featureIcons = [FileSpreadsheet, Gauge, KeyRound, Repeat];

export default function Services() {
  return (
    <section id="services" className="scroll-mt-20 py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="دو سرویس، یک هدف"
          title="هر آنچه برای کلاس درس آمار لازم دارید"
          description="اساتید در حین درس‌دادن، سخت‌ترین بخش را پیدا کردن داده‌های تمرینی می‌دانند که دانشجوها با آن‌ها به نتایجِ مشابه برسند. آمارایست این دو سرویس را کنار هم می‌گذارد."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {services.map((service) => (
            <article
              key={service.title}
              className={`group flex flex-col rounded-3xl border border-stone-200 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-stone-900/5 ${service.accent.ring}`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl ${service.accent.iconBg}`}
                >
                  <service.icon className="h-7 w-7" />
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${service.accent.tag}`}
                >
                  به‌زودی
                </span>
              </div>

              <h3 className="mt-6 text-2xl font-extrabold tracking-tight text-stone-900">
                {service.title}
              </h3>
              <p className="mt-3 leading-8 text-stone-600">{service.description}</p>

              <ul className="mt-6 grid gap-3">
                {service.features.map((feature, i) => {
                  const Icon = featureIcons[i];
                  return (
                    <li key={feature} className="flex items-center gap-3 text-sm font-medium text-stone-700">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      {feature}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-8 flex items-center gap-2 border-t border-dashed border-stone-200 pt-5 text-sm font-semibold text-stone-500">
                <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} />
                بدون دیتابیس — همه‌چیز در مرورگر شما ذخیره می‌شود
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
