"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Copy, RefreshCw } from "lucide-react";

type Props = { children: ReactNode; onError?: (err: Error, info: ErrorInfo) => void };
type State = { error: Error | null; info: ErrorInfo | null };

/**
 * مرز خطا: هر خطای رندر را می‌گیرد و به‌جای صفحه سفید، یک مودال با جزئیات خطا
 * (نام، پیام، بخشِ رخ‌داده، stack) نشان می‌دهد تا قابل گزارش باشد.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    this.props.onError?.(error, info);
  }

  copyDetails = async () => {
    const { error, info } = this.state;
    const text = `خطای آماریست\n============\nپیام: ${error?.message}\n\nجزئیات:\n${error?.stack ?? ""}\n\nبخش:\n${info?.componentStack ?? ""}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      alert("جزئیات خطا کپی شد؛ آن را برای پشتیبانی بفرستید.");
    } catch {
      // ignore
    }
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    // استخراج نام بخش از componentStack
    const sectionMatch = info?.componentStack?.match(/at\s+([A-Za-z0-9_]+)/g)?.[1] ?? "نامشخص";

    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-lg rounded-2xl border border-red-300 bg-white p-6 shadow-2xl dark:border-red-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">خطایی رخ داد</h3>
              <p className="text-[12px] text-stone-500 dark:text-stone-400">
                بخش: {sectionMatch} — جزئیات زیر را کپی کنید و برای ما بفرستید.
              </p>
            </div>
          </div>

          <div className="mt-4 max-h-52 overflow-auto rounded-xl bg-red-50 p-3 font-mono text-[12px] leading-5 text-red-800 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-black">{error.message}</p>
            <pre className="mt-2 whitespace-pre-wrap">{error.stack}</pre>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={this.copyDetails}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-extrabold text-red-700 transition hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
            >
              <Copy className="h-4 w-4" />
              کپی جزئیات خطا
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-extrabold text-white shadow transition hover:bg-indigo-500"
            >
              <RefreshCw className="h-4 w-4" />
              بارگذاری دوباره صفحه
            </button>
          </div>
        </div>
      </div>
    );
  }
}
