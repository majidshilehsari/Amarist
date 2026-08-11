import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تحلیل مسیر و مدل معادلات ساختاری (SEM) | آماریست",
  description:
    "ابزار تحلیل مسیر و مدل معادلات ساختاری: تولید داده تمرینی یا تحلیل داده واقعی با متغیرهای پنهان، میانجی‌گری، بررسی پیش‌فرض‌ها (ماهالانوبیس، مردیا، کجی و کشیدگی، VIF) و شاخص‌های برازش.",
};

export default function SemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
