'use strict';

/**
 * «Bronu yoxla» səhifəsi — qonaq bron kodu və telefon nömrəsi ilə
 * rezervasiyasının vəziyyətinə baxır və istəsə onu ləğv edir.
 *
 * Sorğu öz API-mıza gedir (POST /api/booking), server isə rezervi
 * Vilka-dan oxuyur. Kod ?kod= parametri ilə gəlirsə, sahə doldurulur.
 */

(function () {

  const root = document.querySelector('[data-booking-lookup]');
  if (!root) return;

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

  /* Son uğurlu yoxlama — ləğv eyni kod və nömrə ilə göndərilir */
  let current = null;

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

  const markInvalid = function (field, invalid) {
    const el = form.querySelector('[data-field="' + field + '"]');
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
          error: err && err.name === 'AbortError'
            ? 'Server cavab vermədi. Zəhmət olmasa telefonla əlaqə saxlayın.'
            : 'Bağlantı xətası oldu. İnternet bağlantınızı yoxlayın və ya bizə zəng edin.',
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  const render = function (r) {
    resultCode.textContent = r.code;

    resultState.textContent = r.statusLabel;
    resultState.dataset.state = r.status;

    const rows = [
      ['Ad', r.name],
      ['Tarix', r.date ? r.date.split('-').reverse().join('.') : ''],
      ['Saat', r.time],
      ['Nəfər', r.guests],
      ['Yer', r.place],
    ].filter(function (row) { return row[1]; });

    resultSummary.innerHTML = rows
      .map(function (row) {
        const value = String(row[1]).replace(/[<>&"]/g, '');
        return '<li><span>' + row[0] + '</span><span>' + value + '</span></li>';
      })
      .join('');

    cancelBtn.hidden = !r.canCancel;
  };

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearStatus(statusBox);
    markInvalid('code', false);
    markInvalid('phone', false);

    const code = normalizeCode(codeInput.value);
    const phone = normalizePhone(phoneInput.value);

    if (code.length < 4) {
      markInvalid('code', true).focus();
      showStatus(statusBox, 'Bron kodunu yazın.', 'error');
      return;
    }
    if (!phone) {
      markInvalid('phone', true).focus();
      showStatus(statusBox, 'Telefon nömrəsi düzgün deyil. Nümunə: +994 50 123 45 67', 'error');
      return;
    }

    setLoading(submitBtn, true);
    showStatus(statusBox, 'Yoxlanılır…', 'info');

    const res = await call({ action: 'lookup', code: code, phone: phone });
    setLoading(submitBtn, false);

    if (!res.ok) {
      if (res.payload && res.payload.field) markInvalid(res.payload.field, true);
      showStatus(statusBox, (res.payload && res.payload.error) || 'Yoxlamaq alınmadı. Bir az sonra yenidən cəhd edin.', 'error');
      return;
    }

    clearStatus(statusBox);
    current = { code: code, phone: phone };
    render(res.payload.reservation);
    clearStatus(resultStatus);
    form.hidden = true;
    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  cancelBtn.addEventListener('click', async function () {
    if (!current) return;
    if (!window.confirm('Rezervasiyanı ləğv etmək istədiyinizə əminsiniz? Bunu geri qaytarmaq olmur.')) return;

    setLoading(cancelBtn, true);
    showStatus(resultStatus, 'Ləğv edilir…', 'info');

    const res = await call({ action: 'cancel', code: current.code, phone: current.phone });
    setLoading(cancelBtn, false);

    if (res.payload && res.payload.reservation) render(res.payload.reservation);

    if (!res.ok) {
      showStatus(resultStatus, (res.payload && res.payload.error) || 'Ləğv etmək alınmadı. Zəhmət olmasa bizə zəng edin.', 'error');
      return;
    }

    cancelBtn.hidden = true;
    showStatus(resultStatus, 'Rezervasiyanız ləğv olundu.', 'info');
  });

  againBtn.addEventListener('click', function () {
    current = null;
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

})();
