import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "مقایسه اثربخشی دو درمان | آماریست",
  description:
    "ابزار طراحی و تحلیل کارآزمایی مقایسه اثربخشی دو درمان: دو گروه مستقل با یا بدون مرحله پیگیری؛ تولید داده تمرینی هدفمند یا تحلیل داده واقعی با تحلیل واریانس اندازه‌گیری مکرر، ANCOVA، بن‌فرونی و بررسی پیش‌فرض‌ها.",
};

export default function CompareTreatmentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
