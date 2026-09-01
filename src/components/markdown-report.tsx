"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownReport({ markdown }: { markdown: string }) {
  return (
    <article
      dir="rtl"
      className="mx-auto max-w-6xl rounded-2xl bg-white px-4 py-5 text-[13px] leading-7 text-stone-700 sm:px-7 sm:py-7 dark:bg-slate-900 dark:text-stone-200"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 border-b-2 border-indigo-200 pb-4 text-center text-2xl font-black text-indigo-950 dark:border-indigo-800 dark:text-indigo-100">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-8 border-r-4 border-indigo-500 pr-3 text-lg font-black text-stone-900 dark:text-stone-100">
              {children}
            </h2>
          ),
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
  );
}
