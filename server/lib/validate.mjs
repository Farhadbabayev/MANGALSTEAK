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

/**
 * Nömrəni beynəlxalq formaya (+XXXXXXXX) salır, yararsızdırsa null qaytarır.
 * «code» formadakı ölkə kodudur (+994 standart). Nömrə «+» və ya «00» ilə
 * yazılıbsa, ölkə kodu nömrənin özündən götürülür.
 * Azərbaycan üçün sərt yoxlama (9 rəqəm), digər ölkələr üçün E.164 (maks. 15 rəqəm).
 */
export const normalizePhone = (raw, code) => {
  let s = String(raw || '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);

  let cc = String(code || '+994').replace(/\D/g, '').slice(0, 4) || '994';
  let national;

  if (s.startsWith('+')) {
    const full = s.slice(1).replace(/\+/g, '');
    if (!full.startsWith('994')) return /^[1-9]\d{7,14}$/.test(full) ? '+' + full : null;
    cc = '994';
    national = full.slice(3);
  } else {
    national = s.replace(/\+/g, '');
    if (cc === '994' && national.length === 12 && national.startsWith('994')) national = national.slice(3);
    else national = national.replace(/^0/, '');
  }

  if (cc === '994') return /^\d{9}$/.test(national) ? '+994' + national : null;
  const full = cc + national;
  return /^\d{5,14}$/.test(national) && full.length <= 15 ? '+' + full : null;
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

  const phone = normalizePhone(input.phone, input.phoneCode);
  if (!phone) {
    return {
      ok: false,
      field: 'phone',
      error: 'Telefon nömrəsi düzgün deyil. Ölkə kodunu seçib nömrəni yazın, məsələn: 50 123 45 67',
    };
  }

  /* E-poçt istəyə bağlıdır, amma yazılıbsa düzgün olmalıdır */
  let email = '';
  if (clean(input.email, 120)) {
    email = validateEmail(input.email);
    if (!email) return { ok: false, field: 'email', error: 'E-poçt ünvanı düzgün deyil.' };
  }

  const guests = Number(input.guests);
  if (!Number.isInteger(guests) || guests < rules.minGuests || guests > rules.maxGuests + 1) {
    return { ok: false, field: 'guests', error: 'Nəfər sayı düzgün deyil.' };
  }

  const date = clean(input.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, field: 'date', error: 'Tarix düzgün deyil.' };
  }

  const time = clean(input.time, 5);
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

  const area = clean(input.area, 30);
  const occasion = clean(input.occasion, 30);

  return {
    ok: true,
    data: {
      name,
      phone,
      email,
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
