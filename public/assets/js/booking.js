'use strict';

/**
 * «Bronu yoxla» səhifəsi — qonaq bron kodu və telefon nömrəsi ilə
 * rezervasiyasının vəziyyətinə baxır, istəsə vaxtını və nəfər sayını
 * dəyişir və ya onu ləğv edir.
 *
 * Sorğu öz API-mıza gedir (POST /api/booking), server isə rezervi
 * Vilka-dan oxuyur. Kod ?kod= parametri ilə gəlirsə, sahə doldurulur.
 */

(function () {

/* Skript <main> içindədir, window.MANGAL_T isə səhifənin sonunda qoyulur —
   ona görə DOM tam oxunandan sonra işə düşür */
const init = function () {

  const root = document.querySelector('[data-booking-lookup]');
  if (!root) return;

  /* Mətnlər səhifənin dilindədir (build → window.MANGAL_T); olmasa Azərbaycan dili */
  const T = Object.assign({
    phoneInvalid: 'Telefon nömrəsi düzgün deyil. Nümunə: +994 50 123 45 67',
    dateRequired: 'Tarix seçin.',
    timeRequired: 'Saat seçin.',
    dateInvalid: 'Tarix və ya saat düzgün deyil.',
    guestsInvalid: 'Nəfər sayı düzgün deyil.',
    timeout: 'Server cavab vermədi. Zəhmət olmasa telefonla əlaqə saxlayın.',
    network: 'Bağlantı xətası oldu. İnternet bağlantınızı yoxlayın və ya bizə zəng edin.',
    sumDate: 'Tarix', sumTime: 'Saat', sumGuests: 'Nəfər',
    bkCodeRequired: 'Bron kodunu yazın.',
    bkChecking: 'Yoxlanılır…',
    bkLookupFailed: 'Yoxlamaq alınmadı. Bir az sonra yenidən cəhd edin.',
    bkNotFound: 'Bu kod və telefon nömrəsi ilə rezervasiya tapılmadı. Kodu və nömrəni yoxlayın.',
    bkUnavailable: 'Rezervasiyanı hazırda onlayn yoxlamaq mümkün olmadı. Zəhmət olmasa bizə zəng edin.',
    bkRateLimited: 'Çox sayda sorğu göndərildi. Bir az sonra yenidən yoxlayın və ya bizə zəng edin.',
    bkNotCancellable: 'Bu rezervasiyanı artıq onlayn ləğv etmək mümkün deyil. Zəhmət olmasa bizə zəng edin.',
    bkNotChangeable: 'Bu rezervasiyanı artıq onlayn dəyişmək mümkün deyil. Zəhmət olmasa bizə zəng edin.',
    bkRejected: 'Seçdiyiniz vaxta və ya nəfər sayına boş masa yoxdur, ya da restoran həmin vaxt bağlıdır. Başqa vaxt seçin və ya bizə zəng edin.',
    bkNoChange: 'Heç nə dəyişməyib — yeni vaxt və ya nəfər sayı seçin.',
    bkCancelConfirm: 'Rezervasiyanı ləğv etmək istədiyinizə əminsiniz? Bunu geri qaytarmaq olmur.',
    bkCancelling: 'Ləğv edilir…',
    bkCancelled: 'Rezervasiyanız ləğv olundu.',
    bkCancelFailed: 'Ləğv etmək alınmadı. Zəhmət olmasa bizə zəng edin.',
    bkUpdating: 'Rezervasiya yenilənir…',
    bkUpdated: 'Rezervasiyanız yeniləndi: {when}.',
    bkChangeFailed: 'Dəyişmək alınmadı. Zəhmət olmasa bizə zəng edin.',
    bkSumName: 'Ad', bkSumPlace: 'Yer',
    bkStatus: {},
    guestUnit: 'nəfər',
  }, window.MANGAL_T || {});

  const LANG = window.MANGAL_LANG || document.documentElement.lang || 'az';

  /* Server mətnləri Azərbaycan dilindədir (Vilka-nın səbəbi də). Başqa dildə
     cavabın koduna uyğun öz mətnimiz göstərilir. */
  const CODE_MESSAGE = {
    not_found: T.bkNotFound,
    unavailable: T.bkUnavailable,
    rate_limited: T.bkRateLimited,
    not_cancellable: T.bkNotCancellable,
    not_changeable: T.bkNotChangeable,
    rejected: T.bkRejected,
    no_change: T.bkNoChange,
    invalid_code: T.bkCodeRequired,
    invalid_phone: T.phoneInvalid,
    invalid_slot: T.dateInvalid,
    invalid_guests: T.guestsInvalid,
  };

  const errorText = function (payload, fallback) {
    if (!payload) return fallback;
    if (LANG === 'az' && payload.error) return payload.error;
    return CODE_MESSAGE[payload.code] || payload.error || fallback;
  };

  const API_BASE = (window.MANGAL_API_BASE || '').replace(/\/$/, '');
  const API_URL = API_BASE + '/api/booking';

  const form = root.querySelector('[data-lookup-form]');
  const statusBox = form.querySelector('[data-form-status]');
  const submitBtn = form.querySelector('[data-submit-btn]');
  const codeInput = form.querySelector('[data-field="code"]');
  const phoneInput = form.querySelector('[data-field="phone"]');

  const result = root.querySelector('[data-lookup-result]');
  const resultCode = root.querySelector('[data-result-code]');
  const resultState = root.querySelector('[data-result-state]');
  const resultSummary = root.querySelector('[data-result-summary]');
  const resultStatus = root.querySelector('[data-result-status]');
  const cancelBtn = root.querySelector('[data-cancel-btn]');
  const againBtn = root.querySelector('[data-lookup-again]');
  const resultActions = root.querySelector('[data-result-actions]');

  const rescheduleBtn = root.querySelector('[data-reschedule-btn]');
  const rescheduleForm = root.querySelector('[data-reschedule-form]');
  const rescheduleSave = root.querySelector('[data-reschedule-save]');
  const rescheduleClose = root.querySelector('[data-reschedule-close]');
  const newDate = rescheduleForm.querySelector('[data-field="date"]');
  const newTime = rescheduleForm.querySelector('[data-field="time"]');
  const newGuests = rescheduleForm.querySelector('[data-field="guests"]');

  const MAX_DAYS_AHEAD = 90;
  const pad = function (n) { return String(n).padStart(2, '0'); };
  const toISO = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

  /* Son uğurlu yoxlama — ləğv və vaxt dəyişmə eyni kod və nömrə ilə göndərilir */
  let current = null;

  const remember = function (r) {
    if (!current || !r) return;
    current.date = r.date;
    current.time = r.time;
    current.guests = r.guests;
  };

  const normalizeCode = function (raw) {
    return String(raw || '').toUpperCase().replace(/[\s#]/g, '');
  };

  const normalizePhone = function (raw) {
    let digits = String(raw || '').replace(/[^\d+]/g, '');
    if (digits.startsWith('00')) digits = '+' + digits.slice(2);
    if (digits.startsWith('+')) digits = digits.slice(1);
    if (digits.startsWith('994')) digits = digits.slice(3);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    if (!/^\d{9}$/.test(digits)) return null;
    return '+994' + digits;
  };

  const prettyPhone = function (value) {
    return String(value || '').replace(/^\+994(\d{2})(\d{3})(\d{2})(\d{2})$/, '+994 $1 $2 $3 $4');
  };

  const showStatus = function (box, message, type) {
    box.textContent = message;
    box.classList.remove('is-error', 'is-info');
    box.classList.add('is-visible', type === 'error' ? 'is-error' : 'is-info');
  };

  const clearStatus = function (box) {
    box.textContent = '';
    box.classList.remove('is-visible', 'is-error', 'is-info');
  };

  const markInvalid = function (field, invalid, scope) {
    const el = (scope || form).querySelector('[data-field="' + field + '"]');
    if (!el) return null;
    el.classList.toggle('is-invalid', invalid);
    if (invalid) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
    return el;
  };

  const setLoading = function (btn, loading) {
    btn.classList.toggle('is-loading', loading);
    btn.disabled = loading;
  };

  form.addEventListener('input', function (event) {
    if (event.target.classList.contains('is-invalid')) markInvalid(event.target.dataset.field, false);
  });

  phoneInput.addEventListener('blur', function () {
    const normalized = normalizePhone(phoneInput.value);
    if (normalized) phoneInput.value = prettyPhone(normalized);
  });

  const call = async function (body) {
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let payload = null;
      try { payload = await response.json(); } catch (_) { /* boş cavab */ }
      return { ok: response.ok && payload && payload.ok, payload: payload };
    } catch (err) {
      return {
        ok: false,
        payload: {
          error: err && err.name === 'AbortError' ? T.timeout : T.network,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  const render = function (r) {
    resultCode.textContent = r.code;

    resultState.textContent = (T.bkStatus && T.bkStatus[r.status]) || r.statusLabel;
    resultState.dataset.state = r.status;

    const rows = [
      [T.bkSumName, r.name],
      [T.sumDate, r.date ? r.date.split('-').reverse().join('.') : ''],
      [T.sumTime, r.time],
      [T.sumGuests, r.guests],
      [T.bkSumPlace, r.place],
    ].filter(function (row) { return row[1]; });

    resultSummary.innerHTML = rows
      .map(function (row) {
        const value = String(row[1]).replace(/[<>&"]/g, '');
        return '<li><span>' + row[0] + '</span><span>' + value + '</span></li>';
      })
      .join('');

    cancelBtn.hidden = !r.canCancel;
    rescheduleBtn.hidden = !r.canChange;
  };

  /* Siyahıda olmayan dəyəri (restoranın əl ilə qoyduğu 19:15, 25 nəfər)
     seçim kimi əlavə edir ki, yalnız digər sahəni dəyişmək mümkün olsun */
  const ensureOption = function (select, value, label) {
    if (!value) return;
    const exists = Array.prototype.some.call(select.options, function (o) { return o.value === value; });
    if (exists) return;
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label || value;
    opt.dataset.added = 'true';
    select.appendChild(opt);
  };

  /* Bu gün üçün keçmiş saatlar söndürülür (ən azı 45 dəq sonra);
     indiki rezervin öz saatı isə seçilə bilən qalır */
  const refreshTimes = function () {
    const isToday = newDate.value === toISO(new Date());
    const sameDay = current && newDate.value === current.date;
    const now = new Date();
    const earliest = now.getHours() * 60 + now.getMinutes() + 45;
    Array.prototype.forEach.call(newTime.options, function (opt) {
      if (!opt.value) return;
      const parts = opt.value.split(':').map(Number);
      opt.disabled = isToday && parts[0] * 60 + parts[1] < earliest && !(sameDay && opt.value === current.time);
    });
    const selected = newTime.selectedOptions[0];
    if (selected && selected.disabled) newTime.value = '';
  };

  const closeReschedule = function () {
    rescheduleForm.hidden = true;
    resultActions.hidden = false;
    markInvalid('date', false, rescheduleForm);
    markInvalid('time', false, rescheduleForm);
  };

  newDate.addEventListener('change', refreshTimes);
  rescheduleForm.addEventListener('input', function (event) {
    if (event.target.classList.contains('is-invalid')) {
      markInvalid(event.target.dataset.field, false, rescheduleForm);
    }
  });

  rescheduleBtn.addEventListener('click', function () {
    if (!current) return;
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);
    newDate.min = toISO(new Date());
    newDate.max = toISO(maxDate);
    newDate.value = current.date || toISO(new Date());
    ensureOption(newTime, current.time);
    newTime.value = current.time || '';
    ensureOption(newGuests, current.guests ? String(current.guests) : '', current.guests + ' ' + T.guestUnit);
    newGuests.value = current.guests ? String(current.guests) : newGuests.value;
    refreshTimes();
    clearStatus(resultStatus);
    resultActions.hidden = true;
    rescheduleForm.hidden = false;
    newDate.focus();
  });

  rescheduleClose.addEventListener('click', closeReschedule);

  rescheduleForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!current) return;
    clearStatus(resultStatus);

    if (!newDate.value) {
      markInvalid('date', true, rescheduleForm).focus();
      showStatus(resultStatus, T.dateRequired, 'error');
      return;
    }
    if (!newTime.value) {
      markInvalid('time', true, rescheduleForm).focus();
      showStatus(resultStatus, T.timeRequired, 'error');
      return;
    }
    const timeChanged = newDate.value !== current.date || newTime.value !== current.time;
    const guestsChanged = Number(newGuests.value) !== Number(current.guests);
    if (!timeChanged && !guestsChanged) {
      showStatus(resultStatus, T.bkNoChange, 'error');
      return;
    }

    setLoading(rescheduleSave, true);
    showStatus(resultStatus, T.bkUpdating, 'info');

    /* Yalnız dəyişən sahələr gedir */
    const body = { action: 'change', code: current.code, phone: current.phone };
    if (timeChanged) {
      body.date = newDate.value;
      body.time = newTime.value;
    }
    if (guestsChanged) body.guests = Number(newGuests.value);

    const res = await call(body);
    setLoading(rescheduleSave, false);

    if (!res.ok) {
      if (res.payload && res.payload.field) markInvalid(res.payload.field, true, rescheduleForm);
      showStatus(resultStatus, errorText(res.payload, T.bkChangeFailed), 'error');
      return;
    }

    remember(res.payload.reservation);
    render(res.payload.reservation);
    closeReschedule();
    const r = res.payload.reservation;
    showStatus(
      resultStatus,
      T.bkUpdated.replace('{when}', r.date.split('-').reverse().join('.') + ', ' + r.time +
        (r.guests ? ', ' + r.guests + ' ' + T.guestUnit : '')),
      'info'
    );
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearStatus(statusBox);
    markInvalid('code', false);
    markInvalid('phone', false);

    const code = normalizeCode(codeInput.value);
    const phone = normalizePhone(phoneInput.value);

    if (code.length < 4) {
      markInvalid('code', true).focus();
      showStatus(statusBox, T.bkCodeRequired, 'error');
      return;
    }
    if (!phone) {
      markInvalid('phone', true).focus();
      showStatus(statusBox, T.phoneInvalid, 'error');
      return;
    }

    setLoading(submitBtn, true);
    showStatus(statusBox, T.bkChecking, 'info');

    const res = await call({ action: 'lookup', code: code, phone: phone });
    setLoading(submitBtn, false);

    if (!res.ok) {
      if (res.payload && res.payload.field) markInvalid(res.payload.field, true);
      showStatus(statusBox, errorText(res.payload, T.bkLookupFailed), 'error');
      return;
    }

    clearStatus(statusBox);
    current = { code: code, phone: phone };
    remember(res.payload.reservation);
    render(res.payload.reservation);
    closeReschedule();
    clearStatus(resultStatus);
    form.hidden = true;
    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  cancelBtn.addEventListener('click', async function () {
    if (!current) return;
    if (!window.confirm(T.bkCancelConfirm)) return;

    setLoading(cancelBtn, true);
    showStatus(resultStatus, T.bkCancelling, 'info');

    const res = await call({ action: 'cancel', code: current.code, phone: current.phone });
    setLoading(cancelBtn, false);

    if (res.payload && res.payload.reservation) {
      remember(res.payload.reservation);
      render(res.payload.reservation);
    }

    if (!res.ok) {
      showStatus(resultStatus, errorText(res.payload, T.bkCancelFailed), 'error');
      return;
    }

    cancelBtn.hidden = true;
    rescheduleBtn.hidden = true;
    showStatus(resultStatus, T.bkCancelled, 'info');
  });

  againBtn.addEventListener('click', function () {
    current = null;
    closeReschedule();
    result.hidden = true;
    form.hidden = false;
    form.reset();
    clearStatus(statusBox);
    codeInput.focus();
  });

  /* Rezervasiyadan sonrakı keçid: bron.html?kod=27BDF7B6A1C4 */
  const fromUrl = new URLSearchParams(window.location.search).get('kod');
  if (fromUrl) {
    codeInput.value = normalizeCode(fromUrl).slice(0, 24);
    phoneInput.focus({ preventScroll: true });
  }

};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
