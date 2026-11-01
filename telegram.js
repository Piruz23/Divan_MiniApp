/* ==========================================================
   دیوان — لایه‌ی اتصال به تلگرام

   همه‌ی کار با window.Telegram.WebApp این‌جا جمع شده و بقیه‌ی برنامه
   فقط با شیء ساده‌ی window.DivanTelegram حرف می‌زند. فایده:
   - اگر صفحه بیرون از تلگرام (مرورگر معمولی) باز شود، همه‌ی توابع
     بی‌صدا «هیچ‌کاری نمی‌کنند» و برنامه خطا نمی‌دهد.
   - هر قابلیت تلگرام از نسخه‌ی مشخصی به بعد وجود دارد؛ نسخه را این‌جا
     چک می‌کنیم تا در تلگرام‌های قدیمی هشدار یا خطا نگیریم.
   ========================================================== */

(function () {
  'use strict';

  var BRAND = '#4E0612';   // همان --burgundy-deep در style.css
  var BAR   = '#33040C';   // همان --bar (نوار تب پایین)

  var tg = window.Telegram && window.Telegram.WebApp;

  var api = {
    inTelegram: false,
    user: null,                         // {id, firstName, lastName, username, photoUrl} یا null
    haptic: function () {},             // لرزش سبک هنگام انتخاب
    onBack: function () {},             // ثبت تابعی که با دکمه‌ی بازگشت تلگرام صدا زده شود
    setBackVisible: function () {}      // نمایش یا پنهان‌کردن دکمه‌ی بازگشت تلگرام
  };
  window.DivanTelegram = api;

  if (!tg) return;

  function atLeast(version) {
    try {
      return typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast(version);
    } catch (e) {
      return false;
    }
  }

  // initData وقتی خالی است که صفحه بیرون از تلگرام باز شده باشد
  api.inTelegram = !!tg.initData;

  try {
    tg.ready();    // به تلگرام می‌گوییم صفحه آماده است
    tg.expand();   // پنجره تا بالاترین ارتفاع باز شود
  } catch (e) { /* بی‌اهمیت */ }

  // رنگ‌ها: تا بین نوار تلگرام و صفحه خط سفید دیده نشود
  try {
    if (atLeast('6.1'))  tg.setBackgroundColor(BRAND);
    if (atLeast('6.9'))  tg.setHeaderColor(BRAND);
    if (atLeast('7.10')) tg.setBottomBarColor(BAR);
  } catch (e) { /* رنگ‌دهی تزئینی است */ }

  // اطلاعات کاربر برای «نمایش» در پنل. نکته‌ی امنیتی: initDataUnsafe را
  // نمی‌شود به‌عنوان هویت مطمئن در سرور استفاده کرد (امضایش چک نشده)؛
  // برای ذخیره‌ی داده‌ی واقعی باید initData خام به Worker برود و آن‌جا تأیید شود.
  var u = tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (u && u.id) {
    api.user = {
      id: u.id,
      firstName: u.first_name || '',
      lastName: u.last_name || '',
      username: u.username || '',
      photoUrl: typeof u.photo_url === 'string' && /^https:\/\//.test(u.photo_url) ? u.photo_url : ''
    };
  }

  if (atLeast('6.1') && tg.HapticFeedback) {
    api.haptic = function () {
      try { tg.HapticFeedback.selectionChanged(); } catch (e) { /* بی‌اهمیت */ }
    };
  }

  if (atLeast('6.1') && tg.BackButton) {
    var backCallback = null;
    // یک بار ثبت می‌کنیم و هر بار به callback فعلی هدایت می‌کنیم؛
    // این‌طور هیچ‌وقت چند شنونده‌ی تکراری روی هم نمی‌ماند.
    tg.BackButton.onClick(function () { if (backCallback) backCallback(); });
    api.onBack = function (cb) { backCallback = cb; };
    api.setBackVisible = function (visible) {
      try {
        if (visible) tg.BackButton.show(); else tg.BackButton.hide();
      } catch (e) { /* بی‌اهمیت */ }
    };
  }
})();
