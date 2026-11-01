/* ==========================================================
   دیوان — منطق ماشین‌حساب مالی (بدون هیچ وابستگی به صفحه)

   چرا جدا از app.js؟
   ۱) همه‌ی ریاضی و تبدیل اعداد این‌جاست و به DOM دست نمی‌زند؛
      پس می‌شود آن را بدون مرورگر (با Node) تست کرد.
   ۲) وقتی بعداً همین محاسبه‌ها را داخل ربات یا Worker خواستی،
      همین فایل بدون تغییر قابل استفاده است.

   قرارداد خطا: هر تابع محاسبه یا نتیجه برمی‌گرداند یا
   { error: 'کد' }. متن فارسی خطا در app.js است، نه این‌جا.
   ========================================================== */

(function (root, factory) {
  // روش «UMD ساده»: در Node با module.exports، در مرورگر با window.DivanCalc
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DivanCalc = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // سقف‌ها. دلیل سقف نتیجه: عددهای جاوااسکریپت بالای حدود ۹ در ۱۰ به توان ۱۵
  // دیگر دقیق نیستند؛ بهتر است به‌جای عدد غلط، پیام روشن بدهیم.
  var LIMIT = 1e15;
  var MAX_RATE = 1000;   // درصد
  var MAX_YEARS = 100;   // سال

  /* ---------- ۱) خواندن عدد از متن کاربر ----------
     کاربر ایرانی ممکن است «۱۰٬۰۰۰٬۰۰۰» یا «10,000,000» یا «۳/۵» یا «۳٫۵» بنویسد.
     به همین دلیل فیلد ورودی از نوع text است نه number
     (input type=number ارقام فارسی را قبول نمی‌کند).
     این تابع همه را به یک عدد استاندارد تبدیل می‌کند. */

  function normalizeDigits(text) {
    return text
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); }) // ۰-۹ فارسی
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); }); // ٠-٩ عربی
  }

  function parseNumber(raw) {
    var s = normalizeDigits(raw == null ? '' : String(raw)).trim();
    if (s === '') return { status: 'empty' };

    s = s
      .replace(/[\s,٬،‌‎‏]/g, '') // جداکننده‌ی هزارگان و نویسه‌های نامرئی
      .replace(/[%٪]/g, '')                           // علامت درصد
      .replace(/[٫\/]/g, '.')                         // ممیز فارسی و اسلش، مثل «۳/۵»
      .replace(/[−‒–]/g, '-');              // انواع علامت منفی

    // فقط عدد ساده؛ «1e5» یا «۱۲abc» عمداً نامعتبر است
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return { status: 'invalid' };

    var value = Number(s);
    if (!isFinite(value)) return { status: 'invalid' };
    return { status: 'ok', value: value };
  }

  /* ---------- ۲) نمایش عدد با رقم و جداکننده‌ی فارسی ---------- */

  function formatNumber(n, maxFrac) {
    // مبلغ‌های بزرگ بدون اعشار، عددهای کوچک تا دو رقم اعشار
    if (maxFrac == null) maxFrac = Math.abs(n) < 100 ? 2 : 0;
    try {
      return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: maxFrac }).format(n);
    } catch (e) {
      var p = Math.pow(10, maxFrac);
      return String(Math.round(n * p) / p);
    }
  }

  /* ---------- ۳) اعتبارسنجی ورودی‌ها ---------- */

  function checkAmount(v) {
    if (v < 0) return { error: 'negative' };
    if (v > LIMIT) return { error: 'too_large' };
    return null;
  }
  function checkRate(r) {
    return (r < 0 || r > MAX_RATE) ? { error: 'rate_range' } : null;
  }
  function checkYears(y) {
    return (y < 0 || y > MAX_YEARS) ? { error: 'years_range' } : null;
  }

  /* ---------- ۴) اثر تورم روی پول ----------
     فرض: نرخ تورم هر سال ثابت است.
     ضریب قیمت‌ها بعد از y سال:  (1 + r) ^ y
     - برای خرید معادل امروز لازم است:  مبلغ × ضریب
     - قدرت خرید مبلغ امروز (به پول امروز):  مبلغ ÷ ضریب */

  function inflationEffect(amount, ratePct, years) {
    var bad = checkAmount(amount) || checkRate(ratePct) || checkYears(years);
    if (bad) return bad;

    var factor = Math.pow(1 + ratePct / 100, years);
    var needed = amount * factor;
    if (!isFinite(factor) || !isFinite(needed) || needed > LIMIT) return { error: 'too_large' };

    return { factor: factor, needed: needed, worth: amount / factor };
  }

  /* ---------- ۵) سود مرکب ----------
     A = P × (1 + r/m) ^ (m × t)   که m تعداد دفعات محاسبه‌ی سود در سال است.
     «نرخ مؤثر سالانه» یعنی سودی که واقعاً در یک سال به دست می‌آید:
     (1 + r/m) ^ m − 1 */

  function compoundInterest(principal, ratePct, years, perYear) {
    var bad = checkAmount(principal) || checkRate(ratePct) || checkYears(years);
    if (bad) return bad;
    if (!(perYear >= 1 && perYear <= 365) || Math.floor(perYear) !== perYear) {
      return { error: 'bad_frequency' };
    }

    var step = 1 + ratePct / 100 / perYear;
    var growth = Math.pow(step, perYear * years);
    var finalAmount = principal * growth;
    // اگر سرمایه صفر باشد و growth بی‌نهایت، ضرب آن‌ها NaN می‌شود؛ پس growth را هم چک می‌کنیم
    if (!isFinite(growth) || !isFinite(finalAmount) || finalAmount > LIMIT) return { error: 'too_large' };

    return {
      final: finalAmount,
      profit: finalAmount - principal,
      multiple: principal > 0 ? growth : null,
      effective: (Math.pow(step, perYear) - 1) * 100
    };
  }

  /* ---------- ۶) تغییر درصدی ----------
     درصد تغییر = (جدید − قدیم) ÷ قدیم × ۱۰۰
     «درصد بازگشت»: برای برگشتن به عدد قبلی چند درصد تغییر در جهت
     مخالف لازم است. مثال: ۵۰٪ افزایش را با ۵۰٪ کاهش جبران نمی‌کنی،
     ۳۳٫۳٪ کاهش کافی است. این نکته جلوی خیلی از توهم‌ها را می‌گیرد. */

  function percentChange(oldValue, newValue) {
    var bad = checkAmount(oldValue) || checkAmount(newValue);
    if (bad) return bad;
    if (oldValue === 0) return { error: 'zero_base' };

    var diff = newValue - oldValue;
    return {
      diff: diff,
      pct: diff / oldValue * 100,
      back: newValue > 0 ? (oldValue - newValue) / newValue * 100 : null
    };
  }

  return {
    parseNumber: parseNumber,
    formatNumber: formatNumber,
    inflationEffect: inflationEffect,
    compoundInterest: compoundInterest,
    percentChange: percentChange,
    LIMITS: { value: LIMIT, rate: MAX_RATE, years: MAX_YEARS }
  };
});
