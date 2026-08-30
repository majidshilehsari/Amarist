// فهرست پروژه‌های پیش‌فرض (الگوهای سناریوی پژوهشی).
// برای افزودن پروژه جدید: فایل را در این پوشه بسازید، سپس به آرایهٔ زیر اضافه کنید.
import type { DefaultProject } from "./types";
import { defaultProject3 } from "./default-project-3";

export const defaultProjects: DefaultProject[] = [defaultProject3];

export { defaultProject3 };
export * from "./types";
