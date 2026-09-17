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

import { config } from './config.mjs';
import { getVilka, vilkaEnabled } from './integration.mjs';

/** Rezervasiyanı Vilka-nın gözlədiyi formaya salır. */
export const buildPayload = (reservation, settings) => {
  const vilka = settings || getVilka();

  const base = {
    external_id: reservation.code,
    restaurant_id: vilka.restaurantId || undefined,
    name: reservation.name,
    phone: reservation.phone,
    guests: reservation.guests,
    date: reservation.date,
    time: reservation.time,
    datetime: reservation.datetimeLocal || reservation.datetime,
    area: reservation.area,
    occasion: reservation.occasion || undefined,
    comment: reservation.note || undefined,
    source: 'website',
    created_at: reservation.createdAt,
  };

  /* Boş sahələri atırıq */
  const compact = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && value !== null && value !== '') compact[key] = value;
  }

  /* Sahə uyğunluğu: { "bizim_sahə": "onların_sahəsi" } */
  const map = vilka.fieldMap || {};
  const mapped = {};
  for (const [key, value] of Object.entries(compact)) {
    mapped[map[key] || key] = value;
  }

  return { ...mapped, ...(vilka.extraFields || {}) };
};

const timeoutSignal = (ms) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
};

/** Cavabdan Vilka tərəfindəki identifikatoru tapmağa çalışır. */
const extractReference = (body) => {
  if (!body || typeof body !== 'object') return null;
  const candidates = ['id', 'reservation_id', 'reservationId', 'booking_id', 'bookingId', 'uuid', 'code'];
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
    headers[vilka.authHeader] = scheme ? scheme + ' ' + vilka.apiKey : vilka.apiKey;
  }

  const { signal, done } = timeoutSignal(vilka.timeoutMs);

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
    headers[vilka.authHeader] = (scheme ? scheme + ' ' : '') + '••••' + String(vilka.apiKey).slice(-4);
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
