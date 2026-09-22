/**
 * Server tərəfi doğrulama.
 * Qaydalar site.config.json faylından oxunur ki, forma ilə eyni olsun.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

const siteConfig = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const rules = siteConfig.reservation;

const areaValues = new Set(rules.areas.map((a) => a.value));
const occasionValues = new Set(rules.occasions.map((o) => o.value));

/** Azərbaycan nömrəsini +994XXXXXXXXX formasına salır, yararsızdırsa null qaytarır. */
export const normalizePhone = (raw) => {
  let digits = String(raw || '').replace(/[^\d+]/g, '');

  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  if (digits.startsWith('+')) digits = digits.slice(1);

  if (digits.startsWith('994')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  if (!/^\d{9}$/.test(digits)) return null;
  return '+994' + digits;
};

/** Görünməyən idarəetmə simvollarını təmizləyir və uzunluğu məhdudlaşdırır. */
const clean = (value, max) =>
  String(value ?? '')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .trim()
    .slice(0, max);

/**
 * Tarix və saat: formatı, keçmiş olmaması, maksimum irəli günlər və iş saatı.
 * Həm yeni rezerv, həm də vaxt dəyişmə (server/lib/booking.mjs) bunu çağırır.
 * @returns {{ ok: true, date: string, time: string, when: Date, localIso: string }
 *   | { ok: false, error: string, field: string }}
 */
export const validateSlot = (rawDate, rawTime) => {
  const date = clean(rawDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, field: 'date', error: 'Tarix düzgün deyil.' };
  }

  const time = clean(rawTime, 5);
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, field: 'time', error: 'Saat düzgün deyil.' };
  }

  /* Restoranın saat qurşağına görə hesablayırıq — server hansı zonada olursa olsun. */
  const localIso = date + 'T' + time + ':00' + (rules.timezoneOffset || '+04:00');
  const when = new Date(localIso);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, field: 'date', error: 'Tarix və ya saat düzgün deyil.' };
  }

  if (when.getTime() < Date.now() + 10 * 60 * 1000) {
    return { ok: false, field: 'time', error: 'Keçmiş vaxt üçün rezervasiya etmək olmur.' };
  }

  const limit = new Date();
  limit.setDate(limit.getDate() + rules.maxDaysAhead);
  if (when > limit) {
    return {
      ok: false,
      field: 'date',
      error: 'Rezervasiya ən çox ' + rules.maxDaysAhead + ' gün əvvəlcədən edilə bilər.',
    };
  }

  const hour = Number(time.slice(0, 2));
  if (hour < rules.openHour || hour > rules.closeHour) {
    const from = String(rules.openHour).padStart(2, '0');
    const to = String(rules.closeHour).padStart(2, '0');
    return { ok: false, field: 'time', error: 'Rezervasiya saatları: ' + from + ':00 – ' + to + ':00' };
  }

  return { ok: true, date, time, when, localIso };
};

/**
 * @returns {{ ok: true, data: object } | { ok: false, error: string, field?: string }}
 */
export const validateReservation = (input) => {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Məlumat düzgün göndərilmədi.' };
  }

  /* Bot tələsi */
  if (clean(input.website, 100)) {
    return { ok: false, error: 'Sorğu qəbul edilmədi.' };
  }

  const name = clean(input.name, 80);
  if (name.length < 2) {
    return { ok: false, field: 'name', error: 'Zəhmət olmasa adınızı yazın.' };
  }

  const phone = normalizePhone(input.phone);
  if (!phone) {
    return {
      ok: false,
      field: 'phone',
      error: 'Telefon nömrəsi düzgün deyil. Nümunə: +994 50 123 45 67',
    };
  }

  const guests = Number(input.guests);
  if (!Number.isInteger(guests) || guests < rules.minGuests || guests > rules.maxGuests + 1) {
    return { ok: false, field: 'guests', error: 'Nəfər sayı düzgün deyil.' };
  }

  const slot = validateSlot(input.date, input.time);
  if (!slot.ok) return slot;
  const { date, time, when, localIso } = slot;

  const area = clean(input.area, 30);
  const occasion = clean(input.occasion, 30);

  return {
    ok: true,
    data: {
      name,
      phone,
      guests,
      date,
      time,
      datetime: when.toISOString(),
      datetimeLocal: localIso,
      area: areaValues.has(area) ? area : 'any',
      occasion: occasionValues.has(occasion) ? occasion : '',
      note: clean(input.note, 500),
      source: clean(input.source, 60) || 'website',
    },
  };
};

export const validateEmail = (raw) => {
  const email = clean(raw, 120).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
};

export const reservationRules = rules;
