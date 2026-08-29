import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "اثربخشی یک درمان | آماریست",
  description:
    "ابزار طراحی و تحلیل کارآزمایی اثربخشی یک درمان: گروه مداخله در برابر گروه کنترل با پیش‌آزمون و پس‌آزمون؛ تولید داده تمرینی هدفمند یا تحلیل داده واقعی با t مستقل، ANCOVA، اندازه اثر و بررسی پیش‌فرض‌ها.",
};

export default function OneTreatmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
