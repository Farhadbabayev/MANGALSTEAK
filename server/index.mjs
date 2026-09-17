#!/usr/bin/env node
/**
 * Mangal Steak House — sayt + daxili rezervasiya serveri.
 *
 * Xarici paket yoxdur: yalnız Node.js-in öz modulları.
 *   npm start
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { join, normalize, extname, sep, basename } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

import { config, ROOT } from './lib/config.mjs';
import { getVilka, vilkaEnabled, maskedVilka, saveVilka } from './lib/integration.mjs';
import {
  createReservation,
  listReservations,
  updateReservation,
  pendingDeliveries,
  countRecentByIp,
  addNewsletter,
} from './lib/store.mjs';
import { validateReservation, validateEmail } from './lib/validate.mjs';
import { deliverOnce, vilkaStatus, previewPayload, sendTest } from './lib/vilka.mjs';
import { notifyReservation, telegramEnabled } from './lib/notify.mjs';
import {
  readAllConfigs,
  saveConfig,
  runBuild,
  listImages,
  saveImage,
  deleteImage,
  listFonts,
  MAX_IMAGE_BYTES,
} from './lib/cms.mjs';

/* ------------------------------------------------------------------ *
 *  Köməkçilər
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const sendJson = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
};

const sendText = (res, status, text, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
};

const clientIp = (req) => {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
};

const readBody = (req, limit) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const readJsonBody = async (req, limit) => {
  const raw = await readBody(req, limit || config.maxBodyBytes);
  if (!raw) return {};
  return JSON.parse(raw);
};

/* Şəkil yükləmə base64 ilə gəlir — daha böyük gövdəyə icazə verilir */
const UPLOAD_LIMIT = Math.round(MAX_IMAGE_BYTES * 1.4);

/* ------------------------------------------------------------------ *
 *  Sürət məhdudiyyəti (yaddaşda + fayl üzrə yoxlama)
 * ------------------------------------------------------------------ */

const hits = new Map();

const rateLimited = async (ip) => {
  const now = Date.now();
  const hour = 60 * 60 * 1000;

  const recent = (hits.get(ip) || []).filter((t) => now - t < hour);
  if (recent.length >= config.rateLimitPerHour) return true;

  /* Server yenidən başlayanda yaddaş sıfırlanır — faylı da yoxlayırıq */
  const stored = await countRecentByIp(ip, hour);
  if (stored >= config.rateLimitPerHour) return true;

  recent.push(now);
  hits.set(ip, recent);

  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < hour)) hits.delete(key);
    }
  }

  return false;
};

/* ------------------------------------------------------------------ *
 *  Admin autentifikasiyası
 * ------------------------------------------------------------------ */

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

const requireAdmin = (req, res) => {
  if (!config.admin.password) {
    sendJson(res, 503, {
      ok: false,
      error: 'Admin paneli sönülüdür. .env faylında ADMIN_PASSWORD təyin edin.',
    });
    return false;
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Admin", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('Giriş tələb olunur.');
    return false;
  }

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const index = decoded.indexOf(':');
  const user = decoded.slice(0, index);
  const pass = decoded.slice(index + 1);

  if (!safeEqual(user, config.admin.user) || !safeEqual(pass, config.admin.password)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Admin", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('İstifadəçi adı və ya şifrə yanlışdır.');
    return false;
  }

  return true;
};

/* ------------------------------------------------------------------ *
 *  Vilka-ya çatdırılma
 * ------------------------------------------------------------------ */

const attemptDelivery = async (reservation) => {
  const result = await deliverOnce(reservation);

  const updated = await updateReservation(reservation.id, {
    delivery: {
      status: result.status,
      attempts: (reservation.delivery?.attempts || 0) + (result.status === 'skipped' ? 0 : 1),
      lastAttemptAt: new Date().toISOString(),
      lastError: result.error || null,
      reference: result.reference || reservation.delivery?.reference || null,
    },
  });

  return updated || reservation;
};

/**
 * Çatdırılmayanları arxa planda təkrar sınayır.
 * Parametrlər hər dəfə yenidən oxunur — paneldən dəyişdirmək serveri
 * yenidən başlatmağı tələb etmir.
 */
const startRetryLoop = () => {
  const tick = async () => {
    if (!vilkaEnabled()) return;

    try {
      const queue = await pendingDeliveries(getVilka().maxAttempts);
      for (const reservation of queue) {
        const updated = await attemptDelivery(reservation);
        if (updated.delivery.status === 'sent') {
          console.log('[rezervasiya] təkrar cəhd uğurlu: ' + updated.code);
        }
      }
    } catch (err) {
      console.warn('[rezervasiya] təkrar cəhd xətası:', (err && err.message) || err);
    }
  };

  const timer = setInterval(tick, 60 * 1000);
  timer.unref();
  setTimeout(tick, 20 * 1000).unref();
};

/* ------------------------------------------------------------------ *
 *  API
 * ------------------------------------------------------------------ */

const handleReservation = async (req, res) => {
  const ip = clientIp(req);

  let input;
  try {
    input = await readJsonBody(req);
  } catch (err) {
    const tooLarge = err && err.message === 'too-large';
    return sendJson(res, tooLarge ? 413 : 400, {
      ok: false,
      error: tooLarge ? 'Məlumat həddindən böyükdür.' : 'Məlumat düzgün göndərilmədi.',
    });
  }

  const check = validateReservation(input);
  if (!check.ok) {
    return sendJson(res, 400, { ok: false, error: check.error, field: check.field });
  }

  if (await rateLimited(ip)) {
    return sendJson(res, 429, {
      ok: false,
      error: 'Çox sayda sorğu göndərildi. Zəhmət olmasa bizə zəng edin.',
    });
  }

  const reservation = await createReservation({
    ...check.data,
    ip,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
  });

  console.log(
    '[rezervasiya] ' + reservation.code + ' · ' + reservation.date + ' ' + reservation.time +
    ' · ' + reservation.guests + ' nəfər'
  );

  /* Vilka-ya ötürürük. Uğursuz olsa belə rezervasiya bizdə qalır və
     arxa planda təkrar cəhd edilir — müştəri gözlədilmir. */
  let delivered = reservation;
  try {
    delivered = await attemptDelivery(reservation);
  } catch (err) {
    console.warn('[vilka] göndərmə xətası:', (err && err.message) || err);
  }

  notifyReservation(delivered).catch(() => {});

  return sendJson(res, 201, {
    ok: true,
    code: delivered.code,
    delivery: delivered.delivery.status,
  });
};

const handleNewsletter = async (req, res) => {
  let input;
  try {
    input = await readJsonBody(req);
  } catch (_) {
    return sendJson(res, 400, { ok: false, error: 'Məlumat düzgün göndərilmədi.' });
  }

  const email = validateEmail(input.email);
  if (!email) return sendJson(res, 400, { ok: false, error: 'E-mail ünvanı düzgün deyil.' });

  await addNewsletter(email, clientIp(req));
  return sendJson(res, 201, { ok: true });
};

const csvEscape = (value) => '"' + String(value ?? '').replace(/"/g, '""') + '"';

const handleAdminApi = async (req, res, url) => {
  if (!requireAdmin(req, res)) return;

  const path = url.pathname;

  if (path === '/api/admin/reservations' && req.method === 'GET') {
    const all = await listReservations();
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const status = url.searchParams.get('status');

    const filtered = all
      .filter((r) => (from ? r.date >= from : true))
      .filter((r) => (to ? r.date <= to : true))
      .filter((r) => (status ? r.status === status : true))
      .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));

    return sendJson(res, 200, {
      ok: true,
      total: filtered.length,
      vilka: vilkaStatus(),
      telegram: telegramEnabled(),
      reservations: filtered,
    });
  }

  if (path === '/api/admin/export.csv' && req.method === 'GET') {
    const all = await listReservations();
    const header = [
      'Kod', 'Yaradılıb', 'Tarix', 'Saat', 'Ad', 'Telefon', 'Nəfər',
      'Zona', 'Səbəb', 'Qeyd', 'Status', 'Vilka', 'Vilka ID',
    ];

    const rows = all.map((r) =>
      [
        r.code, r.createdAt, r.date, r.time, r.name, r.phone, r.guests,
        r.area, r.occasion, r.note, r.status, r.delivery?.status, r.delivery?.reference,
      ].map(csvEscape).join(',')
    );

    const csv = '﻿' + [header.map(csvEscape).join(','), ...rows].join('\r\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rezervasiyalar.csv"',
      'Cache-Control': 'no-store',
    });
    return res.end(csv);
  }

  if (path === '/api/admin/retry' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => ({}));
    const all = await listReservations();
    const reservation = all.find((r) => r.id === body.id);
    if (!reservation) return sendJson(res, 404, { ok: false, error: 'Rezervasiya tapılmadı.' });

    const updated = await attemptDelivery(reservation);
    return sendJson(res, 200, { ok: true, reservation: updated });
  }

  /**
   * Çatdırılmamış rezervasiyanı «əl ilə həll olundu» kimi işarələyir —
   * heyət onu rezervasiya tətbiqinə özü daxil edibsə, təkrar cəhd dayanır.
   */
  if (path === '/api/admin/resolve' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => ({}));
    const allowed = ['new', 'manual'];
    if (!allowed.includes(body.status)) {
      return sendJson(res, 400, { ok: false, error: 'Status düzgün deyil.' });
    }

    const updated = await updateReservation(body.id, { status: body.status });
    if (!updated) return sendJson(res, 404, { ok: false, error: 'Rezervasiya tapılmadı.' });

    return sendJson(res, 200, { ok: true, reservation: updated });
  }

  /* ---------------- Rezervasiya sisteminin bağlantısı ---------------- */

  if (path === '/api/admin/integration' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, settings: maskedVilka(), status: vilkaStatus() });
  }

  if (path === '/api/admin/integration' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => null);
    if (!body) return sendJson(res, 400, { ok: false, error: 'Məlumat oxunmadı.' });

    const result = saveVilka(body);
    if (!result.ok) return sendJson(res, 400, result);

    console.log('[rezervasiya] bağlantı parametrləri yeniləndi (rejim: ' + getVilka().mode + ')');
    return sendJson(res, 200, { ...result, status: vilkaStatus() });
  }

  if (path === '/api/admin/integration/preview' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, preview: previewPayload() });
  }

  if (path === '/api/admin/integration/test' && req.method === 'POST') {
    const result = await sendTest();
    return sendJson(res, result.ok ? 200 : 400, result);
  }

  /* ---------------- Məzmun idarəetməsi ---------------- */

  if (path === '/api/admin/config' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      ...readAllConfigs(),
      images: listImages(),
      fonts: listFonts(),
      site_url: config.siteUrl,
      capabilities: {
        mode: 'server',
        build: true,
        journal: true,
        integrationWrite: true,
        imageWrite: true,
        configWrite: true,
      },
    });
  }

  if (path === '/api/admin/config' && req.method === 'POST') {
    let body;
    try {
      body = await readJsonBody(req, 4 * 1024 * 1024);
    } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'Məlumat oxunmadı.' });
    }

    const result = await saveConfig(body.name, body.data);
    return sendJson(res, result.ok ? 200 : 400, result);
  }

  if (path === '/api/admin/build' && req.method === 'POST') {
    const result = await runBuild();
    return sendJson(res, result.ok ? 200 : 500, result);
  }

  if (path === '/api/admin/images' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, images: listImages() });
  }

  if (path === '/api/admin/images' && req.method === 'POST') {
    let body;
    try {
      body = await readJsonBody(req, UPLOAD_LIMIT);
    } catch (err) {
      const tooLarge = err && err.message === 'too-large';
      return sendJson(res, tooLarge ? 413 : 400, {
        ok: false,
        error: tooLarge ? 'Şəkil çox böyükdür (maksimum 8 MB).' : 'Fayl oxunmadı.',
      });
    }

    const result = saveImage(body.name, body.data);
    return sendJson(res, result.ok ? 201 : 400, { ...result, images: listImages() });
  }

  if (path === '/api/admin/images/delete' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => ({}));
    const result = deleteImage(body.name);
    return sendJson(res, result.ok ? 200 : 400, { ...result, images: listImages() });
  }

  return sendJson(res, 404, { ok: false, error: 'Tapılmadı.' });
};

/* ------------------------------------------------------------------ *
 *  Statik fayllar
 * ------------------------------------------------------------------ */

const cacheHeaderFor = (ext) => {
  if (ext === '.html') return 'no-cache';
  if (['.css', '.js'].includes(ext)) return 'public, max-age=3600, must-revalidate';
  return 'public, max-age=2592000';
};

const serveStatic = (req, res, pathname) => {
  let rel = decodeURIComponent(pathname);

  if (rel.endsWith('/')) rel += 'index.html';

  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(config.publicDir, safe);

  if (!filePath.startsWith(config.publicDir + sep) && filePath !== config.publicDir) {
    return sendText(res, 403, 'Qadağandır.');
  }

  /* Uzantısız ünvanlar: /menyu -> /menyu.html */
  if (!existsSync(filePath) && !extname(filePath)) {
    const withHtml = filePath + '.html';
    if (existsSync(withHtml)) filePath = withHtml;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    const notFound = join(config.publicDir, '404.html');
    if (existsSync(notFound)) {
      const html = readFileSync(notFound);
      res.writeHead(404, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      return res.end(html);
    }
    return sendText(res, 404, 'Səhifə tapılmadı.');
  }

  const stats = statSync(filePath);
  const ext = extname(filePath).toLowerCase();
  const lastModified = stats.mtime.toUTCString();

  if (req.headers['if-modified-since'] === lastModified) {
    res.writeHead(304);
    return res.end();
  }

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stats.size,
    'Cache-Control': cacheHeaderFor(ext),
    'Last-Modified': lastModified,
  });

  if (req.method === 'HEAD') return res.end();

  createReadStream(filePath).pipe(res);
};

/* ------------------------------------------------------------------ *
 *  Server
 * ------------------------------------------------------------------ */

const ADMIN_DIR = join(ROOT, 'server', 'admin');
const ADMIN_PAGE = join(ADMIN_DIR, 'index.html');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const path = url.pathname;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  try {
    /* --- API --- */

    if (path === '/api/reservations' && req.method === 'POST') {
      return await handleReservation(req, res);
    }

    if (path === '/api/newsletter' && req.method === 'POST') {
      return await handleNewsletter(req, res);
    }

    if (path === '/api/health' && req.method === 'GET') {
      const all = await listReservations();
      return sendJson(res, 200, {
        ok: true,
        uptimeSeconds: Math.round(process.uptime()),
        reservations: all.length,
        pending: all.filter((r) => r.delivery?.status === 'pending' || r.delivery?.status === 'failed').length,
        vilka: vilkaStatus(),
      });
    }

    if (path.startsWith('/api/admin/')) {
      return await handleAdminApi(req, res, url);
    }

    if (path.startsWith('/api/')) {
      return sendJson(res, 404, { ok: false, error: 'Tapılmadı.' });
    }

    /* --- Admin paneli --- */

    if (path === '/admin' || path === '/admin/') {
      if (!requireAdmin(req, res)) return;
      const html = readFileSync(ADMIN_PAGE);
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    /* Admin panelin öz css/js faylları */
    if (path.startsWith('/admin/')) {
      if (!requireAdmin(req, res)) return;

      const file = basename(path);
      const ext = extname(file).toLowerCase();

      if (!['.css', '.js'].includes(ext) || !existsSync(join(ADMIN_DIR, file))) {
        return sendText(res, 404, 'Tapılmadı.');
      }

      const body = readFileSync(join(ADMIN_DIR, file));
      res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': 'no-store' });
      return res.end(body);
    }

    /* --- Statik sayt --- */

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendText(res, 405, 'Metod dəstəklənmir.');
    }

    return serveStatic(req, res, path);
  } catch (err) {
    console.error('[server] xəta:', err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Serverdə xəta baş verdi.' });
    else res.end();
  }
});

server.listen(config.port, config.host, () => {
  const status = vilkaStatus();
  console.log('');
  console.log('  ' + config.restaurantName);
  console.log('  Sayt:  http://' + config.host + ':' + config.port);
  console.log('  Admin: http://' + config.host + ':' + config.port + '/admin' +
    (config.admin.password ? '' : '  (ADMIN_PASSWORD təyin olunmayıb — sönülü)'));
  console.log('  Vilka: ' + status.mode + (status.configured ? ' · ' + status.endpoint : ' · konfiqurasiya olunmayıb'));
  console.log('  Telegram bildirişi: ' + (telegramEnabled() ? 'aktiv' : 'sönülü'));
  console.log('');

  if (!vilkaEnabled()) {
    console.log('  Qeyd: VILKA_MODE=off — rezervasiyalar yalnız daxili anbara yazılır.');
    console.log('        Vilka-ya ötürmək üçün .env faylını doldurun.');
    console.log('');
  }

  startRetryLoop();
});

const shutdown = () => {
  console.log('\nServer dayandırılır…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
