/**
 * Qonağın rezervini saytda yoxlaması, vaxtını dəyişməsi və ləğv etməsi.
 *
 * Qonaq bron kodunu və rezervdəki telefon nömrəsini yazır; server rezervi
 * Vilka-dan oxuyur və nömrə uyğun gələndə göstərir. Nömrə tələb olunur,
 * çünki köhnə «MS-…» kodları asan təxmin olunur və rezervdə qonağın adı
 * var — yalnız kod bilən başqası onu görməməli, ləğv edə bilməməlidir.
 *
 * Həm Vercel funksiyası (api/booking.js), həm də Node serveri
 * (server/index.mjs) eyni məntiqi çağırır.
 */

import { normalizePhone, validateSlot } from './validate.mjs';
import {
  vilkaLookupEnabled,
  fetchVilkaReservation,
  cancelVilkaReservation,
  rescheduleVilkaReservation,
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
/* «hold» hələ ödəniş mərhələsindədir — vaxtı sabitdir */
const RESCHEDULABLE = ['pending', 'confirmed'];

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
    canReschedule: RESCHEDULABLE.includes(r.status) && upcoming,
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
 * @param {{ action?: string, code?: string, phone?: string, date?: string, time?: string }} input
 * @param {string} ip
 * @returns {Promise<{ status: number, body: object }>}
 */
export const handleBooking = async (input, ip) => {
  const action = ['cancel', 'reschedule'].includes(input && input.action) ? input.action : 'lookup';
  const code = normalizeCode(input && input.code);
  const phone = normalizePhone(input && input.phone);

  if (!CODE.test(code)) {
    return { status: 400, body: { ok: false, field: 'code', error: 'Bron kodunu düzgün yazın.' } };
  }
  if (!phone) {
    return {
      status: 400,
      body: { ok: false, field: 'phone', error: 'Rezervasiyadakı telefon nömrəsini yazın. Nümunə: +994 50 123 45 67' },
    };
  }

  /* Yeni vaxt Vilka-ya getməzdən əvvəl saytın öz qaydaları ilə yoxlanılır */
  let slot = null;
  if (action === 'reschedule') {
    slot = validateSlot(input.date, input.time);
    if (!slot.ok) return { status: 400, body: { ok: false, field: slot.field, error: slot.error } };
  }

  if (rateLimited(ip)) {
    return {
      status: 429,
      body: { ok: false, error: 'Çox sayda sorğu göndərildi. Bir az sonra yenidən yoxlayın və ya bizə zəng edin.' },
    };
  }

  if (!vilkaLookupEnabled()) {
    return { status: 503, body: { ok: false, error: UNAVAILABLE } };
  }

  const found = await fetchVilkaReservation(code);
  if (!found.ok) {
    if (found.status === 404) return { status: 404, body: { ok: false, error: NOT_FOUND } };
    console.warn('[bron] Vilka oxunmadı: ' + found.error);
    return { status: 502, body: { ok: false, error: UNAVAILABLE } };
  }

  /* Nömrə uyğun deyilsə «tapılmadı» deyirik — kodun mövcudluğu bildirilmir */
  const guestPhone = found.data.guest && found.data.guest.phone;
  if (!samePhone(guestPhone, phone)) {
    return { status: 404, body: { ok: false, error: NOT_FOUND } };
  }

  const current = publicView(found.data);
  if (action === 'lookup') {
    return { status: 200, body: { ok: true, reservation: current } };
  }

  if (action === 'reschedule') {
    if (!current.canReschedule) {
      return {
        status: 409,
        body: {
          ok: false,
          error: 'Bu rezervasiyanın vaxtını artıq onlayn dəyişmək mümkün deyil. Zəhmət olmasa bizə zəng edin.',
          reservation: current,
        },
      };
    }

    const moved = await rescheduleVilkaReservation(found.data.ref || code, slot.date, slot.time);
    if (!moved.ok) {
      /* 400/409: Vilka səbəbi deyir (boş masa yoxdur, restoran bağlıdır…) */
      if ((moved.status === 400 || moved.status === 409) && moved.message) {
        return { status: 409, body: { ok: false, field: 'time', error: moved.message, reservation: current } };
      }
      console.warn('[bron] Vilka-da vaxt dəyişmədi: ' + moved.error);
      return { status: 502, body: { ok: false, error: UNAVAILABLE } };
    }

    console.log('[bron] qonaq vaxtı dəyişdi: ' + (found.data.ref || code) + ' → ' + slot.date + ' ' + slot.time);
    return { status: 200, body: { ok: true, rescheduled: true, reservation: publicView(moved.data) } };
  }

  if (!current.canCancel) {
    return {
      status: 409,
      body: {
        ok: false,
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
        body: { ok: false, error: 'Bu rezervasiyanı artıq onlayn ləğv etmək mümkün deyil. Zəhmət olmasa bizə zəng edin.' },
      };
    }
    console.warn('[bron] Vilka-da ləğv olunmadı: ' + cancelled.error);
    return { status: 502, body: { ok: false, error: UNAVAILABLE } };
  }

  console.log('[bron] qonaq saytdan ləğv etdi: ' + (found.data.ref || code));
  return { status: 200, body: { ok: true, cancelled: true, reservation: publicView(cancelled.data) } };
};
