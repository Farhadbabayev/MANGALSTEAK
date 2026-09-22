/**
 * Rezervasiya — Vercel serverless funksiyası.
 *
 * Vercel-də fayl sistemi yazıla bilmir, ona görə burada daxili jurnal yoxdur:
 * sorğu birbaşa rezervasiya tətbiqinə (Vilka) ötürülür və/və ya Telegram-a
 * bildiriş göndərilir.
 *
 * ƏSAS QAYDA: rezervasiyanın gedəcəyi heç bir yol yoxdursa, müştəriyə
 * «qəbul olundu» DEYİLMİR — telefonla əlaqə saxlaması istənilir.
 * Beləliklə heç bir sorğu itmir.
 *
 * Kanalları aktivləşdirmək üçün Vercel → Settings → Environment Variables:
 *   VILKA_MODE=api
 *   VILKA_API_URL=...
 *   VILKA_API_KEY=...
 *   (və/və ya)
 *   TELEGRAM_BOT_TOKEN=...
 *   TELEGRAM_CHAT_ID=...
 */

import { validateReservation } from '../server/lib/validate.mjs';
import { makeCode } from '../server/lib/store.mjs';
import { deliverOnce } from '../server/lib/vilka.mjs';
import { vilkaEnabled } from '../server/lib/integration.mjs';
import { notifyReservation, telegramEnabled } from '../server/lib/notify.mjs';

/* Bir instansda sadə sürət məhdudiyyəti (serverless olduğu üçün təxmini) */
const hits = new Map();

const rateLimited = (ip) => {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const limit = Number(process.env.RATE_LIMIT_PER_HOUR) || 8;

  const recent = (hits.get(ip) || []).filter((t) => now - t < hour);
  if (recent.length >= limit) return true;

  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) hits.clear();
  return false;
};

const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32 * 1024) throw new Error('too-large');
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
  } catch (err) {
    const tooLarge = err && err.message === 'too-large';
    res.status(tooLarge ? 413 : 400).json({
      ok: false,
      error: tooLarge ? 'Məlumat həddindən böyükdür.' : 'Məlumat düzgün göndərilmədi.',
    });
    return;
  }

  const check = validateReservation(input);
  if (!check.ok) {
    res.status(400).json({ ok: false, error: check.error, field: check.field });
    return;
  }

  if (rateLimited(ip)) {
    res.status(429).json({
      ok: false,
      error: 'Çox sayda sorğu göndərildi. Zəhmət olmasa bizə zəng edin.',
    });
    return;
  }

  const reservation = {
    ...check.data,
    code: makeCode(),
    createdAt: new Date().toISOString(),
    ip,
  };

  /* 1. Rezervasiya tətbiqinə ötürmə */
  let delivery = { status: 'skipped', error: null, reference: null };
  if (vilkaEnabled()) {
    try {
      delivery = await deliverOnce(reservation);
    } catch (err) {
      delivery = { status: 'failed', error: String((err && err.message) || err), reference: null };
    }
  }

  /* 2. Telegram bildirişi — ikinci təhlükəsizlik kanalı */
  let notified = false;
  if (telegramEnabled()) {
    try {
      const result = await notifyReservation({ ...reservation, delivery });
      notified = Boolean(result && result.sent);
    } catch (_) {
      notified = false;
    }
  }

  const reached = delivery.status === 'sent' || notified;

  if (!reached) {
    console.error(
      '[rezervasiya] ÇATDIRILMADI ' + reservation.code +
      ' · vilka: ' + delivery.status + (delivery.error ? ' (' + delivery.error + ')' : '') +
      ' · telegram: ' + (telegramEnabled() ? 'uğursuz' : 'sönülü') +
      ' · ' + reservation.name + ' ' + reservation.phone +
      ' · ' + reservation.date + ' ' + reservation.time + ' · ' + reservation.guests + ' nəfər'
    );

    res.status(503).json({
      ok: false,
      error:
        'Onlayn rezervasiya hazırda işləmir. Zəhmət olmasa telefonla əlaqə saxlayın — ' +
        'masanızı dərhal ayıracağıq.',
    });
    return;
  }

  console.log(
    '[rezervasiya] ' + reservation.code +
    (delivery.reference ? ' (Vilka: ' + delivery.reference + ')' : '') + ' · ' + reservation.date + ' ' + reservation.time +
    ' · ' + reservation.guests + ' nəfər · vilka: ' + delivery.status +
    ' · telegram: ' + (notified ? 'göndərildi' : 'yox')
  );

  /* Qonağa Vilka-nın kodu verilir — Vilka panelində və qonaq səhifəsində görünən eyni kod.
     Vilka-ya çatmayıbsa (yalnız Telegram) və ya webhook rejimidirsə,
     saytın öz kodu qalır. */
  const vilkaCode = delivery.status === 'sent' ? delivery.code : null;

  res.status(201).json({
    ok: true,
    code: vilkaCode || reservation.code,
    delivery: delivery.status,
  });
}
