/**
 * Qonağın rezervini saytda yoxlaması, vaxtını / nəfər sayını dəyişməsi və
 * ləğv etməsi.
 *
 * Qonaq bron kodunu və rezervdəki telefon nömrəsini yazır; server rezervi
 * Vilka-dan oxuyur və nömrə uyğun gələndə göstərir. Nömrə tələb olunur,
 * çünki köhnə «MS-…» kodları asan təxmin olunur və rezervdə qonağın adı
 * var — yalnız kod bilən başqası onu görməməli, ləğv edə bilməməlidir.
 *
 * Həm Vercel funksiyası (api/booking.js), həm də Node serveri
 * (server/index.mjs) eyni məntiqi çağırır.
 */

import { normalizePhone, validateSlot, reservationRules } from './validate.mjs';
import {
  vilkaLookupEnabled,
  fetchVilkaReservation,
  cancelVilkaReservation,
  changeVilkaReservation,
} from './vilka.mjs';

/* Vilka kodu (27BDF7B6, 12 simvolluq yenilər) və ya saytın MS-260101-1234 kodu */
const CODE = /^[A-Z0-9][A-Z0-9-]{3,23}$/;

export const normalizeCode = (raw) =>
  String(raw || '')
    .toUpperCase()
    .replace(/[\s#]/g, '');

const STATUS_LABELS = {
  hold: 'Gözləmədə',
  pending: 'Təsdiq gözləyir',
  confirmed: 'Təsdiqlənib',
  seated: 'Qonaq restoranda',
  completed: 'Başa çatıb',
  cancelled: 'Ləğv olunub',
  no_show: 'Gəlmədi',
  walkin: 'Yerində qeydiyyat',
};

const CANCELLABLE = ['hold', 'pending', 'confirmed'];
/* «hold» hələ ödəniş mərhələsindədir — vaxtı və nəfər sayı sabitdir */
const CHANGEABLE = ['pending', 'confirmed'];

/* Telefonların müqayisəsi: son 9 rəqəm (+994 / 0 / boşluq fərqi önəmsizdir) */
const phoneKey = (value) => String(value || '').replace(/\D/g, '').slice(-9);

const samePhone = (a, b) => {
  const x = phoneKey(a);
  return x.length === 9 && x === phoneKey(b);
};

const startsAt = (r) => {
  const t = Date.parse(r.starts_at || '');
  return Number.isNaN(t) ? null : t;
};

/** Brauzerə gedən forma — daxili sahələr (id, masa, partnyor) çıxmır */
const publicView = (r) => {
  const start = startsAt(r);
  const upcoming = start === null || start > Date.now();
  return {
    code: r.ref || '',
    status: r.status || '',
    statusLabel: STATUS_LABELS[r.status] || r.status || '—',
    date: r.date || '',
    time: r.time || '',
    guests: r.party_size || null,
    name: (r.guest && r.guest.name) || '',
    place: r.place || '',
    canCancel: CANCELLABLE.includes(r.status) && upcoming,
    canChange: CHANGEABLE.includes(r.status) && upcoming,
  };
};

const NOT_FOUND = 'Bu kod və telefon nömrəsi ilə rezervasiya tapılmadı. Kodu və nömrəni yoxlayın.';
const UNAVAILABLE =
  'Rezervasiyanı hazırda onlayn yoxlamaq mümkün olmadı. Zəhmət olmasa bizə zəng edin.';

/* Bir instansda sadə sürət məhdudiyyəti — kod təxminini çətinləşdirir */
const hits = new Map();
const WINDOW = 15 * 60 * 1000;

const rateLimited = (ip) => {
  const now = Date.now();
  const limit = Number(process.env.BOOKING_LOOKUPS_PER_15MIN) || 20;
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  if (recent.length >= limit) return true;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
};

/**
 * @param {{ action?: string, code?: string, phone?: string, date?: string, time?: string, guests?: number }} input
 * @param {string} ip
 * @returns {Promise<{ status: number, body: object }>}
 */
export const handleBooking = async (input, ip) => {
  /* «reschedule» — əvvəlki ad, eyni əməliyyat */
  const requested = input && input.action === 'reschedule' ? 'change' : input && input.action;
  const action = ['cancel', 'change'].includes(requested) ? requested : 'lookup';
  const code = normalizeCode(input && input.code);
  const phone = normalizePhone(input && input.phone);

  if (!CODE.test(code)) {
    return { status: 400, body: { ok: false, code: 'invalid_code', field: 'code', error: 'Bron kodunu düzgün yazın.' } };
  }
  if (!phone) {
    return {
      status: 400,
      body: { ok: false, code: 'invalid_phone', field: 'phone', error: 'Rezervasiyadakı telefon nömrəsini yazın. Nümunə: +994 50 123 45 67' },
    };
  }

  /* Yeni vaxt və nəfər sayı Vilka-ya getməzdən əvvəl saytın öz qaydaları ilə yoxlanılır */
  let slot = null;
  let guests = null;
  if (action === 'change') {
    const hasDate = Boolean(input.date || input.time);
    const hasGuests = input.guests !== undefined && input.guests !== null && input.guests !== '';
    if (!hasDate && !hasGuests) {
      return { status: 400, body: { ok: false, code: 'no_change', error: 'Yeni vaxt və ya nəfər sayı seçin.' } };
    }
    if (hasDate) {
      slot = validateSlot(input.date, input.time);
      if (!slot.ok) return { status: 400, body: { ok: false, code: 'invalid_slot', field: slot.field, error: slot.error } };
    }
    if (hasGuests) {
      guests = Number(input.guests);
      const max = reservationRules.maxGuests + 1;
      if (!Number.isInteger(guests) || guests < reservationRules.minGuests || guests > max) {
        return { status: 400, body: { ok: false, code: 'invalid_guests', field: 'guests', error: 'Nəfər sayı düzgün deyil.' } };
      }
    }
  }

  if (rateLimited(ip)) {
    return {
      status: 429,
      body: { ok: false, code: 'rate_limited', error: 'Çox sayda sorğu göndərildi. Bir az sonra yenidən yoxlayın və ya bizə zəng edin.' },
    };
  }

  if (!vilkaLookupEnabled()) {
    return { status: 503, body: { ok: false, code: 'unavailable', error: UNAVAILABLE } };
  }

  const found = await fetchVilkaReservation(code);
  if (!found.ok) {
    if (found.status === 404) return { status: 404, body: { ok: false, code: 'not_found', error: NOT_FOUND } };
    console.warn('[bron] Vilka oxunmadı: ' + found.error);
    return { status: 502, body: { ok: false, code: 'unavailable', error: UNAVAILABLE } };
  }

  /* Nömrə uyğun deyilsə «tapılmadı» deyirik — kodun mövcudluğu bildirilmir */
  const guestPhone = found.data.guest && found.data.guest.phone;
  if (!samePhone(guestPhone, phone)) {
    return { status: 404, body: { ok: false, code: 'not_found', error: NOT_FOUND } };
  }

  const current = publicView(found.data);
  if (action === 'lookup') {
    return { status: 200, body: { ok: true, reservation: current } };
  }

  if (action === 'change') {
    if (!current.canChange) {
      return {
        status: 409,
        body: {
          ok: false,
          code: 'not_changeable',
          error: 'Bu rezervasiyanı artıq onlayn dəyişmək mümkün deyil. Zəhmət olmasa bizə zəng edin.',
          reservation: current,
        },
      };
    }

    /* Yalnız həqiqətən dəyişən sahələr gedir — eyni vaxt yenidən yoxlanmasın */
    const changes = {};
    if (slot && (slot.date !== current.date || slot.time !== current.time)) {
      changes.date = slot.date;
      changes.time = slot.time;
    }
    if (guests !== null && guests !== current.guests) changes.party_size = guests;
    if (!Object.keys(changes).length) {
      return { status: 400, body: { ok: false, code: 'no_change', error: 'Heç nə dəyişməyib — yeni vaxt və ya nəfər sayı seçin.' } };
    }

    const changed = await changeVilkaReservation(found.data.ref || code, changes);
    if (!changed.ok) {
      /* 400/409: Vilka səbəbi deyir (boş masa yoxdur, restoran bağlıdır…) */
      if ((changed.status === 400 || changed.status === 409) && changed.message) {
        return { status: 409, body: { ok: false, code: 'rejected', error: changed.message, reservation: current } };
      }
      console.warn('[bron] Vilka-da rezerv dəyişmədi: ' + changed.error);
      return { status: 502, body: { ok: false, code: 'unavailable', error: UNAVAILABLE } };
    }

    console.log('[bron] qonaq rezervi dəyişdi: ' + (found.data.ref || code) + ' → ' + JSON.stringify(changes));
    return { status: 200, body: { ok: true, changed: true, reservation: publicView(changed.data) } };
  }

  if (!current.canCancel) {
    return {
      status: 409,
      body: {
        ok: false,
        code: 'not_cancellable',
        error: 'Bu rezervasiyanı artıq onlayn ləğv etmək mümkün deyil. Zəhmət olmasa bizə zəng edin.',
        reservation: current,
      },
    };
  }

  /* Vilka kodu ilə ləğv edirik — «MS-…» ilə gəlsə də eyni sətirdir */
  const cancelled = await cancelVilkaReservation(found.data.ref || code, 'Qonaq saytdan ləğv etdi');
  if (!cancelled.ok) {
    if (cancelled.status === 404) {
      return {
        status: 409,
        body: { ok: false, code: 'not_cancellable', error: 'Bu rezervasiyanı artıq onlayn ləğv etmək mümkün deyil. Zəhmət olmasa bizə zəng edin.' },
      };
    }
    console.warn('[bron] Vilka-da ləğv olunmadı: ' + cancelled.error);
    return { status: 502, body: { ok: false, code: 'unavailable', error: UNAVAILABLE } };
  }

  console.log('[bron] qonaq saytdan ləğv etdi: ' + (found.data.ref || code));
  return { status: 200, body: { ok: true, cancelled: true, reservation: publicView(cancelled.data) } };
};
