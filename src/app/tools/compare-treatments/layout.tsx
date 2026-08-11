import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تولید داده تمرینی — مقایسه اثربخشی دو درمان | آماریست",
  description:
    "ابزار تولید سه لیست ۴۵تایی با سه گروه ۱۵نفره برای طراحی کارآزمایی مقایسه اثربخشی دو درمان؛ با تحلیل واریانس اندازه‌گیری مکرر، بررسی پیش‌فرض‌ها، بن‌فرونی و خروجی آماده اکسل.",
};

export default function CompareTreatmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
