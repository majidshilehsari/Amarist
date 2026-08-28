// فهرست پروژه‌های پیش‌فرض (الگوهای سناریوی پژوهشی).
// برای افزودن پروژه جدید: فایل را در این پوشه بسازید، سپس به آرایهٔ زیر اضافه کنید.
import type { DefaultProject } from "./types";
import { taraRazvani } from "./tara-razvani";

export const defaultProjects: DefaultProject[] = [taraRazvani];

export { taraRazvani };
export * from "./types";
