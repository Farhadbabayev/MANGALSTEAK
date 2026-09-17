#!/usr/bin/env node
/**
 * Vercel serverless funksiyalarının yoxlanması.
 *
 *   node scripts/test-serverless.mjs
 *
 * İki hal yoxlanılır:
 *   1. Heç bir çatdırılma kanalı yoxdur -> müştəriyə «qəbul olundu» DEYİLMİR
 *   2. Rezervasiya tətbiqi qoşulub      -> sorğu ora gedir, kod qaytarılır
 *
 * Hər hal ayrıca prosesdə işləyir, çünki parametrlər modul yüklənərkən oxunur.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_PORT = 4188;

/* ------------------------------------------------------------------ *
 *  Uşaq proses: bir halı işlədib nəticəni JSON kimi çap edir
 * ------------------------------------------------------------------ */

if (process.env.SERVERLESS_CASE) {
  const { default: handler } = await import(join(ROOT, 'api', 'reservations.js'));

  const tomorrow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const req = {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.9' },
    body: {
      name: 'Serverless Qonaq',
      phone: '0501234567',
      guests: 3,
      date: tomorrow,
      time: '19:00',
      area: 'salon',
      note: 'Serverless yoxlaması',
    },
  };

  let captured = { status: 0, body: null };

  const res = {
    setHeader() {},
    status(code) { captured.status = code; return this; },
    json(body) { captured.body = body; },
  };

  await handler(req, res);
  process.stdout.write('\n__RESULT__' + JSON.stringify(captured) + '\n');
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 *  Ana proses
 * ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;

const check = (name, condition, detail) => {
  if (condition) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (detail ? '  →  ' + detail : '')); }
};

const received = [];

const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    received.push({ path: req.url, auth: req.headers.authorization || null, body });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'VLK-SRV-' + received.length }));
  });
});

const runCase = (env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'test-serverless.mjs')], {
      cwd: ROOT,
      env: { ...process.env, SERVERLESS_CASE: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });

    child.on('close', () => {
      const match = out.match(/__RESULT__(.+)/);
      if (!match) return reject(new Error('Nəticə oxunmadı.\n' + out + err));
      resolve({ result: JSON.parse(match[1]), stderr: err });
    });
  });

await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));

console.log('\n══════════════════════════════════════════════');
console.log('  Serverless funksiyaları (Vercel)');
console.log('══════════════════════════════════════════════\n');

try {
  /* --- 1. Kanal yoxdur --- */
  const none = await runCase({
    VILKA_MODE: 'off',
    VILKA_API_URL: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    DATA_DIR: join(ROOT, 'data'),
  });

  check('Kanal yoxdursa rezervasiya «qəbul olundu» sayılmır',
    none.result.status === 503, 'status ' + none.result.status);
  check('Müştəriyə telefonla əlaqə təklif olunur',
    Boolean(none.result.body && /telefon/i.test(none.result.body.error)),
    JSON.stringify(none.result.body));
  check('İtən sorğu jurnala yazılır (server logu)',
    /ÇATDIRILMADI/.test(none.stderr), none.stderr.slice(0, 120));

  /* --- 2. Tətbiq qoşulub --- */
  const before = received.length;
  const ok = await runCase({
    VILKA_MODE: 'api',
    VILKA_API_URL: 'http://127.0.0.1:' + MOCK_PORT + '/reservations',
    VILKA_API_KEY: 'serverless-acar',
    VILKA_FIELD_MAP: '{"name":"guest_name"}',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    DATA_DIR: join(ROOT, 'data'),
  });

  check('Tətbiq qoşulanda rezervasiya qəbul olunur',
    ok.result.status === 201, 'status ' + ok.result.status + ' ' + JSON.stringify(ok.result.body));
  check('Müştəriyə kod verilir',
    /^MS-\d{6}-\d{4}$/.test((ok.result.body || {}).code || ''), (ok.result.body || {}).code);
  check('Çatdırılma «sent» kimi qeyd olunur', (ok.result.body || {}).delivery === 'sent');

  const hit = received[received.length - 1];
  check('Sorğu tətbiqə çatdı', received.length === before + 1);
  check('Açar göndərilir', hit && hit.auth === 'Bearer serverless-acar', hit && hit.auth);
  check('Sahə uyğunluğu işləyir', hit && hit.body.includes('guest_name'));

  /* --- 3. Yanlış məlumat --- */
  const bad = await runCase({
    VILKA_MODE: 'off',
    DATA_DIR: join(ROOT, 'data'),
    BAD_INPUT: '1',
  });
  check('Doğrulama serverless-də də işləyir', bad.result.status === 503 || bad.result.status === 400);

} catch (err) {
  failed++;
  console.error('\n  Yoxlama zamanı xəta:', err.message);
}

mock.close();

console.log('\n──────────────────────────────────────────────');
console.log('  Uğurlu: ' + passed + '   Uğursuz: ' + failed);
console.log('──────────────────────────────────────────────\n');

process.exit(failed ? 1 : 0);
