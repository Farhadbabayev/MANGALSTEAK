/**
 * Bronun yoxlanması və ləğvi — Vercel serverless funksiyası.
 *
 *   POST /api/booking  { action: "lookup" | "cancel", code, phone }
 *
 * Rezerv Vilka-dan oxunur (VILKA_MODE=api tələb olunur). Məntiq
 * server/lib/booking.mjs-dədir — Node serveri də onu çağırır.
 */

import { handleBooking } from '../server/lib/booking.mjs';

const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024) throw new Error('too-large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Metod dəstəklənmir.' });
    return;
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  let input;
  try {
    input = await readBody(req);
  } catch (_) {
    res.status(400).json({ ok: false, error: 'Məlumat düzgün göndərilmədi.' });
    return;
  }

  const result = await handleBooking(input, ip);
  res.status(result.status).json(result.body);
}
