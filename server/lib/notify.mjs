/**
 * Restoran heyətinə bildiriş (istəyə bağlı).
 *
 * TELEGRAM_BOT_TOKEN və TELEGRAM_CHAT_ID təyin olunubsa, hər yeni rezervasiya
 * Telegram-a düşür. Beləliklə Vilka-ya ötürmə uğursuz olsa belə, rezervasiya
 * gözdən qaçmır.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from './config.mjs';

/* Zal adları site.config.json-dan (admin → Rezervasiya zonaları) oxunur */
const areaLabels = (() => {
  try {
    const rules = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8')).reservation || {};
    return Object.fromEntries((rules.areas || []).map((a) => [a.value, a.label]));
  } catch (_) {
    return {};
  }
})();

const deliveryLabels = {
  sent: 'Vilka-ya göndərildi',
  failed: 'Vilka-ya GÖNDƏRİLMƏDİ',
  pending: 'Vilka-ya göndərilir',
  skipped: 'Vilka inteqrasiyası sönülüdür',
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const telegramEnabled = () =>
  Boolean(config.telegram.botToken && config.telegram.chatId);

export const notifyReservation = async (reservation) => {
  if (!telegramEnabled()) return { sent: false, reason: 'disabled' };

  const delivery = reservation.delivery || {};
  if (config.telegram.onlyFailures && delivery.status === 'sent') {
    return { sent: false, reason: 'only-failures' };
  }

  const lines = [
    '<b>Yeni rezervasiya</b> · ' + escapeHtml(reservation.code),
    '',
    '👤 ' + escapeHtml(reservation.name),
    '📞 ' + escapeHtml(reservation.phone),
    '📅 ' + escapeHtml(reservation.date.split('-').reverse().join('.')) + ' · ' + escapeHtml(reservation.time),
    '👥 ' + escapeHtml(reservation.guests) + ' nəfər',
    '📍 ' + escapeHtml(areaLabels[reservation.area] || reservation.area || '—'),
  ];

  if (reservation.occasion) lines.push('🎉 ' + escapeHtml(reservation.occasion));
  if (reservation.note) lines.push('📝 ' + escapeHtml(reservation.note));
  if (reservation.lang && reservation.lang !== 'az') lines.push('🌐 Dil: ' + escapeHtml(reservation.lang.toUpperCase()));

  lines.push('');
  if (delivery.code) lines.push('Vilka kodu: ' + escapeHtml(delivery.code));
  lines.push('Status: ' + escapeHtml(deliveryLabels[delivery.status] || delivery.status || '—'));
  if (delivery.status === 'failed' && delivery.lastError) {
    lines.push('Səbəb: ' + escapeHtml(String(delivery.lastError).slice(0, 200)));
  }

  try {
    const response = await fetch(
      'https://api.telegram.org/bot' + config.telegram.botToken + '/sendMessage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegram.chatId,
          text: lines.join('\n'),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );

    if (!response.ok) {
      console.warn('[telegram] bildiriş göndərilmədi: HTTP ' + response.status);
      return { sent: false, reason: 'http-' + response.status };
    }

    return { sent: true };
  } catch (err) {
    console.warn('[telegram] bildiriş xətası:', (err && err.message) || err);
    return { sent: false, reason: 'error' };
  }
};
