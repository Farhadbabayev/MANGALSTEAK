#!/usr/bin/env node
/**
 * Uçdan-uca yoxlama: sayt + rezervasiya API-si + Vilka ötürməsi + admin paneli.
 *
 *   npm test
 *
 * Saxta (mock) Vilka serveri qaldırılır, real Vilka-ya heç nə göndərilmir.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP_PORT = 4181;
const MOCK_PORT = 4182;
const BASE = 'http://127.0.0.1:' + APP_PORT;

const dataDir = mkdtempSync(join(tmpdir(), 'mangal-test-'));

let passed = 0;
let failed = 0;

const check = (name, condition, detail) => {
  if (condition) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    console.log('  ✗ ' + name + (detail ? '  →  ' + detail : ''));
  }
};

/* ------------------------------------------------------------------ *
 *  Saxta Vilka serveri
 * ------------------------------------------------------------------ */

const received = [];

const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    received.push({
      path: req.url,
      auth: req.headers.authorization || null,
      body: (() => { try { return JSON.parse(body); } catch (_) { return body; } })(),
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'VLK-' + received.length, status: 'accepted' }));
  });
});

/* ------------------------------------------------------------------ *
 *  Köməkçilər
 * ------------------------------------------------------------------ */

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
};

const post = (path, body, headers = {}) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const validReservation = (overrides = {}) => ({
  name: 'Test Qonaq',
  phone: '0501234567',
  guests: 4,
  date: tomorrow(),
  time: '19:00',
  area: 'salon',
  occasion: 'ad-gunu',
  note: 'Pəncərə kənarı olsun',
  source: 'rezervasiya.html',
  ...overrides,
});

const adminAuth = { Authorization: 'Basic ' + Buffer.from('admin:test-sifre').toString('base64') };

const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(BASE + '/api/health');
      if (response.ok) return true;
    } catch (_) { /* hələ qalxmayıb */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

/* ------------------------------------------------------------------ *
 *  Testlər
 * ------------------------------------------------------------------ */

const run = async () => {
  console.log('\n  SAYT\n');

  const home = await fetch(BASE + '/');
  const homeHtml = await home.text();
  check('Ana səhifə açılır', home.status === 200, 'status ' + home.status);
  check('Ana səhifədə restoranın adı var', homeHtml.includes('Mangal'));
  check('Ana səhifədə rezervasiya forması var', homeHtml.includes('data-reservation-form'));
  check('Vilka saytına yönləndirmə yoxdur', !/href="https?:\/\/[^"]*vilka/i.test(homeHtml));

  const menu = await fetch(BASE + '/menyu');
  check('Uzantısız ünvan işləyir (/menyu)', menu.status === 200, 'status ' + menu.status);

  const pages = ['haqqimizda', 'qalereya', 'tedbirler', 'rezervasiya', 'elaqe'];
  for (const page of pages) {
    const response = await fetch(BASE + '/' + page + '.html');
    const html = await response.text();
    check(
      page + '.html açılır və rezervasiya bölməsi var',
      response.status === 200 && html.includes('data-reservation-form'),
      'status ' + response.status
    );
  }

  const missing = await fetch(BASE + '/yoxdur-belə-səhifə');
  check('Olmayan səhifə 404 qaytarır', missing.status === 404, 'status ' + missing.status);

  const traversal = await fetch(BASE + '/../package.json');
  check('Qovluqdan kənara çıxış bağlıdır', traversal.status !== 200, 'status ' + traversal.status);

  console.log('\n  REZERVASİYA\n');

  const created = await post('/api/reservations', validReservation());
  const createdBody = await created.json();
  check('Düzgün rezervasiya qəbul olunur', created.status === 201 && createdBody.ok === true,
    'status ' + created.status + ' ' + JSON.stringify(createdBody));
  check('Rezervasiya kodu verilir', /^MS-\d{6}-\d{4}$/.test(createdBody.code || ''), createdBody.code);
  check('Vilka-ya göndərildi', createdBody.delivery === 'sent', createdBody.delivery);

  const sent = received[received.length - 1];
  check('Vilka sorğusu alındı', Boolean(sent));
  check('Telefon beynəlxalq formata salınıb', sent && sent.body.phone === '+994501234567',
    sent && sent.body.phone);
  check('Açar başlığı göndərilir', sent && sent.auth === 'Bearer test-acar', sent && sent.auth);
  check('Sahə adları dəyişdirilib (field map)', sent && sent.body.guest_name === 'Test Qonaq',
    sent && JSON.stringify(sent.body));
  check('Əlavə sabit sahə göndərilir', sent && sent.body.branch_id === 7);
  check('Rezervasiya kodu Vilka-ya ötürülür', sent && sent.body.external_id === createdBody.code);

  const badPhone = await post('/api/reservations', validReservation({ phone: '12345' }));
  const badPhoneBody = await badPhone.json();
  check('Yanlış telefon rədd olunur', badPhone.status === 400 && badPhoneBody.field === 'phone',
    JSON.stringify(badPhoneBody));

  const pastDate = await post('/api/reservations', validReservation({ date: '2020-01-01' }));
  check('Keçmiş tarix rədd olunur', pastDate.status === 400, 'status ' + pastDate.status);

  const noName = await post('/api/reservations', validReservation({ name: 'X' }));
  const noNameBody = await noName.json();
  check('Qısa ad rədd olunur', noName.status === 400 && noNameBody.field === 'name');

  const badHour = await post('/api/reservations', validReservation({ time: '04:00' }));
  check('İş saatından kənar vaxt rədd olunur', badHour.status === 400, 'status ' + badHour.status);

  const honeypot = await post('/api/reservations', validReservation({ website: 'spam.example' }));
  check('Bot tələsi işləyir', honeypot.status === 400, 'status ' + honeypot.status);

  console.log('\n  ADMIN PANELİ\n');

  const noAuth = await fetch(BASE + '/api/admin/reservations');
  check('Admin API şifrəsiz bağlıdır', noAuth.status === 401, 'status ' + noAuth.status);

  const wrongPass = await fetch(BASE + '/api/admin/reservations', {
    headers: { Authorization: 'Basic ' + Buffer.from('admin:yanlis').toString('base64') },
  });
  check('Yanlış şifrə rədd olunur', wrongPass.status === 401, 'status ' + wrongPass.status);

  const adminList = await fetch(BASE + '/api/admin/reservations', { headers: adminAuth });
  const adminBody = await adminList.json();
  check('Admin siyahısı açılır', adminList.status === 200 && adminBody.ok === true);
  check('Rezervasiya siyahıda görünür', adminBody.total === 1, 'total ' + adminBody.total);

  const record = adminBody.reservations[0];
  check('Qeyd mətni saxlanılıb', record && record.note === 'Pəncərə kənarı olsun');
  check('Vilka istinadı yazılıb', record && record.delivery.reference === 'VLK-1',
    record && record.delivery.reference);

  const confirm = await post('/api/admin/status', { id: record.id, status: 'confirmed' }, adminAuth);
  const confirmBody = await confirm.json();
  check('Status dəyişdirilir', confirm.status === 200 && confirmBody.reservation.status === 'confirmed');

  const csv = await fetch(BASE + '/api/admin/export.csv', { headers: adminAuth });
  const csvText = await csv.text();
  check('CSV ixracı işləyir', csv.status === 200 && csvText.includes('Test Qonaq'));

  const adminPage = await fetch(BASE + '/admin', { headers: adminAuth });
  check('Admin səhifəsi açılır', adminPage.status === 200, 'status ' + adminPage.status);

  console.log('\n  QORUMA\n');

  /* RATE_LIMIT_PER_HOUR=3 olaraq başladılıb; artıq 1 uğurlu sorğu var. */
  await post('/api/reservations', validReservation({ time: '20:00' }));
  await post('/api/reservations', validReservation({ time: '20:30' }));
  const limited = await post('/api/reservations', validReservation({ time: '21:00' }));
  check('Sürət məhdudiyyəti işləyir', limited.status === 429, 'status ' + limited.status);

  const health = await fetch(BASE + '/api/health');
  const healthBody = await health.json();
  check('Sağlamlıq yoxlaması işləyir', health.status === 200 && healthBody.ok === true);
  check('Vilka rejimi görünür', healthBody.vilka && healthBody.vilka.mode === 'api');
};

/* ------------------------------------------------------------------ *
 *  İcra
 * ------------------------------------------------------------------ */

let child;

const cleanup = () => {
  if (child && !child.killed) child.kill('SIGTERM');
  mock.close();
  try { rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* nəzərə alınmır */ }
};

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

(async () => {
  await new Promise((resolve) => mock.listen(MOCK_PORT, '127.0.0.1', resolve));

  child = spawn(process.execPath, [join(ROOT, 'server', 'index.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      ADMIN_USER: 'admin',
      ADMIN_PASSWORD: 'test-sifre',
      VILKA_MODE: 'api',
      VILKA_API_URL: 'http://127.0.0.1:' + MOCK_PORT + '/reservations',
      VILKA_API_KEY: 'test-acar',
      VILKA_FIELD_MAP: '{"name":"guest_name","note":"comment"}',
      VILKA_EXTRA_FIELDS: '{"branch_id":7}',
      RATE_LIMIT_PER_HOUR: '3',
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_CHAT_ID: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stderr.on('data', (chunk) => process.stderr.write('[server] ' + chunk));

  const ready = await waitForServer();
  if (!ready) {
    console.error('\n  Server qalxmadı.\n');
    process.exit(1);
  }

  console.log('\n══════════════════════════════════════════════');
  console.log('  Mangal Steak House — yoxlamalar');
  console.log('══════════════════════════════════════════════');

  try {
    await run();
  } catch (err) {
    failed++;
    console.error('\n  Testlər zamanı xəta:', err);
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('  Uğurlu: ' + passed + '   Uğursuz: ' + failed);
  console.log('──────────────────────────────────────────────\n');

  cleanup();
  process.exit(failed ? 1 : 0);
})();
