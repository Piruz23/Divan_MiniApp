/* ==========================================================
   دیوان — رفتار برنامه: تب‌ها، کارت‌های ابزار، ماشین‌حساب، پنل من

   سه لایه، هرکدام یک فایل:
   - calc.js      ریاضی و تبدیل عدد (بدون صفحه)
   - telegram.js  حرف‌زدن با تلگرام (بدون صفحه)
   - app.js       این فایل: فقط صفحه و رویدادها
   ========================================================== */

(function () {
  'use strict';

  var Calc = window.DivanCalc;
  var TG = window.DivanTelegram;
  var fmt = Calc.formatNumber;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ساخت عنصر با textContent (نه innerHTML)؛ هر متنی فقط «متن» می‌ماند و کد اجرا نمی‌کند
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // یک منبع حقیقت برای وضعیت صفحه
  var state = {
    tab: 'home',
    calcOpen: false,
    mode: 'fv',
    saved: {}        // مقدارهای تایپ‌شده‌ی هر حالت، تا با عوض‌کردن حالت پاک نشوند
  };

  /* ---------- پیام‌های خطا ---------- */
  var ERRORS = {
    negative: 'این ماشین‌حساب فقط مقدارهای صفر و مثبت را قبول می‌کند.',
    rate_range: 'نرخ باید بین ۰ تا ۱۰۰۰ درصد باشد.',
    years_range: 'مدت باید بین ۰ تا ۱۰۰ سال باشد.',
    zero_base: 'مقدار قبلی صفر است؛ درصد تغییر از صفر تعریف نمی‌شود.',
    too_large: 'نتیجه آن‌قدر بزرگ می‌شود که دقیق نشان داده نمی‌شود.',
    bad_frequency: 'تعداد دفعات محاسبه‌ی سود معتبر نیست.'
  };

  // درصد با رقم فارسی؛ اگر خیلی کوچک بود، «۰٪» نشان نمی‌دهیم چون گمراه‌کننده است
  function fmtPct(x) {
    var a = Math.abs(x);
    if (a !== 0 && a < 0.01) return 'کمتر از ۰٫۰۱٪';
    return fmt(a, 2) + '٪';
  }

  /* ---------- تعریف سه حالت ماشین‌حساب ----------
     هر حالت: فیلدها + تابع compute که ورودی‌های عددی را می‌گیرد و
     «مدل نتیجه» برمی‌گرداند. فرم و لوح نتیجه از روی همین تعریف ساخته
     می‌شوند، پس افزودن حالت چهارم فقط یک بلوک جدید است. */
  var MODES = {
    fv: {
      desc: 'پول امروز بعد از چند سال، با نرخ تورم، چقدر قدرت خرید دارد؟',
      fields: [
        { id: 'amount', label: 'مبلغ امروز', placeholder: 'مثلاً ۱۰٬۰۰۰٬۰۰۰', hint: 'واحد پول با خودته؛ تومان یا ریال.', preview: true },
        { id: 'rate', label: 'نرخ تورم سالانه (درصد)', placeholder: 'مثلاً ۴۰', hint: 'بین ۰ تا ۱۰۰۰ درصد.' },
        { id: 'years', label: 'مدت (سال)', placeholder: 'مثلاً ۵', hint: 'بین ۰ تا ۱۰۰ سال.' }
      ],
      compute: function (v) {
        var r = Calc.inflationEffect(v.amount, v.rate, v.years);
        if (r.error) return r;
        var years = fmt(v.years);
        return {
          headline: { label: 'مبلغ لازم بعد از ' + years + ' سال برای خریدن معادل امروز', value: fmt(r.needed) },
          rows: [
            { label: 'قدرت خرید ' + fmt(v.amount) + ' بعد از ' + years + ' سال', value: 'معادل ' + fmt(r.worth) + ' امروز' },
            { label: 'افزایش قیمت‌ها در این مدت', value: fmt(r.factor, 2) + ' برابر' }
          ],
          note: 'فرض: نرخ تورم در همه‌ی سال‌ها ثابت است.'
        };
      }
    },

    compound: {
      desc: 'پولی که با سود مرکب نگه داری، بعد از چند سال چقدر می‌شود؟',
      fields: [
        { id: 'principal', label: 'سرمایه‌ی اولیه', placeholder: 'مثلاً ۵٬۰۰۰٬۰۰۰', hint: 'واحد پول با خودته؛ تومان یا ریال.', preview: true },
        { id: 'rate', label: 'سود سالانه (درصد)', placeholder: 'مثلاً ۲۰', hint: 'بین ۰ تا ۱۰۰۰ درصد.' },
        { id: 'years', label: 'مدت (سال)', placeholder: 'مثلاً ۳', hint: 'بین ۰ تا ۱۰۰ سال.' },
        {
          id: 'freq', kind: 'select', label: 'دفعات محاسبه‌ی سود در سال', value: '1',
          options: [['1', 'سالانه'], ['4', 'فصلی'], ['12', 'ماهانه'], ['365', 'روزانه']],
          hint: 'هرچه بیشتر، سود مؤثر کمی بالاتر می‌شود.'
        }
      ],
      compute: function (v) {
        var r = Calc.compoundInterest(v.principal, v.rate, v.years, v.freq);
        if (r.error) return r;
        var rows = [{ label: 'سود کل', value: fmt(r.profit) }];
        if (r.multiple !== null) rows.push({ label: 'چند برابر شدن', value: fmt(r.multiple, 2) + ' برابر' });
        rows.push({ label: 'نرخ مؤثر سالانه', value: fmtPct(r.effective) });
        return {
          headline: { label: 'مبلغ نهایی بعد از ' + fmt(v.years) + ' سال', value: fmt(r.final) },
          rows: rows,
          note: 'فرض: نرخ ثابت است و پول اضافه‌ای واریز یا برداشت نمی‌شود. مالیات و کارمزد حساب نشده.'
        };
      }
    },

    change: {
      desc: 'یک عدد به عدد دیگر رفته؛ چند درصد تغییر کرده؟',
      fields: [
        { id: 'oldValue', label: 'مقدار قبلی', placeholder: 'مثلاً ۱۰۰', hint: 'عدد صفر یا مثبت.', preview: true },
        { id: 'newValue', label: 'مقدار جدید', placeholder: 'مثلاً ۱۵۰', hint: 'عدد صفر یا مثبت.', preview: true }
      ],
      compute: function (v) {
        var r = Calc.percentChange(v.oldValue, v.newValue);
        if (r.error) return r;

        if (r.diff === 0) {
          return { headline: { label: 'تغییر', value: 'بدون تغییر' }, rows: [], note: '' };
        }
        var up = r.diff > 0;
        var rows = [{ label: 'اختلاف', value: fmt(Math.abs(r.diff)) + (up ? ' افزایش' : ' کاهش') }];
        if (r.back !== null) {
          // برای برگشت به عدد قبلی باید در جهت مخالف چند درصد تغییر کرد
          rows.push({
            label: 'برای برگشت به مقدار قبلی',
            value: fmtPct(r.back) + (r.back < 0 ? ' کاهش لازم است' : ' افزایش لازم است')
          });
        }
        return {
          headline: { label: 'تغییر', value: fmtPct(r.pct) + (up ? ' افزایش' : ' کاهش') },
          rows: rows,
          note: ''
        };
      }
    }
  };

  /* ---------- عناصر ثابت صفحه ---------- */
  var views = $('#views');
  var toolsView = $('#tools-view');
  var calcView = $('#calc-view');
  var form = $('#calc-form');
  var resultBox = $('#calc-result');
  var toastEl = $('#toast');
  var toastTimer = null;

  /* ---------- پیام کوتاه ---------- */
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2200);
  }

  /* ---------- تب‌ها ---------- */
  function syncBack() {
    // دکمه‌ی بازگشت تلگرام فقط وقتی لازم است که داخل ماشین‌حساب باشیم
    TG.setBackVisible(state.tab === 'tools' && state.calcOpen);
  }

  function showTab(name) {
    state.tab = name;
    $$('.panel').forEach(function (p) { p.hidden = (p.id !== 'panel-' + name); });
    $$('.nav [data-tab]').forEach(function (b) {
      if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    views.scrollTop = 0;
    syncBack();
  }

  /* ---------- باز و بسته‌شدن ماشین‌حساب ---------- */
  function openCalculator() {
    state.calcOpen = true;
    toolsView.hidden = true;
    calcView.hidden = false;
    views.scrollTop = 0;
    syncBack();
  }

  function closeCalculator() {
    state.calcOpen = false;
    calcView.hidden = true;
    toolsView.hidden = false;
    views.scrollTop = 0;
    syncBack();
    $('#open-calc').focus({ preventScroll: true });
  }

  /* ---------- ساخت فرم هر حالت ---------- */
  function setMode(mode) {
    state.mode = mode;
    $$('#calc-modes [data-mode]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    $('#mode-desc').textContent = MODES[mode].desc;
    renderForm();
    recalc();
  }

  function renderForm() {
    var mode = MODES[state.mode];
    var saved = state.saved[state.mode] || {};
    form.textContent = '';

    mode.fields.forEach(function (f) {
      var id = 'f-' + f.id;
      var wrap = el('div', 'field');
      var label = el('label', null, f.label);
      label.htmlFor = id;

      var control;
      if (f.kind === 'select') {
        control = el('select');
        f.options.forEach(function (o) {
          var opt = el('option', null, o[1]);
          opt.value = o[0];
          control.appendChild(opt);
        });
        control.value = saved[f.id] != null ? saved[f.id] : f.value;
      } else {
        control = el('input');
        control.type = 'text';             // نه number: number ارقام فارسی را قبول نمی‌کند
        control.inputMode = 'decimal';     // کیبورد عددی گوشی
        control.placeholder = f.placeholder || '';
        control.value = saved[f.id] || '';
        control.setAttribute('autocomplete', 'off');
        control.setAttribute('autocorrect', 'off');
        control.setAttribute('autocapitalize', 'off');
        control.spellcheck = false;
      }
      control.id = id;
      control.name = f.id;

      var note = el('p', 'field__note', f.hint || '');
      note.id = id + '-note';
      control.setAttribute('aria-describedby', note.id);

      wrap.appendChild(label);
      wrap.appendChild(control);
      wrap.appendChild(note);
      form.appendChild(wrap);
    });
  }

  /* ---------- نتیجه ---------- */
  function showMessage(text, isError) {
    resultBox.textContent = '';
    resultBox.appendChild(el('p', 'result-empty' + (isError ? ' result-empty--error' : ''), text));
  }

  function renderResult(model) {
    resultBox.textContent = '';
    var plaque = el('section', 'result');
    plaque.appendChild(el('p', 'result__label', model.headline.label));
    plaque.appendChild(el('p', 'result__value', model.headline.value));

    if (model.rows.length) {
      var dl = el('dl', 'result__rows');
      model.rows.forEach(function (r) {
        var row = el('div', 'result__row');
        row.appendChild(el('dt', null, r.label));
        row.appendChild(el('dd', null, r.value));
        dl.appendChild(row);
      });
      plaque.appendChild(dl);
    }
    if (model.note) plaque.appendChild(el('p', 'result__note', model.note));
    resultBox.appendChild(plaque);
  }

  // با هر تغییر ورودی صدا زده می‌شود: می‌خواند، اعتبار می‌سنجد، نتیجه می‌سازد
  function recalc() {
    var mode = MODES[state.mode];
    var values = {};
    var saved = {};
    var anyEmpty = false;
    var anyInvalid = false;

    mode.fields.forEach(function (f) {
      var control = form.elements[f.id];
      saved[f.id] = control.value;

      if (f.kind === 'select') {
        values[f.id] = Number(control.value);
        return;
      }

      var field = control.closest('.field');
      var note = $('.field__note', field);
      var parsed = Calc.parseNumber(control.value);

      field.classList.toggle('field--error', parsed.status === 'invalid');
      if (parsed.status === 'invalid') {
        note.textContent = 'فقط عدد وارد کن؛ مثلاً ۱۲۵۰۰۰ یا ۳٫۵';
        anyInvalid = true;
      } else if (parsed.status === 'empty') {
        note.textContent = f.hint || '';
        anyEmpty = true;
      } else {
        // پیش‌نمایش با جداکننده‌ی هزارگان؛ خطای تعداد صفرها همین‌جا دیده می‌شود
        note.textContent = f.preview ? '= ' + fmt(parsed.value) : (f.hint || '');
        values[f.id] = parsed.value;
      }
    });

    state.saved[state.mode] = saved;

    if (anyInvalid) return showMessage('عددهای نامعتبر را اصلاح کن تا نتیجه را ببینی.', false);
    if (anyEmpty) return showMessage('اعداد را وارد کن تا نتیجه را ببینی.', false);

    var model = mode.compute(values);
    if (model.error) return showMessage(ERRORS[model.error] || 'محاسبه ممکن نیست.', true);
    renderResult(model);
  }

  /* ---------- پنل من ---------- */
  function renderProfile() {
    var user = TG.user;
    var name = $('#profile-name');
    var sub = $('#profile-sub');
    var initial = $('#avatar-initial');
    var img = $('#avatar-img');

    if (!user) {
      name.textContent = 'مهمان';
      sub.textContent = 'از داخل تلگرام باز کن تا نام و عکس تو این‌جا دیده شود.';
      initial.textContent = '؟';
      return;
    }

    var full = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'کاربر دیوان';
    name.textContent = full;
    sub.textContent = user.username ? '@' + user.username : '';
    initial.textContent = Array.from(full)[0] || '؟';

    if (user.photoUrl) {
      // اگر عکس نیامد (مثلاً شبکه مسدود بود)، حرف اول نام می‌ماند
      img.addEventListener('load', function () { img.hidden = false; initial.hidden = true; });
      img.addEventListener('error', function () { img.hidden = true; initial.hidden = false; });
      img.src = user.photoUrl;
    }
  }

  /* ---------- اتصال رویدادها ---------- */
  $$('.nav [data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      TG.haptic();
      showTab(btn.dataset.tab);
    });
  });

  $$('[data-goto]').forEach(function (btn) {
    btn.addEventListener('click', function () { showTab(btn.dataset.goto); });
  });

  $('#open-calc').addEventListener('click', function () { TG.haptic(); openCalculator(); });
  $('#calc-back').addEventListener('click', closeCalculator);

  // ابزارهای غیرفعال: به‌جای بی‌واکنشی، توضیح کوتاه می‌دهیم
  $$('[data-soon]').forEach(function (btn) {
    btn.addEventListener('click', function () { toast(btn.dataset.soon + ' به‌زودی فعال می‌شود.'); });
  });

  $$('#calc-modes [data-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.dataset.mode === state.mode) return;
      TG.haptic();
      setMode(btn.dataset.mode);
    });
  });

  form.addEventListener('input', recalc);
  form.addEventListener('change', recalc);
  form.addEventListener('submit', function (e) { e.preventDefault(); });   // Enter صفحه را رفرش نکند

  TG.onBack(function () { if (state.calcOpen) closeCalculator(); });

  /* ---------- شروع ---------- */
  renderProfile();
  setMode('fv');
  showTab('home');
})();
