import {
  FlaskConical,
  GitCompareArrows,
  HeartPulse,
  Network,
  TrendingUp,
} from "lucide-react";
import SectionHeading from "./section-heading";
import FollowUpToggle from "./follow-up-toggle";

const categories = [
  {
    id: "clinical",
    icon: HeartPulse,
    title: "پژوهش‌های مداخله‌ای",
    subtitle: "کارآزمایی بالینی",
    description:
      "تحلیل و تولید داده برای پژوهش‌هایی که در آن‌ها یک مداخله (درمان، آموزش، برنامه) روی شرکت‌کننده‌ها اعمال می‌شود.",
    accent: {
      panelBorder: "border-rose-200",
      panelBg: "bg-rose-50/60",
      badge: "bg-rose-100 text-rose-700",
      cardRing: "hover:border-rose-300",
      iconBg: "bg-rose-100 text-rose-700",
    },
    modes: [
      {
        icon: FlaskConical,
        title: "اثربخشی یک درمان",
        description:
          "بررسی اثر یک مداخله روی یک گروه؛ مقایسه‌ی پیش و پس از مداخله، یا گروه مداخله با گروه کنترل.",
      },
      {
        icon: GitCompareArrows,
        title: "مقایسه اثربخشی دو درمان",
        description:
          "مقایسه‌ی اثر دو مداخله در دو گروه مستقل؛ مشخص کردن اینکه کدام درمان مؤثرتر است.",
      },
    ],
  },
  {
    id: "modeling",
    icon: Network,
    title: "پژوهش‌های مدل‌سازی",
    subtitle: "مدل‌سازی و پیش‌بینی",
    description:
      "تحلیل و تولید داده برای پژوهش‌هایی که روابط بین متغیرها را مدل‌سازی می‌کنند یا پیامد را پیش‌بینی می‌کنند.",
    accent: {
      panelBorder: "border-sky-200",
      panelBg: "bg-sky-50/60",
      badge: "bg-sky-100 text-sky-700",
      cardRing: "hover:border-sky-300",
      iconBg: "bg-sky-100 text-sky-700",
    },
    modes: [
      {
        icon: Network,
        title: "معادلات ساختاری (SEM)",
        description:
          "بررسی روابط بین متغیرهای پنهان و آشکار، مسیرهای علّی و برازش مدل با شاخص‌های استاندارد.",
        tags: ["تحلیل مسیر", "شاخص‌های برازش", "CFI / RMSEA"],
      },
      {
        icon: TrendingUp,
        title: "پیش‌بینی رگرسیونی",
        description:
          "پیش‌بینی متغیر پیامد از روی چند متغیر پیش‌بین؛ ساخت و اعتباریابی مدل رگرسیون.",
        tags: ["رگرسیون خطی", "رگرسیون چندگانه", "R²"],
      },
    ],
  },
];

export default function ResearchModes() {
  return (
    <section
      id="modes"
      className="scroll-mt-20 border-y border-stone-200 bg-white py-20 lg:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="در قلب آماریست"
          title="چهار حالت پژوهشی"
          description="همه‌ی ابزارهای آماریست حول چهار حالت پژوهشی می‌چرخند؛ برای هر حالت هم می‌توانید داده‌ی واقعی تحلیل کنید، هم داده‌ی تمرینی هدفمند تولید کنید."
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          {categories.map((category) => (
            <div
              key={category.id}
              className={`rounded-3xl border ${category.accent.panelBorder} ${category.accent.panelBg} p-6 sm:p-8`}
            >
              {/* سربرگ دسته */}
              <div className="flex items-center gap-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${category.accent.iconBg}`}
                >
                  <category.icon className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-xl font-extrabold tracking-tight text-stone-900">
                    {category.title}
                  </h3>
                  <span
                    className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${category.accent.badge}`}
                  >
                    {category.subtitle}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-stone-600">
                {category.description}
              </p>

              {/* حالت‌ها */}
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {category.modes.map((mode) => (
                  <div
                    key={mode.title}
                    className={`flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${category.accent.cardRing}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${category.accent.iconBg}`}
                      >
                        <mode.icon className="h-5 w-5" />
                      </span>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                        در دست ساخت
                      </span>
                    </div>
                    <h4 className="mt-4 font-extrabold text-stone-900">
                      {mode.title}
                    </h4>
                    <p className="mt-2 flex-1 text-[13px] leading-6 text-stone-600">
                      {mode.description}
                    </p>
                    {"tags" in mode && mode.tags ? (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {mode.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <FollowUpToggle />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
