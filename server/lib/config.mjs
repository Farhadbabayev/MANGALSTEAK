/**
 * Konfiqurasiya — .env faylı və mühit dəyişənləri.
 * Heç bir xarici paket istifadə olunmur.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* --- .env oxunması (mövcud mühit dəyişənlərinin üstündən yazmır) --- */

const envPath = join(ROOT, '.env');

if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    /* Boş dəyər «yoxdur» sayılır — .env faylındakı dəyər onu üstələyir */
    if (!(key in process.env) || process.env[key] === '') process.env[key] = value;
  }
}

/**
 * DİQQƏT: BOŞ dəyər «təyin olunmayıb» sayılır.
 *
 * Vercel-də açarlar adətən bu şablondan köçürülür və bir çoxunun dəyəri
 * boş qalır. O zaman process.env[key] «undefined» deyil, '' olur — əvvəl
 * «??» bunu real dəyər kimi qəbul edirdi və standart dəyərlər səssizcə
 * itirdi. Nəticə: VILKA_AUTH_HEADER boş qalanda başlığın adı da '' olurdu,
 * fetch isə «Headers.append: "" is an invalid header name» ilə dağılırdı —
 * müştəri «onlayn rezervasiya işləmir» görürdü. VILKA_TIMEOUT_MS boş
 * qalanda isə Number('') = 0, yəni sorğu elə ilk anda kəsilirdi.
 */
const str = (key, fallback = '') => {
  const raw = process.env[key];
  const value = raw === undefined || raw === null ? '' : String(raw).trim();
  return value === '' ? fallback : value;
};

const num = (key, fallback) => {
  const raw = str(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};
const json = (key, fallback) => {
  const raw = str(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    console.warn(`[config] ${key} düzgün JSON deyil, nəzərə alınmadı.`);
    return fallback;
  }
};

/**
 * Açar sxemi. Bəzi API-lər açarı sxemsiz, olduğu kimi gözləyir
 * (məs. X-Api-Key). Boş dəyər artıq «təyin olunmayıb» saydığı üçün
 * bunu ayrıca sözlə bildirmək lazımdır: VILKA_AUTH_SCHEME=none
 */
const authScheme = str('VILKA_AUTH_SCHEME', 'Bearer');

export const config = {
  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  siteUrl: str('SITE_URL', 'http://localhost:3000'),
  publicDir: join(ROOT, 'public'),
  dataDir: str('DATA_DIR') || join(ROOT, 'data'),

  restaurantName: str('RESTAURANT_NAME', 'Mangal Steak House'),

  /* Vilka inteqrasiyası */
  vilka: {
    mode: str('VILKA_MODE', 'off').toLowerCase(), // off | api | webhook
    apiUrl: str('VILKA_API_URL'),
    apiKey: str('VILKA_API_KEY'),
    authHeader: str('VILKA_AUTH_HEADER', 'Authorization'),
    authScheme: authScheme.toLowerCase() === 'none' ? '' : authScheme,
    restaurantId: str('VILKA_RESTAURANT_ID'),
    fieldMap: json('VILKA_FIELD_MAP', {}),
    extraFields: json('VILKA_EXTRA_FIELDS', {}),
    timeoutMs: num('VILKA_TIMEOUT_MS', 15000),
    maxAttempts: num('VILKA_RETRY_ATTEMPTS', 4),
    retryEveryMs: num('VILKA_RETRY_INTERVAL_MS', 5 * 60 * 1000),
  },

  /* Admin panel */
  admin: {
    user: str('ADMIN_USER', 'admin'),
    password: str('ADMIN_PASSWORD'),
  },

  /* Telegram bildirişi (istəyə bağlı) */
  telegram: {
    botToken: str('TELEGRAM_BOT_TOKEN'),
    chatId: str('TELEGRAM_CHAT_ID'),
    onlyFailures: str('TELEGRAM_ONLY_FAILURES', 'false') === 'true',
  },

  /* Qoruma */
  rateLimitPerHour: num('RATE_LIMIT_PER_HOUR', 8),
  maxBodyBytes: num('MAX_BODY_BYTES', 32 * 1024),
  trustProxy: str('TRUST_PROXY', 'false') === 'true',
};

/* Qeyd: aktiv rejim integration.mjs-dən oxunur — paneldən dəyişdirilə bilər. */
