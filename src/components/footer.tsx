import { Sigma } from "lucide-react";
import GithubIcon from "./github-icon";
import AboutApp from "./about-app";

const githubUrl = "https://github.com/majidshilehsari/Amarist";

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:px-6 md:flex-row">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
            <Sigma className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-sm font-extrabold text-stone-900">آماریست</p>
            <p className="text-xs text-stone-500">
              ابزار تحلیل آماری و تولید داده‌ی تمرینی برای اساتید و دانشجویان
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-stone-500">
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 transition-colors hover:text-indigo-600"
          >
            <GithubIcon className="h-4 w-4" />
            گیت‌هاب
          </a>
          <span className="text-stone-300">|</span>
          <span>ساخته‌شده با Next.js · آماده‌ی استقرار روی Vercel</span>
          <span className="text-stone-300">|</span>
          <AboutApp />
          <span className="text-stone-300">|</span>
          <span>© ۱۴۰۵</span>
        </div>
      </div>
    </footer>
  );
}
