'use strict';

/**
 * Mangal Steak House — daxili rezervasiya sistemi (müştəri tərəfi)
 *
 * Forma heç bir xarici sayta yönləndirmir: məlumat öz API-mıza (POST /api/reservations)
 * göndərilir, server isə onu restoranın rezervasiya sisteminə (Vilka) ötürür.
 *
 * Səhifədə birdən çox forma ola bilər (səhifədəki bölmə + üzən düymə ilə
 * açılan pəncərə), ona görə hər «[data-reservation]» sahəsi ayrıca qurulur.
 */

(function () {

  /**
   * Sayt alt qovluqda yerləşirsə (məsələn /restoran/), səhifədən əvvəl
   * window.MANGAL_API_BASE = '/restoran' təyin etmək kifayətdir.
   */
  const API_BASE = (window.MANGAL_API_BASE || '').replace(/\/$/, '');
  const API_URL = API_BASE + '/api/reservations';
  const NEWSLETTER_URL = API_BASE + '/api/newsletter';
  const MAX_DAYS_AHEAD = 90;

  /**
   * Mətnlər səhifənin dilindədir: build hər səhifəyə window.MANGAL_T qoyur.
   * Olmasa (köhnə səhifə) Azərbaycan dilindəki mətnlər işlənir.
   */
  const T = Object.assign({
    nameRequired: 'Zəhmət olmasa adınızı yazın.',
    nameLong: 'Ad çox uzundur (maksimum 80 simvol).',
    phoneInvalid: 'Telefon nömrəsi düzgün deyil. Nümunə: +994 50 123 45 67',
    dateRequired: 'Tarix seçin.',
    timeRequired: 'Saat seçin.',
    dateInvalid: 'Tarix və ya saat düzgün deyil.',
    past: 'Keçmiş vaxt üçün rezervasiya etmək olmur. Başqa saat seçin.',
    tooFar: 'Rezervasiya ən çox {days} gün əvvəlcədən edilə bilər.',
    guestsRequired: 'Nəfər sayını seçin.',
    guestsInvalid: 'Nəfər sayı düzgün deyil.',
    sending: 'Rezervasiya göndərilir…',
    failed: 'Rezervasiyanı qeyd edə bilmədik. Zəhmət olmasa bir az sonra yenidən yoxlayın və ya bizə zəng edin.',
    timeout: 'Server cavab vermədi. Zəhmət olmasa telefonla əlaqə saxlayın.',
    network: 'Bağlantı xətası oldu. İnternet bağlantınızı yoxlayın və ya bizə zəng edin.',
    sumName: 'Ad', sumPhone: 'Telefon', sumDate: 'Tarix', sumTime: 'Saat', sumGuests: 'Nəfər', sumArea: 'Zal',
    emailInvalid: 'E-mail ünvanı düzgün deyil.',
    subscribed: 'Təşəkkürlər! Abunəliyiniz qeyd olundu.',
    subscribeFailed: 'Alınmadı. Bir az sonra yenidən yoxlayın.',
    subscribeNetwork: 'Bağlantı xətası. Bir az sonra yenidən yoxlayın.',
  }, window.MANGAL_T || {});

  const LANG = window.MANGAL_LANG || document.documentElement.lang || 'az';

  /** Server mesajları Azərbaycan dilindədir; digər dillərdə sahəyə uyğun öz mətnimiz göstərilir */
  const FIELD_MESSAGE = {
    name: T.nameRequired,
    phone: T.phoneInvalid,
    date: T.dateInvalid,
    time: T.dateInvalid,
    guests: T.guestsInvalid,
  };

  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;


  /* ---------------------------------------------------------------- *
   *  Telefon nömrəsi (Azərbaycan)
   * ---------------------------------------------------------------- */

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


  /* ---------------------------------------------------------------- *
   *  Doğrulama
   * ---------------------------------------------------------------- */

  const validate = function (data) {
    if (!data.name || data.name.trim().length < 2) {
      return { field: 'name', message: T.nameRequired };
    }

    if (data.name.trim().length > 80) {
      return { field: 'name', message: T.nameLong };
    }

    if (!normalizePhone(data.phone)) {
      return { field: 'phone', message: T.phoneInvalid };
    }

    if (!data.date) {
      return { field: 'date', message: T.dateRequired };
    }

    if (!data.time) {
      return { field: 'time', message: T.timeRequired };
    }

    const when = new Date(`${data.date}T${data.time}:00`);
    if (isNaN(when.getTime())) {
      return { field: 'date', message: T.dateInvalid };
    }

    if (when.getTime() < Date.now() + 15 * 60 * 1000) {
      return { field: 'time', message: T.past };
    }

    const limit = new Date();
    limit.setDate(limit.getDate() + MAX_DAYS_AHEAD);
    if (when > limit) {
      return { field: 'date', message: T.tooFar.replace('{days}', MAX_DAYS_AHEAD) };
    }

    const guests = Number(data.guests);
    if (!guests || guests < 1) {
      return { field: 'guests', message: T.guestsRequired };
    }

    return null;
  };


  /* ---------------------------------------------------------------- *
   *  Bir rezervasiya sahəsinin qurulması
   * ---------------------------------------------------------------- */

  const initReservation = function (root) {
    const form = root.querySelector('[data-reservation-form]');
    if (!form) return;

    const statusBox = form.querySelector('[data-form-status]');
    const submitBtn = form.querySelector('[data-submit-btn]');
    const successBox = root.querySelector('[data-form-success]');
    const successCode = root.querySelector('[data-success-code]');
    const successSummary = root.querySelector('[data-success-summary]');
    const successManage = root.querySelector('[data-success-manage]');
    const newReservationBtn = root.querySelector('[data-new-reservation]');

    const dateInput = form.querySelector('[data-field="date"]');
    const timeSelect = form.querySelector('[data-field="time"]');

    /* Pəncərənin öz sürüşən gövdəsi var — səhifədəki bölmədə isə yoxdur */
    const scrollHost = root.querySelector('[data-rez-scroll]');

    const bringIntoView = function (el) {
      if (scrollHost) scrollHost.scrollTo({ top: 0, behavior: 'smooth' });
      else el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };


    /* -------------------------------------------------------------- *
     *  Tarix sahəsinin hüdudları
     * -------------------------------------------------------------- */

    if (dateInput) {
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);

      dateInput.min = toISO(new Date());
      dateInput.max = toISO(maxDate);
      if (!dateInput.value) dateInput.value = toISO(new Date());
    }

    /* Bu gün üçün keçmiş saatları söndürürük */
    const refreshTimeSlots = function () {
      if (!dateInput || !timeSelect) return;

      const isToday = dateInput.value === toISO(new Date());
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes() + 45; // ən azı 45 dəq əvvəl

      let firstAvailable = null;

      Array.prototype.forEach.call(timeSelect.options, function (opt) {
        if (!opt.value) return;
        const [h, m] = opt.value.split(':').map(Number);
        const past = isToday && (h * 60 + m) < nowMinutes;
        opt.disabled = past;
        if (!past && firstAvailable === null) firstAvailable = opt.value;
      });

      const current = timeSelect.selectedOptions[0];
      if (current && current.disabled) timeSelect.value = firstAvailable || '';
    };

    if (dateInput) dateInput.addEventListener('change', refreshTimeSlots);
    refreshTimeSlots();

    /**
     * Pəncərə açılanda saat siyahısı yenidən hesablanır —
     * səhifə uzun müddət açıq qalsa belə keçmiş saat təklif olunmur.
     */
    root.addEventListener('reservation:refresh', refreshTimeSlots);


    /* -------------------------------------------------------------- *
     *  Vəziyyət mesajları
     * -------------------------------------------------------------- */

    const showStatus = function (message, type) {
      if (!statusBox) return;
      statusBox.textContent = message;
      statusBox.classList.remove('is-error', 'is-info');
      statusBox.classList.add('is-visible', type === 'error' ? 'is-error' : 'is-info');
    };

    const clearStatus = function () {
      if (!statusBox) return;
      statusBox.textContent = '';
      statusBox.classList.remove('is-visible', 'is-error', 'is-info');
    };

    const markInvalid = function (field, invalid) {
      const el = form.querySelector(`[data-field="${field}"]`);
      if (!el) return null;
      el.classList.toggle('is-invalid', invalid);
      if (invalid) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
      return el;
    };

    const clearInvalid = function () {
      form.querySelectorAll('.is-invalid').forEach(function (el) {
        el.classList.remove('is-invalid');
        el.removeAttribute('aria-invalid');
      });
    };

    form.addEventListener('input', function (event) {
      if (event.target.classList.contains('is-invalid')) {
        event.target.classList.remove('is-invalid');
        event.target.removeAttribute('aria-invalid');
      }
    });


    /* -------------------------------------------------------------- *
     *  Telefon nömrəsinin səliqəyə salınması
     * -------------------------------------------------------------- */

    const phoneInput = form.querySelector('[data-field="phone"]');
    if (phoneInput) {
      phoneInput.addEventListener('blur', function () {
        const normalized = normalizePhone(phoneInput.value);
        if (normalized) phoneInput.value = prettyPhone(normalized);
      });
    }


    /* -------------------------------------------------------------- *
     *  Uğur paneli
     * -------------------------------------------------------------- */

    const labelOf = function (field) {
      const el = form.querySelector(`[data-field="${field}"]`);
      if (!el || el.tagName !== 'SELECT') return '';
      const opt = el.selectedOptions[0];
      return opt ? opt.textContent.trim() : '';
    };

    const showSuccess = function (code, data) {
      if (!successBox) return;

      form.hidden = true;
      successBox.hidden = false;

      if (successCode) successCode.textContent = code;
      if (successManage && code && code !== '—') {
        successManage.href = 'bron.html?kod=' + encodeURIComponent(code);
      }

      if (successSummary) {
        const rows = [
          [T.sumName, data.name],
          [T.sumPhone, prettyPhone(data.phone)],
          [T.sumDate, data.date.split('-').reverse().join('.')],
          [T.sumTime, data.time],
          [T.sumGuests, labelOf('guests') || data.guests],
          [T.sumArea, labelOf('area')],
        ].filter(function (row) { return row[1]; });

        successSummary.innerHTML = rows
          .map(function (row) {
            const value = String(row[1]).replace(/[<>&]/g, '');
            return `<li><span>${row[0]}</span><span>${value}</span></li>`;
          })
          .join('');
      }

      bringIntoView(successBox);
    };

    if (newReservationBtn) {
      newReservationBtn.addEventListener('click', function () {
        successBox.hidden = true;
        form.hidden = false;
        form.reset();
        if (dateInput) dateInput.value = toISO(new Date());
        refreshTimeSlots();
        clearStatus();
        clearInvalid();
        bringIntoView(form);
      });
    }


    /* -------------------------------------------------------------- *
     *  Göndərmə
     * -------------------------------------------------------------- */

    const setLoading = function (loading) {
      if (!submitBtn) return;
      submitBtn.classList.toggle('is-loading', loading);
      submitBtn.disabled = loading;
    };

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      clearStatus();
      clearInvalid();

      const fd = new FormData(form);
      const data = {
        name: (fd.get('name') || '').toString().trim(),
        phone: (fd.get('phone') || '').toString().trim(),
        guests: (fd.get('guests') || '').toString(),
        date: (fd.get('date') || '').toString(),
        time: (fd.get('time') || '').toString(),
        area: (fd.get('area') || '').toString(),
        occasion: (fd.get('occasion') || '').toString(),
        note: (fd.get('note') || '').toString().trim(),
        website: (fd.get('website') || '').toString(),
        source: window.location.pathname.replace(/^\//, '') || 'index.html',
        lang: LANG,
      };

      const error = validate(data);
      if (error) {
        const el = markInvalid(error.field, true);
        showStatus(error.message, 'error');
        if (el) el.focus({ preventScroll: false });
        return;
      }

      data.phone = normalizePhone(data.phone);

      setLoading(true);
      showStatus(T.sending, 'info');

      try {
        const controller = new AbortController();
        const timeout = setTimeout(function () { controller.abort(); }, 20000);

        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        let payload = null;
        try { payload = await response.json(); } catch (_) { /* boş cavab */ }

        if (response.ok && payload && payload.ok) {
          clearStatus();
          showSuccess(payload.code || '—', data);
          return;
        }

        if (payload && payload.field) markInvalid(payload.field, true);

        const serverText = payload && payload.error;
        const localized = LANG === 'az'
          ? serverText
          : (payload && payload.field && FIELD_MESSAGE[payload.field]) || null;

        showStatus(localized || serverText || T.failed, 'error');

      } catch (err) {
        const offline = err && err.name === 'AbortError';
        showStatus(
          offline ? T.timeout : T.network,
          'error'
        );
      } finally {
        setLoading(false);
      }
    });
  };

  document.querySelectorAll('[data-reservation]').forEach(initReservation);


  /* ---------------------------------------------------------------- *
   *  Abunəlik forması (footer)
   * ---------------------------------------------------------------- */

  const newsletterForm = document.querySelector('[data-newsletter-form]');
  const newsletterStatus = document.querySelector('[data-newsletter-status]');

  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const input = newsletterForm.querySelector('input[type="email"]');
      const email = input ? input.value.trim() : '';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        if (newsletterStatus) newsletterStatus.textContent = T.emailInvalid;
        return;
      }

      try {
        const response = await fetch(NEWSLETTER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email }),
        });

        if (response.ok) {
          if (newsletterStatus) newsletterStatus.textContent = T.subscribed;
          newsletterForm.reset();
        } else {
          if (newsletterStatus) newsletterStatus.textContent = T.subscribeFailed;
        }
      } catch (_) {
        if (newsletterStatus) newsletterStatus.textContent = T.subscribeNetwork;
      }
    });
  }

})();
