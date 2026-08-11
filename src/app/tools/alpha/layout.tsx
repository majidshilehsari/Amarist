import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "اندازه‌گیری و تحلیل آلفای کرونباخ | آماریست",
  description:
    "ابزار جداگانه محاسبه آلفای کرونباخ: تعریف پرسشنامه‌ها و گویه‌ها، تولید داده تمرینی یا ورود داده واقعی، آمار گویه‌ها، همبستگی گویه-کل، آلفا اگر گویه حذف شود و آلفای استانداردشده.",
};

export default function AlphaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
