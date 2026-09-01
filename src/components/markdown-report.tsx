"use client";

import { useId, useMemo, useState, type MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ReportSection = { id: string; title: string };

function plainHeading(value: string): string {
  return value
    .replace(/\\([\\`*_[\]<>])/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

export default function MarkdownReport({ markdown }: { markdown: string }) {
  const idPrefix = useId().replace(/:/g, "");
  const sections = useMemo<ReportSection[]>(() => {
    let index = 0;
    return markdown
      .split("\n")
      .filter((line) => /^##\s+/.test(line))
      .map((line) => ({
        id: `${idPrefix}-report-section-${index++}`,
        title: plainHeading(line.replace(/^##\s+/, "")),
      }));
  }, [idPrefix, markdown]);
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
  const resolvedActiveSection = sections.some((section) => section.id === activeSection)
    ? activeSection
    : sections[0]?.id ?? "";

  const goToSection = (event: MouseEvent<HTMLAnchorElement>, section: ReportSection) => {
    event.preventDefault();
    document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(section.id);
  };

  let headingIndex = 0;
  return (
    <div dir="rtl" className="mx-auto grid max-w-[1480px] items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
      {sections.length > 0 && (
        <nav
          aria-label="راهبری بخش‌های گزارش"
          className="sticky top-0 z-20 rounded-2xl border border-indigo-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-indigo-800 dark:bg-slate-900/95 lg:top-3 lg:max-h-[66vh] lg:overflow-y-auto"
        >
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-stone-100 pb-2 dark:border-stone-800">
            <strong className="text-[13px] font-black text-indigo-950 dark:text-indigo-100">راهبری سریع گزارش</strong>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {sections.length.toLocaleString("fa-IR")} بخش
            </span>
          </div>
          <div className="grid max-h-36 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3 lg:max-h-none lg:grid-cols-1 lg:overflow-visible">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={(event) => goToSection(event, section)}
                className={`rounded-lg border px-2.5 py-2 text-[11px] font-bold leading-5 transition ${
                  resolvedActiveSection === section.id
                    ? "border-indigo-300 bg-indigo-600 text-white shadow-sm dark:border-indigo-500"
                    : "border-transparent bg-stone-50 text-stone-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800 dark:bg-slate-800 dark:text-stone-300 dark:hover:border-indigo-800 dark:hover:bg-indigo-950 dark:hover:text-indigo-200"
                }`}
              >
                {section.title}
              </a>
            ))}
          </div>
        </nav>
      )}

      <article className="min-w-0 rounded-2xl bg-white px-4 py-5 text-[13px] leading-7 text-stone-700 sm:px-7 sm:py-7 dark:bg-slate-900 dark:text-stone-200">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            h1: ({ children }) => (
              <h1 className="mb-3 border-b-2 border-indigo-200 pb-4 text-center text-2xl font-black text-indigo-950 dark:border-indigo-800 dark:text-indigo-100">
                {children}
              </h1>
            ),
            h2: ({ children }) => {
              const section = sections[headingIndex++];
              return (
                <h2
                  id={section?.id}
                  className="mb-3 mt-8 scroll-mt-4 border-r-4 border-indigo-500 pr-3 text-lg font-black text-stone-900 dark:text-stone-100"
                >
                  {children}
                </h2>
              );
            },
            h3: ({ children }) => (
              <h3 className="mb-2 mt-6 text-[15px] font-black text-indigo-800 dark:text-indigo-300">{children}</h3>
            ),
            p: ({ children }) => <p className="my-2 leading-8">{children}</p>,
            strong: ({ children }) => <strong className="font-black text-stone-950 dark:text-white">{children}</strong>,
            ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pr-6 marker:text-indigo-500">{children}</ul>,
            ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pr-6 marker:font-bold marker:text-indigo-500">{children}</ol>,
            li: ({ children }) => <li className="pr-1">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="my-4 rounded-xl border-r-4 border-cyan-500 bg-cyan-50 px-4 py-2 text-cyan-950 dark:bg-cyan-950/30 dark:text-cyan-100">
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <div className="my-4 overflow-x-auto rounded-xl border border-stone-200 shadow-sm dark:border-stone-700">
                <table className="w-full min-w-[640px] border-collapse text-right text-[12px]">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100">{children}</thead>,
            tbody: ({ children }) => <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{children}</tbody>,
            tr: ({ children }) => <tr className="transition-colors even:bg-stone-50/70 hover:bg-amber-50/70 dark:even:bg-slate-800/50 dark:hover:bg-amber-950/20">{children}</tr>,
            th: ({ children }) => <th className="whitespace-nowrap border-b border-stone-200 px-3 py-2.5 font-black dark:border-stone-700">{children}</th>,
            td: ({ children }) => <td className="border-l border-stone-100 px-3 py-2 align-top last:border-l-0 dark:border-stone-800">{children}</td>,
            hr: () => <hr className="my-7 border-stone-200 dark:border-stone-700" />,
            code: ({ children, className }) => (
              <code
                dir="ltr"
                className={
                  className
                    ? "my-3 block overflow-x-auto rounded-xl bg-slate-950 p-4 text-left text-[12px] leading-6 text-slate-100"
                    : "rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[12px] text-rose-700 dark:bg-slate-800 dark:text-rose-300"
                }
              >
                {children}
              </code>
            ),
            img: ({ alt }) => <span className="text-stone-500">[تصویر حذف‌شده: {alt || "بدون عنوان"}]</span>,
            a: ({ children, href }) => (
              <a href={href} className="font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-4 dark:text-indigo-300" target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
