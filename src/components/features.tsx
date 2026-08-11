import {
  Database,
  FileSpreadsheet,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import SectionHeading from "./section-heading";

const features = [
  {
    icon: Database,
    title: "بدون دیتابیس و بدون ثبت‌نام",
    description:
      "نیازی به حساب کاربری نیست؛ همه‌ی داده‌ها و پروژه‌های شما در مرورگر خودتان ذخیره می‌شود و با باز کردن صفحه، سر جای خودش است.",
    accent: "bg-indigo-100 text-indigo-700",
  },
  {
    icon: FileSpreadsheet,
    title: "خروجی اکسل، ورد و CSV",
    description:
      "داده‌های تمرینی و گزارش‌ها را به‌صورت فایل اکسل، سند ورد یا CSV دانلود کنید و هر وقت خواستید، از داده‌ها بکاپ بگیرید.",
    accent: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: ShieldCheck,
    title: "حریم خصوصی داده‌های پژوهشی",
    description:
      "داده‌های شما از مرورگر خارج نمی‌شود و روی هیچ سروری ذخیره نمی‌شود؛ مناسب داده‌های پایان‌نامه و طرح‌های پژوهشی.",
    accent: "bg-sky-100 text-sky-700",
  },
  {
    icon: GraduationCap,
    title: "طراحی‌شده برای کلاس درس",
    description:
      "به‌جای نرم‌افزارهای سنگین و پیچیده، ابزاری ساده و سریع برای استاد: داده‌ی تمرینی آماده، با نتایجِ مورد انتظارِ مشخص.",
    accent: "bg-amber-100 text-amber-700",
  },
];

export default function Features() {
  return (
    <section
      id="features"
      className="scroll-mt-20 border-t border-stone-200 bg-white py-20 lg:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="چرا آمارایست؟"
          title="ساده، امن و آماده‌ی ارائه"
          description="بدون نصب نرم‌افزار، بدون دیتابیس، بدون نگرانی از لو رفتن داده‌ها."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-3xl border border-stone-200 bg-[#faf9f6] p-6 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-stone-900/5"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${feature.accent}`}
              >
                <feature.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 font-extrabold text-stone-900">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-7 text-stone-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
