import { Construction, Rocket } from "lucide-react";
import GithubIcon from "./github-icon";

const githubUrl = "https://github.com/majidshilehsari/Amarist";

export default function Cta() {
  return (
    <section id="cta" className="scroll-mt-20 py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-stone-900 via-indigo-950 to-violet-950 px-6 py-16 text-center shadow-2xl sm:px-16">
          {/* تزئینات */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -start-20 h-64 w-64 rounded-full bg-indigo-500/30 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -end-16 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl"
          />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-medium text-indigo-200 backdrop-blur">
              <Construction className="h-4 w-4" />
              مرحله اول: لندینگ‌پیج
            </span>

            <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-black leading-[1.35] tracking-tight text-white sm:text-4xl">
              ابزارهای تحلیل و تولید داده
              <br />
              به‌زودی در همین صفحه فعال می‌شوند
            </h2>

            <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-indigo-200/90">
              موتور ورود داده از اکسل و تولید داده‌ی تمرینی در حال آماده‌سازی
              است. پیشرفت پروژه را در گیت‌هاب دنبال کنید.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-stone-900 shadow-lg transition-transform hover:scale-[1.03]"
              >
                <GithubIcon className="h-5 w-5" />
                مشاهده سورس در گیت‌هاب
              </a>
              <a
                href="#modes"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
              >
                <Rocket className="h-5 w-5" />
                مرور حالت‌های پژوهشی
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
