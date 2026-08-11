import { MousePointerClick, FileOutput, Table2 } from "lucide-react";
import SectionHeading from "./section-heading";

const steps = [
  {
    icon: MousePointerClick,
    title: "حالت پژوهشی را انتخاب کنید",
    description:
      "از بین چهار حالت — اثربخشی یک درمان، مقایسه دو درمان، معادلات ساختاری یا پیش‌بینی رگرسیونی — یکی را انتخاب کنید.",
  },
  {
    icon: Table2,
    title: "داده را آماده کنید",
    description:
      "برای تحلیل، فایل اکسل یا CSV داده‌ی واقعی را وارد کنید؛ برای تمرین، حجم نمونه، اندازه اثر و پارامترهای داده را تعیین کنید.",
  },
  {
    icon: FileOutput,
    title: "نتیجه بگیرید و تحویل دهید",
    description:
      "گزارش تحلیل را مرور کنید، یا فایل داده‌ی تمرینی و کلید پاسخ را برای دانشجوها صادر کنید — همه‌چیز در مرورگر شما.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="نحوه کار"
          title="سه قدم تا کلاس درس آماده"
          description="طراحی ساده و بدون پیچیدگی؛ از انتخاب سناریو تا خروجی نهایی، همه‌چیز در چند کلیک."
        />

        <div className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
          {/* خط اتصال */}
          <div
            aria-hidden
            className="absolute top-8 right-[16%] left-[16%] hidden border-t-2 border-dashed border-stone-300 md:block"
          />

          {steps.map((step, i) => (
            <div key={step.title} className="relative flex flex-col items-center text-center">
              <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/25">
                <step.icon className="h-7 w-7" />
                <span className="absolute -top-2 -start-2 flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">
                  {["۱", "۲", "۳"][i]}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-extrabold text-stone-900">
                {step.title}
              </h3>
              <p className="mt-2 max-w-xs text-sm leading-7 text-stone-600">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
