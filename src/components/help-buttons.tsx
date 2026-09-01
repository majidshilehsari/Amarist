"use client";

import { useState } from "react";
import { BookOpen, HelpCircle, X } from "lucide-react";

export type HelpContent = {
  help: string[];
  /** درسنامه آموزشی با منبع (فقط برای بخش‌های آماری) */
  guide?: { title: string; paragraphs: string[]; references: string[] };
};

/** بخش‌هایی که صرفاً نرم‌افزاری‌اند — آموزش ندارند */
const SOFTWARE_ONLY = new Set(["project", "diagnose", "save"]);

export const HELP_CONTENTS: Record<string, HelpContent> = {
  project: {
    help: [
      "پروژه یعنی یک مجموعه کامل از تنظیمات، متغیرها، فلش‌ها، قیود و داده که در مرورگر شما ذخیره می‌شود.",
      "با «پروژه جدید» یک پروژه خالی با متغیرهای پیش‌فرض می‌سازید و از مرحله اول شروع می‌کنید.",
      "همه تغییرات به‌صورت خودکار ذخیره می‌شوند؛ برای انتقال بین مرورگرها از «بکاپ پروژه‌ها» استفاده کنید.",
    ],
  },
  source: {
    help: [
      "منبع داده تعیین می‌کند داده از کجا می‌آید: تولید تمرینی (شبیه‌سازی با قیود آماری) یا داده واقعی شما.",
      "در حالت تولید، موتور داده‌ای می‌سازد که همه قیود انتخابی (معنی‌داری مسیرها، R²، برازش) را رعایت کند.",
      "در حالت واقعی، فایل اکسل خود را در مرحله «جدول داده‌ها» وارد می‌کنید.",
    ],
    guide: {
      title: "درسنامه: منبع داده در مدل‌یابی معادلات ساختاری",
      paragraphs: [
        "در مدل‌یابی معادلات ساختاری (SEM)، داده‌ها می‌توانند از نمونه‌گیری واقعی یا شبیه‌سازی (Monte Carlo) به دست آیند. داده شبیه‌سازی‌شده برای تمرین دانشجو و آزمون روش‌ها کاربرد دارد، اما نتایج پژوهش واقعی باید بر پایه داده‌های نمونه‌گیری‌شده باشد.",
        "برای تحلیل‌های مبتنی بر SEM، حجم نمونه پیشنهادی معمولاً حداقل ۱۰ تا ۲۰ مورد به ازای هر پارامتر برآوردی است (Kline, 2023).",
      ],
      references: [
        "Kline, R. B. (2023). Principles and practice of structural equation modeling (5th ed.). Guilford Press.",
        "Muthén, L. K., & Muthén, B. O. (2002). How to use a Monte Carlo study to decide on sample size and determine power. Structural Equation Modeling, 9(4), 599–620.",
      ],
    },
  },
  variables: {
    help: [
      "متغیر پژوهش = پرسشنامه یا سازه‌ای که اندازه‌گیری می‌شود (مثلاً طرحواره‌های ناسازگار).",
      "نقش متغیر: برون‌زا (X) = پیش‌بین، میانجی (M) = واسطه، درون‌زا (Y) = پیامد.",
      "اگر متغیر زیرمقیاس دارد و جمع‌پذیر است، نمره کل = مجموع زیرمقیاس‌ها وارد مدل می‌شود (متغیر پنهان).",
      "اگر جمع‌پذیر نیست، هر زیرمقیاس به‌صورت یک متغیر مستقل با فلش جداگانه وارد مدل می‌شود.",
    ],
    guide: {
      title: "درسنامه: متغیر پنهان، زیرمقیاس و نمره کل",
      paragraphs: [
        "سازه‌های روان‌شناختی (مانند طرحواره‌ها یا نشخوار فکری) معمولاً مستقیم قابل مشاهده نیستند و با چند شاخص (گویه/زیرمقیاس) اندازه‌گیری می‌شوند؛ به این سازه‌ها «متغیر پنهان» (Latent Variable) می‌گویند.",
        "وقتی پرسشنامه از چند زیرمقیاس تشکیل شده و نمره کل معنادار است (جمع‌پذیری)، نمره کل به‌عنوان شاخص سازه وارد مدل می‌شود. اگر زیرمقیاس‌ها سازه‌های نسبتاً مستقل باشند، بهتر است هرکدام جداگانه (به‌عنوان متغیر مشاهده‌شده) در مدل وارد شوند.",
        "در مدل‌های میانجی، حداقل یک متغیر برون‌زا (X)، یک میانجی (M) و یک درون‌زا (Y) لازم است تا مسیرهای مستقیم و غیرمستقیم قابل برآورد باشند.",
      ],
      references: [
        "Kline, R. B. (2023). Principles and practice of structural equation modeling (5th ed.). Guilford Press.",
        "DeVellis, R. F., & Thorpe, C. T. (2021). Scale development: Theory and applications (5th ed.). SAGE.",
        "Bollen, K. A. (1989). Structural equations with latent variables. Wiley.",
      ],
    },
  },
  draw: {
    help: [
      "مدل = مجموعه فلش‌هایی که روابط بین متغیرها را نشان می‌دهند.",
      "فعال بودن یک فلش یعنی آن مسیر در مدل برآورد می‌شود؛ غیرفعال‌کردن = صفر فرض‌شدن آن مسیر.",
      "آماریست کوواریانس همهٔ جفت‌های پیش‌بین برون‌زا را آزاد می‌کند و با فلش دوطرفهٔ بنفش نشان می‌دهد؛ کلید نمایش فقط ظاهر دیاگرام را عوض می‌کند، نه برآورد را.",
      "دکمهٔ راهنمای AMOS دقیقاً می‌گوید هر رابطه را بین خود متغیرها یا دایره‌های منبع/خطا چگونه بازسازی کنید.",
      "وقتی همه فلش‌ها فعال‌اند مدل «اشباع» است (CFI=1، RMSEA=0)؛ برای برازش قابل آزمون حداقل یک فلش را غیرفعال کنید.",
    ],
    guide: {
      title: "درسنامه: مسیرهای مستقیم و غیرمستقیم (میانجی‌گری)",
      paragraphs: [
        "در مدل میانجی، اثر متغیر برون‌زا بر درون‌زا از دو کانال عبور می‌کند: اثر مستقیم (X ← Y) و اثر غیرمستقیم (X ← M ← Y). مجموع این دو، «اثر کل» نامیده می‌شود.",
        "وقتی چند میانجی داریم، هر میانجی یک مسیر غیرمستقیم مجزا می‌سازد و «کل اثر غیرمستقیم» مجموع همه آن‌هاست؛ آزمون معناداری هر مسیر با بوت‌استرپ انجام می‌شود.",
        "برای معنادار شدن برازش مدل، معمولاً یک مسیر از مدل حذف (غیرفعال) می‌شود تا درجه آزادی مثبت و شاخص‌های برازش قابل تفسیر شوند.",
      ],
      references: [
        "Preacher, K. J., & Hayes, A. F. (2008). Asymptotic and resampling strategies for assessing and comparing indirect effects in multiple mediator models. Behavior Research Methods, 40(3), 879–891.",
        "MacKinnon, D. P. (2008). Introduction to statistical mediation analysis. Routledge.",
        "Hayes, A. F. (2022). Introduction to mediation, moderation, and conditional process analysis (3rd ed.). Guilford Press.",
      ],
    },
  },
  constraints: {
    help: [
      "قیود تولید داده، شرایطی است که داده تمرینی باید حتماً رعایت کند.",
      "برای هر مسیر می‌توانید معنی‌دار بودن/نبودن، جهت و بازه β (ضریب استاندارد) را تعیین کنید.",
      "جهت هر اثر غیرمستقیم نیز جداگانه قابل تنظیم است: خودکار، مثبت، منفی یا بدون محدودیت؛ این انتخاب واقعاً در تولید و کنترل نهایی اعمال می‌شود.",
      "شاخص‌های برازش (CFI، RMSEA، χ²/df، SRMR) با پیش‌فرض‌های مورد قبول داوری تنظیم شده‌اند.",
      "پیش‌فرض‌های آماری (نرمال بودن، خطی بودن، VIF، دوربین-واتسون) همگی قابل خاموش/روشن‌کردن هستند.",
    ],
    guide: {
      title: "درسنامه: قیود تولید داده و شاخص‌های برازش",
      paragraphs: [
        "داده تمرینی باید «واقع‌گرایانه» باشد: ضرایب استاندارد مسیرها در پژوهش‌های روان‌شناسی معمولاً بین ۰٫۲ تا ۰٫۵ است و ضرایب بالاتر از ۰٫۸۰ غیرمعمول‌اند.",
        "شاخص‌های برازش: CFI و TLI بالای ۰٫۹۰، RMSEA زیر ۰٫۰۸ (و ایده‌آل زیر ۰٫۰۶) و SRMR زیر ۰٫۰۸ برازش قابل قبول مدل محسوب می‌شوند (Hu & Bentler, 1999).",
        "قبل از تفسیر نتایج، پیش‌فرض‌ها بررسی می‌شوند: نرمال بودن تک‌متغیری (|کجی|<3 و |کشیدگی|<10)، نرمال بودن چندمتغیری (مردیای سازگار با AMOS و معیار بزرگ‌نمونه |CR|≤1.96)، هم‌خطی (VIF<5) و استقلال خطاها (دوربین-واتسون بین 1.5 تا 2.5).",
      ],
      references: [
        "Hu, L., & Bentler, P. M. (1999). Cutoff criteria for fit indexes in covariance structure analysis. Structural Equation Modeling, 6(1), 1–55.",
        "Kline, R. B. (2023). Principles and practice of structural equation modeling (5th ed.). Guilford Press.",
        "Tabachnick, B. G., & Fidell, L. S. (2019). Using multivariate statistics (7th ed.). Pearson.",
      ],
    },
  },
  diagnose: {
    help: [
      "مرحله تشخیص جایی است که تصمیم می‌گیرید داده تولید یا تحلیل اجرا شود.",
      "اگر قبلاً تحلیلی اجرا شده، اینجا گزارش می‌شود و می‌توانید دوباره اجرا کنید یا با نتایج قبلی ادامه دهید.",
      "اگر در مراحل قبل تغییری ایجاد شده باشد، هشدار داده می‌شود که تحلیل باید دوباره اجرا شود.",
    ],
  },
  data: {
    help: [
      "جدول داده شامل ستون‌های متغیرها/زیرمقیاس‌ها و ردیف‌های شرکت‌کننده‌هاست.",
      "سلول‌ها قابل ویرایش‌اند؛ مقادیر خالی یعنی داده گمشده.",
      "در حالت واقعی، ستون‌های فایل اکسل با نام متغیرها/زیرمقیاس‌ها مطابقت داده می‌شوند.",
    ],
    guide: {
      title: "درسنامه: آماده‌سازی داده‌ها",
      paragraphs: [
        "داده‌های SEM باید کامل یا با روش مناسب برای داده گمشده مدیریت شوند؛ روش‌های رایج شامل حذف لیستی، حذف زوجی و بیشینه‌سازی انتظار (EM) است (Kline, 2023).",
        "پیش از تحلیل، داده پرت چندمتغیری با فاصله ماهالانوبیس بررسی می‌شود؛ مقادیر با p<0.05 به‌عنوان داده پرت در نظر گرفته می‌شوند.",
        "در جدول داده، هر ستون باید با متغیر/زیرمقیاس متناظر نگاشت شود؛ نگاشت نادرست رایج‌ترین خطای ورود داده است.",
      ],
      references: [
        "Kline, R. B. (2023). Principles and practice of structural equation modeling (5th ed.). Guilford Press.",
        "Tabachnick, B. G., & Fidell, L. S. (2019). Using multivariate statistics (7th ed.). Pearson.",
      ],
    },
  },
  assumptions: {
    help: [
      "پیش‌فرض‌های آماری، شرایطی است که داده باید برای تحلیل SEM داشته باشد.",
      "شش پیش‌فرض: داده گمشده، داده پرت (ماهالانوبیس)، نرمال بودن تک‌متغیری (کجی/کشیدگی)، نرمال بودن چندمتغیری (مردیا)، خطی بودن، عدم هم‌خطی (VIF) و استقلال خطاها (دوربین-واتسون).",
      "در جدول هم‌خطی، هر پیش‌بین یک ردیف مستقل با Tolerance و VIF دارد؛ دوربین–واتسون چون برای کل معادله است، در جدول جداگانهٔ متغیرهای وابسته گزارش می‌شود.",
      "زیر هر پیش‌فرض، شرط برقرار بودن و وضعیت فعلی نوشته شده است.",
    ],
    guide: {
      title: "درسنامه: پیش‌فرض‌های مدل معادلات ساختاری",
      paragraphs: [
        "نرمال بودن تک‌متغیری: بر اساس کلاین (2023)، قدرمطلق کجی کمتر از ۳ و قدرمطلق کشیدگی کمتر از ۱۰ نشانه عدم تخطی است.",
        "نرمال بودن چندمتغیری با مردیای سازگار با AMOS بررسی می‌شود: فاصله‌ها در n/(n−1) مقیاس می‌شوند و مرکز نمونهٔ محدود p(p+2)(n−1)/(n+1) به کار می‌رود؛ در تفسیر بزرگ‌نمونه، C.R. مانند z است و |CR|≤1.96 قابل قبول محسوب می‌شود.",
        "عدم هم‌خطی چندگانه با VIF (کمتر از ۵ یا حتی ۲ در معیار سخت‌گیرانه‌تر) و استقلال خطاها با آماره دوربین-واتسون (بین ۱٫۵ تا ۲٫۵) بررسی می‌شود.",
      ],
      references: [
        "Kline, R. B. (2023). Principles and practice of structural equation modeling (5th ed.). Guilford Press.",
        "Blunch, N. J. (2012). Introduction to structural equation modeling using IBM SPSS Statistics and AMOS (2nd ed.). SAGE.",
        "Tabachnick, B. G., & Fidell, L. S. (2019). Using multivariate statistics (7th ed.). Pearson.",
      ],
    },
  },
  descriptive: {
    help: [
      "یافته‌های توصیفی، خلاصه آماری متغیرها را نشان می‌دهد: تعداد، میانگین، انحراف معیار، کمینه، بیشینه، کجی و کشیدگی.",
      "نمره کل هر متغیر در یک ردیف پررنگ و زیرمقیاس‌هایش به‌صورت درختی زیر آن می‌آیند.",
    ],
    guide: {
      title: "درسنامه: آمار توصیفی در گزارش پژوهش",
      paragraphs: [
        "در گزارش‌های پژوهشی، برای هر متغیر: میانگین، انحراف معیار و در صورت لزوم کمینه/بیشینه گزارش می‌شود. کجی و کشیدگی نیز برای مستندسازی نرمال بودن توزیع ارائه می‌شود.",
        "در مدل‌های دارای زیرمقیاس، بهتر است آمار توصیفی هم برای نمره کل و هم برای هر زیرمقیاس جداگانه گزارش شود (American Psychological Association, 2020).",
      ],
      references: [
        "American Psychological Association. (2020). Publication manual of the American Psychological Association (7th ed.).",
        "Field, A. (2018). Discovering statistics using IBM SPSS Statistics (5th ed.). SAGE.",
      ],
    },
  },
  diagram: {
    help: [
      "دیاگرام مدل، ساختار روابط بین متغیرها را نشان می‌دهد: بیضی = متغیر پنهان (مکنون)، مستطیل = متغیر مشاهده‌شده.",
      "روی فلش‌های یک‌طرفه ضریب β استاندارد و زیر متغیرهای درون‌زا مقدار R² نوشته می‌شود.",
      "فلش دوطرفهٔ بنفش رابطهٔ آزاد بین هر دو پیش‌بین برون‌زا و برچسب r مقدار استانداردشدهٔ برآورد را نشان می‌دهد.",
      "رنگ‌ها: آبی = برون‌زا، نارنجی = میانجی، سبز = درون‌زا.",
    ],
    guide: {
      title: "درسنامه: رسم و تفسیر دیاگرام مسیر",
      paragraphs: [
        "در دیاگرام مسیر، متغیرهای برون‌زا معمولاً در سمت راست (یا چپ در رسم فارسی)، میانجی‌ها در وسط و متغیرهای درون‌زا در سمت مقابل قرار می‌گیرند؛ فلش‌ها جهت علی مفروض را نشان می‌دهند.",
        "روی هر فلش یک‌طرفه، ضریب مسیر استاندارد (β) نوشته می‌شود و کنار هر متغیر درون‌زا، R² (نسبت واریانس تبیین‌شده) درج می‌گردد.",
        "بین هر دو پیش‌بین برون‌زا یک کوواریانس آزاد برآورد می‌شود. در AMOS باید آن را با فلش دوطرفه بین خود متغیرها یا، اگر متغیر مشاهده‌شده منبع ورودی دارد، بین دایره‌های منبع/خطای متناظر رسم کرد.",
        "متغیر پنهان با بیضی و متغیر مشاهده‌شده با مستطیل رسم می‌شود (Kline, 2023).",
      ],
      references: [
        "Kline, R. B. (2023). Principles and practice of structural equation modeling (5th ed.). Guilford Press.",
      ],
    },
  },
  inferential: {
    help: [
      "یافته‌های استنباطی، نتایج آزمون فرضیه‌هاست: شاخص‌های برازش، ضرایب مسیر، اثرات مستقیم/غیرمستقیم/کل و R².",
      "اثر غیرمستقیم با بوت‌استرپ (۲۰۰۰ نمونه پیش‌فرض، اجرای موازی) و فاصله اطمینان ۹۵٪ ارزیابی می‌شود.",
      "کلید پاسخ فقط برای استاد است: ضرایب هدف در برابر ضرایب واقعی.",
    ],
    guide: {
      title: "درسنامه: تفسیر یافته‌های استنباطی",
      paragraphs: [
        "ابتدا برازش کلی مدل بررسی می‌شود: CFI≥0.90، RMSEA≤0.08 و χ²/df≤3 نشانه برازش قابل قبول است (Hu & Bentler, 1999).",
        "مسیرها با p<0.05 معنادارند. اثر غیرمستقیم با بوت‌استرپ و فاصله اطمینان ۹۵٪ ارزیابی می‌شود؛ اگر بازه صفر را شامل نشود، میانجی‌گری معنادار است (Preacher & Hayes, 2008).",
        "R² هر متغیر درون‌زا نشان‌دهنده درصد واریانس تبیین‌شده است؛ در روان‌شناسی R² بالای ۰٫۲۶ اثر بزرگ، ۰٫۱۳ متوسط و ۰٫۰۲ کوچک تلقی می‌شود (Cohen, 1988).",
      ],
      references: [
        "Hu, L., & Bentler, P. M. (1999). Cutoff criteria for fit indexes in covariance structure analysis. Structural Equation Modeling, 6(1), 1–55.",
        "Preacher, K. J., & Hayes, A. F. (2008). Asymptotic and resampling strategies for assessing and comparing indirect effects in multiple mediator models. Behavior Research Methods, 40(3), 879–891.",
        "Cohen, J. (1988). Statistical power analysis for the behavioral sciences (2nd ed.). Erlbaum.",
      ],
    },
  },
  alpha: {
    help: [
      "آلفای کرونباخ، پایایی گویه‌های هر زیرمقیاس و، فقط در صورت جمع‌پذیر بودن پرسشنامه، نمرهٔ کل را اندازه می‌گیرد.",
      "نام همهٔ زیرمقیاس‌ها و داشتن/نداشتن نمرهٔ کل از «مشخصات متغیرها» خوانده می‌شود. تعداد کل گویه و عضویت هر زیرمقیاس را فشرده، مانند 1-5,7-9، وارد کنید.",
      "هر گویه باید دقیقاً یک‌بار تخصیص یابد. شمارهٔ جاافتاده، تکراری، خارج از بازه یا عبارت نامعتبر با شمارهٔ دقیق گزارش می‌شود و ادامه را می‌بندد.",
      "دامنهٔ مشترک برای همهٔ گویه‌هاست؛ استثناها را مانند 3=0-4; 7-9=1-7 بنویسید.",
      "تولید گویه فقط پس از تولید/ایمپورت دادهٔ SEM انجام می‌شود و جمع گویه‌های هر پاسخ‌دهنده دقیقاً با نمرهٔ زیرمقیاس و نمرهٔ کل مجاز برابر می‌ماند.",
      "ورود اکسلِ داده‌های واقعی آلفا در تب مستقل خودش حفظ شده است. آلفا ≥ 0.70 عموماً قابل قبول است.",
    ],
    guide: {
      title: "درسنامه: آلفای کرونباخ و پایایی",
      paragraphs: [
        "آلفای کرونباخ (Cronbach, 1951) هماهنگی درونی گویه‌های یک مقیاس را اندازه می‌گیرد. آلفای ۰٫۷۰ به بالا برای اهداف پژوهشی قابل قبول است.",
        "اگر پرسشنامه زیرمقیاس دارد، آلفای هر زیرمقیاس باید از گویه‌های همان زیرمقیاس محاسبه شود. آلفای نمرهٔ کل فقط برای پرسشنامه‌ای گزارش می‌شود که در بخش متغیرها «جمع‌پذیر» معرفی شده باشد؛ برای پرسشنامه‌ای مانند ERQ با زیرمقیاس‌های مستقل، ردیف نمرهٔ کل ساخته نمی‌شود.",
        "در تولید آموزشی، نمرهٔ کل/زیرمقیاسِ هر فرد از دادهٔ SEM موجود گرفته می‌شود و الگوریتم فقط آن را بین گویه‌های مجاز توزیع می‌کند؛ بنابراین جمع دقیق حفظ می‌شود. اگر دامنه‌ها، جمع هدف و بازهٔ آلفا هم‌زمان شدنی نباشند، پیام خطا داده می‌شود و موفقیت ساختگی گزارش نمی‌شود.",
        "قرارداد نام ستون‌های قالب اکسل «متغیر — زیرمقیاس — گویهٔ N» است. در تب داده‌های واقعی، n برابر تعداد ردیف‌های واردشده است.",
        "در تحلیل گویه‌ها، «همبستگی گویه-کل تصحیح‌شده» (≥0.30) و «آلفا اگر گویه حذف شود» بررسی می‌شود؛ اگر حذف یک گویه آلفا را افزایش دهد، آن گویه مشکل‌دار است.",
        "آلفای استانداردشده بر اساس همبستگی‌های استاندارد محاسبه می‌شود و وقتی دامنه گویه‌ها متفاوت است مناسب‌تر است.",
      ],
      references: [
        "Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. Psychometrika, 16(3), 297–334.",
        "DeVellis, R. F., & Thorpe, C. T. (2021). Scale development: Theory and applications (5th ed.). SAGE.",
        "Field, A. (2018). Discovering statistics using IBM SPSS Statistics (5th ed.). SAGE.",
      ],
    },
  },
  report: {
    help: [
      "پیش‌نمایش سایت با Markdown امن به تیترها، جدول‌های اسکرول‌پذیر و بخش‌های خوانا تبدیل می‌شود؛ کد HTML خام اجرا نمی‌شود.",
      "می‌توانید منبع Markdown را کپی یا با پسوند md دانلود کنید؛ خروجی‌های DOCX، TXT و Excel نیز همچنان در دسترس‌اند.",
      "گزارش، کوواریانس‌های آزاد برون‌زا و معادل بازسازی آن‌ها در AMOS را هم افشا می‌کند.",
    ],
    guide: {
      title: "درسنامه: نگارش گزارش SEM",
      paragraphs: [
        "در گزارش مدل معادلات ساختاری باید: (۱) مشخصات نمونه و روش جمع‌آوری داده، (۲) نتایج بررسی پیش‌فرض‌ها، (۳) آمار توصیفی، (۴) شاخص‌های برازش، (۵) ضرایب مسیر با خطای استاندارد و معناداری، (۶) اثرات مستقیم/غیرمستقیم/کل با فاصله اطمینان بوت‌استرپ، و (۷) R² متغیرهای درون‌زا گزارش شود.",
        "طبق APA 7، برای هر آزمون آماری: آماره، درجه آزادی، مقدار p و اندازه اثر درج می‌شود؛ برای مثال: β=0.38, SE=0.05, p<0.001.",
        "دیاگرام مدل با ضرایب استاندارد معمولاً در بخش یافته‌ها ارائه می‌شود.",
      ],
      references: [
        "American Psychological Association. (2020). Publication manual of the American Psychological Association (7th ed.).",
        "Kline, R. B. (2023). Principles and practice of structural equation modeling (5th ed.). Guilford Press.",
      ],
    },
  },
  save: {
    help: [
      "پروژه به‌صورت خودکار در مرورگر ذخیره می‌شود؛ این مرحله برای بکاپ فایل‌ی و خروجی‌های نهایی است.",
      "بکاپ کامل = همه پروژه‌ها؛ بکاپ تکی = فقط پروژه فعلی.",
      "خروجی‌های نهایی شامل Excel، Markdown، DOCX و TXT هستند؛ Markdown را می‌توانید مستقیم در ابزارهای سازگار باز کنید.",
    ],
  },
};

export default function HelpButtons({ section }: { section: string }) {
  const [open, setOpen] = useState<"help" | "guide" | null>(null);
  const content = HELP_CONTENTS[section];
  if (!content) return null;
  const hasGuide = !!content.guide && !SOFTWARE_ONLY.has(section);

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          title="راهنما"
          onClick={() => setOpen("help")}
          className="flex h-8 items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 text-[11px] font-extrabold text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          راهنما
        </button>
        {hasGuide && (
          <button
            type="button"
            title="آموزش (درسنامه)"
            onClick={() => setOpen("guide")}
            className="flex h-8 items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2.5 text-[11px] font-extrabold text-violet-700 transition hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300"
          >
            <BookOpen className="h-3.5 w-3.5" />
            آموزش
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`w-full overflow-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-800 ${
              open === "guide" ? "max-h-[92vh] max-w-3xl" : "max-h-[85vh] max-w-lg"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">
                {open === "help" ? "راهنمای بخش" : content.guide?.title ?? "آموزش بخش"}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-300 bg-stone-50 text-stone-500 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-slate-900 dark:text-stone-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {open === "help" ? (
              <div className="mt-4 space-y-2.5">
                {content.help.map((line, i) => (
                  <p key={i} className="rounded-xl bg-stone-50 p-3 text-[13px] leading-6 text-stone-700 dark:bg-slate-900 dark:text-stone-300">
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {content.guide?.paragraphs.map((p, i) => (
                  <p key={i} className="rounded-xl bg-stone-50 p-3 text-[13px] leading-7 text-stone-700 dark:bg-slate-900 dark:text-stone-300">
                    {p}
                  </p>
                ))}
                <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
                  <p className="mb-2 text-[12px] font-black text-indigo-700 dark:text-indigo-300">منابع (APA 7)</p>
                  {content.guide?.references.map((r, i) => (
                    <p key={i} dir="ltr" className="mb-1.5 text-start text-[12px] leading-5 text-stone-600 dark:text-stone-400">
                      {r}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-extrabold text-white shadow transition hover:bg-indigo-500"
              >
                فهمیدم
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
