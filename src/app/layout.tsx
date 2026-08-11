import type { Metadata } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";

export const metadata: Metadata = {
  title: "آماریست | تحلیل آماری واقعی و تولید داده‌های تمرینی",
  description:
    "سرویس آنلاین تحلیل داده‌های پژوهشی و تولید داده‌های تمرینی هدفمند برای اساتید آمار و روش تحقیق؛ بدون دیتابیس و ثبت‌نام، با ذخیره‌سازی در مرورگر و خروجی اکسل، ورد و CSV.",
  openGraph: {
    title: "آماریست | تحلیل آماری واقعی و تولید داده‌های تمرینی",
    description:
      "تحلیل داده‌های پژوهشی واقعی و تولید داده‌های تمرینی هدفمند برای اساتید آمار و روش تحقیق.",
    locale: "fa_IR",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
