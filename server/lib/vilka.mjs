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

import { config, vilkaEnabled } from './config.mjs';

/** Rezervasiyanı Vilka-nın gözlədiyi formaya salır. */
export const buildPayload = (reservation) => {
  const base = {
    external_id: reservation.code,
    restaurant_id: config.vilka.restaurantId || undefined,
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

  /* VILKA_FIELD_MAP: { "bizim_sahə": "onların_sahəsi" } */
  const map = config.vilka.fieldMap || {};
  const mapped = {};
  for (const [key, value] of Object.entries(compact)) {
    mapped[map[key] || key] = value;
  }

  return { ...mapped, ...(config.vilka.extraFields || {}) };
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
  if (!vilkaEnabled()) {
    return { status: 'skipped', error: null, reference: null };
  }

  const url = config.vilka.apiUrl;
  if (!url) {
    return { status: 'failed', error: 'VILKA_API_URL təyin olunmayıb.', reference: null };
  }

  const payload = buildPayload(reservation);

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': config.restaurantName + ' Website',
  };

  if (config.vilka.apiKey) {
    const scheme = config.vilka.authScheme;
    headers[config.vilka.authHeader] = scheme ? scheme + ' ' + config.vilka.apiKey : config.vilka.apiKey;
  }

  const { signal, done } = timeoutSignal(config.vilka.timeoutMs);

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

export const vilkaStatus = () => ({
  mode: config.vilka.mode,
  configured: vilkaEnabled() && Boolean(config.vilka.apiUrl),
  endpoint: config.vilka.apiUrl ? config.vilka.apiUrl.replace(/\/\/([^/]+).*/, '//$1/…') : null,
});
