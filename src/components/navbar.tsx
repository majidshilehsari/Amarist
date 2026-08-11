import { Sigma } from "lucide-react";

const links = [{ href: "#modes", label: "حالت‌های پژوهشی" }];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-[#faf9f6]/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/20">
            <Sigma className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-stone-900">
            آماریست
          </span>
          <span className="mt-1 hidden rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500 sm:inline-block">
            Amarist
          </span>
        </a>

        <div className="hidden items-center gap-7 text-sm font-medium text-stone-600 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-indigo-600"
            >
              {link.label}
            </a>
          ))}
        </div>

        <a
          href="#modes"
          className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-600"
        >
          شروع کنید
        </a>
      </nav>
    </header>
  );
}
