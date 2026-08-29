import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "پیش‌بینی رگرسیونی | آماریست",
  description:
    "ابزار رگرسیون خطی چندگانه: تولید داده تمرینی هدفمند یا تحلیل داده واقعی؛ ضرایب B و β استاندارد، R² و R² تعدیل‌شده، آزمون F و بررسی پیش‌فرض‌ها.",
};

export default function RegressionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
