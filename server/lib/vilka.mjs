/**
 * Vilka inteqrasiyası.
 *
 * Müştəri saytdan çıxmır — forma bizim öz API-mıza göndərilir, bu modul isə
 * rezervasiyanı arxa planda Vilka sisteminə ötürür.
 *
 * Rejimlər (VILKA_MODE):
 *   off      — yalnız daxili anbara yazılır (inkişaf / açılış öncəsi)
 *   api      — Vilka-nın rezervasiya API-sinə birbaşa POST
 *   webhook  — aralıq webhook-a POST (Make, n8n, Zapier və s.)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from './config.mjs';
import { getVilka, vilkaEnabled } from './integration.mjs';

/**
 * Vilka Partner API-sinin öz sahə adları (api-v1, POST /reservations).
 *
 * «api» rejimində bunlar standart olaraq tətbiq olunur — beləliklə sayt
 * VILKA_FIELD_MAP yazılmadan da Vilka-nın başa düşdüyü JSON göndərir və
 * rezervasiya birbaşa Vilka panelində restoranın öz jurnalına düşür.
 * Paneldən / .env-dən yazılan uyğunluq bunların üstünə yazılır.
 *
 * external_ref vacibdir: Vilka onunla təkrarı tanıyır. Təkrar cəhd (retry)
 * ikinci rezerv yaratmır, mövcud olanı qaytarır.
 */
export const VILKA_API_FIELDS = {
  name: 'guest_name',
  phone: 'guest_phone',
  guests: 'party_size',
  external_id: 'external_ref',
  comment: 'note',
  datetime: 'starts_at',
};

/* Zona və səbəb Vilka-da ayrıca sahə deyil — heyət onları qeyddə görür */
const labels = (() => {
  try {
    const rules = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8')).reservation || {};
    const pick = (list) => Object.fromEntries((list || []).map((i) => [i.value, i.label]));
    return { areas: pick(rules.areas), occasions: pick(rules.occasions) };
  } catch (_) {
    return { areas: {}, occasions: {} };
  }
})();

/** «api» rejimi üçün: zona və səbəbi qonağın qeydinə qoşur. */
const vilkaNote = (reservation) => {
  const parts = [];
  if (reservation.area && reservation.area !== 'any') {
    parts.push('Zona: ' + (labels.areas[reservation.area] || reservation.area));
  }
  if (reservation.occasion) {
    parts.push('Səbəb: ' + (labels.occasions[reservation.occasion] || reservation.occasion));
  }
  if (reservation.note) parts.push(reservation.note);
  if (reservation.lang && reservation.lang !== 'az') parts.push('Dil: ' + reservation.lang.toUpperCase());
  parts.push('Sayt kodu: ' + reservation.code);
  return parts.join(' · ');
};

/** Rezervasiyanı Vilka-nın gözlədiyi formaya salır. */
export const buildPayload = (reservation, settings) => {
  const vilka = settings || getVilka();
  const direct = vilka.mode === 'api';

  const base = {
    external_id: reservation.code,
    restaurant_id: vilka.restaurantId || undefined,
    name: reservation.name,
    phone: reservation.phone,
    guests: reservation.guests,
    date: reservation.date,
    time: reservation.time,
    datetime: reservation.datetimeLocal || reservation.datetime,
    area: direct ? undefined : reservation.area,
    occasion: direct ? undefined : reservation.occasion || undefined,
    comment: direct ? vilkaNote(reservation) : reservation.note || undefined,
    source: 'website',
    created_at: reservation.createdAt,
  };

  /* Boş sahələri atırıq */
  const compact = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && value !== null && value !== '') compact[key] = value;
  }

  /* Sahə uyğunluğu: { "bizim_sahə": "onların_sahəsi" } */
  const map = { ...(direct ? VILKA_API_FIELDS : {}), ...(vilka.fieldMap || {}) };
  const mapped = {};
  for (const [key, value] of Object.entries(compact)) {
    mapped[map[key] || key] = value;
  }

  return { ...mapped, ...(vilka.extraFields || {}) };
};

/* HTTP başlıq adında icazə verilən simvollar (RFC 7230 «token») */
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

/**
 * Başlığın adı boş və ya yanlış olsa, fetch BÜTÜN göndərməni dağıdır:
 * «Headers.append: "" is an invalid header name». Rezervasiya isə müştəriyə
 * «onlayn rezervasiya işləmir» kimi qayıdır. Bir parametr səhvi buna
 * gətirib çıxarmamalıdır — ona görə standart başlığa qayıdırıq.
 */
const authHeaderName = (raw) => {
  const name = String(raw || '').trim();
  return HEADER_NAME.test(name) ? name : 'Authorization';
};

/* 0 və ya pozuq dəyər sorğunu elə ilk anda kəsərdi */
const timeoutOf = (value) => Math.min(Math.max(Number(value) || 15000, 2000), 60000);

const timeoutSignal = (ms) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
};

/** Cavabdan Vilka tərəfindəki identifikatoru tapmağa çalışır. */
const extractReference = (body) => {
  if (!body || typeof body !== 'object') return null;
  /* Vilka-nın «ref»-i (məs. 27BDF7B6) paneldə və qonağın səhifəsində görünən koddur */
  const candidates = ['ref', 'booking_ref', 'id', 'reservation_id', 'reservationId', 'booking_id', 'bookingId', 'uuid', 'code'];
  for (const key of candidates) {
    if (body[key]) return String(body[key]);
  }
  if (body.data && typeof body.data === 'object') return extractReference(body.data);
  return null;
};

/**
 * Bir dəfə göndərmə cəhdi.
 * @returns {Promise<{ status: 'sent'|'failed'|'skipped', reference?: string|null, error?: string }>}
 */
export const deliverOnce = async (reservation) => {
  const vilka = getVilka();

  if (!vilkaEnabled()) {
    return { status: 'skipped', error: null, reference: null };
  }

  const url = vilka.apiUrl;
  if (!url) {
    return { status: 'failed', error: 'API ünvanı təyin olunmayıb.', reference: null };
  }

  const payload = buildPayload(reservation, vilka);

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': config.restaurantName + ' Website',
  };

  if (vilka.apiKey) {
    const scheme = vilka.authScheme;
    headers[authHeaderName(vilka.authHeader)] = scheme ? scheme + ' ' + vilka.apiKey : vilka.apiKey;
  }

  const { signal, done } = timeoutSignal(timeoutOf(vilka.timeoutMs));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch (_) {
      /* JSON deyilsə mətn kimi saxlayırıq */
    }

    if (!response.ok) {
      return {
        status: 'failed',
        reference: null,
        error: 'HTTP ' + response.status + ' — ' + text.slice(0, 300),
      };
    }

    return { status: 'sent', reference: extractReference(body), error: null };
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    return {
      status: 'failed',
      reference: null,
      error: aborted ? 'Vaxt bitdi (timeout).' : String((err && err.message) || err).slice(0, 300),
    };
  } finally {
    done();
  }
};

export const vilkaStatus = () => {
  const vilka = getVilka();
  return {
    mode: vilka.mode,
    configured: vilkaEnabled() && Boolean(vilka.apiUrl),
    endpoint: vilka.apiUrl ? vilka.apiUrl.replace(/\/\/([^/]+).*/, '//$1/…') : null,
  };
};

/** Paneldə göstərmək üçün: real göndərilən JSON (açar olmadan) */
export const previewPayload = () => {
  const vilka = getVilka();
  const sample = {
    code: 'MS-260101-1234',
    name: 'Nümunə Qonaq',
    phone: '+994501234567',
    guests: 4,
    date: '2026-01-01',
    time: '19:30',
    datetimeLocal: '2026-01-01T19:30:00+04:00',
    datetime: '2026-01-01T15:30:00.000Z',
    area: 'salon',
    occasion: 'ad-gunu',
    note: 'Pəncərə kənarı',
    createdAt: new Date().toISOString(),
  };

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (vilka.apiKey) {
    const scheme = vilka.authScheme;
    headers[authHeaderName(vilka.authHeader)] =
      (scheme ? scheme + ' ' : '') + '••••' + String(vilka.apiKey).slice(-4);
  }

  return {
    method: 'POST',
    url: vilka.apiUrl || '(təyin olunmayıb)',
    headers,
    body: buildPayload(sample, vilka),
  };
};

/** Sınaq göndərişi — Vilka-da real qeyd yarada bilər */
export const sendTest = async () => {
  const vilka = getVilka();

  if (!vilkaEnabled()) return { ok: false, error: 'Rejim «off» seçilib — göndərmə sönülüdür.' };
  if (!vilka.apiUrl) return { ok: false, error: 'API ünvanı təyin olunmayıb.' };

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const date = tomorrow.toISOString().slice(0, 10);

  const result = await deliverOnce({
    code: 'TEST-' + Date.now().toString().slice(-6),
    name: 'SINAQ — silin',
    phone: '+994500000000',
    guests: 2,
    date,
    time: '12:00',
    datetimeLocal: date + 'T12:00:00+04:00',
    datetime: new Date(date + 'T12:00:00Z').toISOString(),
    area: 'any',
    note: 'Bu sınaq göndərişidir, real rezervasiya deyil.',
    createdAt: new Date().toISOString(),
  });

  return result.status === 'sent'
    ? { ok: true, reference: result.reference }
    : { ok: false, error: result.error || 'Naməlum xəta' };
};
