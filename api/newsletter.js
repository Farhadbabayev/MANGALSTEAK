/**
 * Abunəlik — Vercel serverless funksiyası.
 *
 * Fayl sistemi yazıla bilmədiyi üçün e-mail Telegram kanalına göndərilir.
 * Telegram təyin olunmayıbsa, abunəliyin işləmədiyi açıq şəkildə bildirilir.
 */

import { validateEmail } from '../server/lib/validate.mjs';

const enabled = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Metod dəstəklənmir.' });
    return;
  }

  let input;
  try {
    input = await readBody(req);
  } catch (_) {
    res.status(400).json({ ok: false, error: 'Məlumat düzgün göndərilmədi.' });
    return;
  }

  const email = validateEmail(input.email);
  if (!email) {
    res.status(400).json({ ok: false, error: 'E-mail ünvanı düzgün deyil.' });
    return;
  }

  if (!enabled()) {
    res.status(503).json({ ok: false, error: 'Abunəlik hazırda aktiv deyil.' });
    return;
  }

  try {
    const response = await fetch(
      'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: 'Yeni abunəlik: ' + email,
          disable_web_page_preview: true,
        }),
      }
    );

    if (!response.ok) throw new Error('HTTP ' + response.status);

    res.status(201).json({ ok: true });
  } catch (_) {
    res.status(503).json({ ok: false, error: 'Alınmadı. Bir az sonra yenidən yoxlayın.' });
  }
}
