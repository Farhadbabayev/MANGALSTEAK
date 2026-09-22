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

/* Vilka Partner API kimi: POST rezerv yaradır və «ref» qaytarır,
   GET/DELETE /reservations/<ref> onu Vilka kodu və ya external_ref ilə tapır */
const vilkaRows = [];
const patches = [];
const findRow = (ref) => vilkaRows.find((r) => r.ref === ref.toUpperCase() || r.external_ref === ref);

const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    const url = new URL(req.url, 'http://mock');
    const single = /^\/reservations\/([^/]+)$/.exec(url.pathname);

    if (single && (req.method === 'GET' || req.method === 'DELETE' || req.method === 'PATCH')) {
      const row = findRow(decodeURIComponent(single[1]));
      if (!row) return reply(404, { error: { code: 'NOT_FOUND', message: 'Rezervasiya tapılmadı.' } });
      if (req.method === 'PATCH') {
        const patch = (() => { try { return JSON.parse(body); } catch (_) { return {}; } })();
        patches.push({ ref: row.ref, auth: req.headers.authorization || null, body: patch });
        /* Vilka-nın öz yoxlamasını təqlid edir: 22:30-da və 12 nəfərə boş masa yoxdur */
        if (patch.time === '22:30' || patch.party_size === 12) {
          return reply(409, {
            error: { code: 'NOT_CHANGEABLE', message: 'Seçdiyiniz vaxta boş masa yoxdur. Zəhmət olmasa başqa saat seçin' },
          });
        }
        if (patch.date) {
          row.date = patch.date;
          row.time = patch.time;
          row.starts_at = new Date(patch.date + 'T' + patch.time + ':00+04:00').toISOString();
        }
        if (patch.party_size) row.party_size = patch.party_size;
        return reply(200, row);
      }
      if (req.method === 'DELETE') {
        if (!['pending', 'confirmed'].includes(row.status)) {
          return reply(404, { error: { code: 'NOT_FOUND', message: 'Ləğv edilə bilməz' } });
        }
        row.status = 'cancelled';
        row.cancel_reason = url.searchParams.get('reason');
      }
      return reply(200, row);
    }

    received.push({
      path: req.url,
      auth: req.headers.authorization || null,
      body: (() => { try { return JSON.parse(body); } catch (_) { return body; } })(),
    });

    const sentBody = received[received.length - 1].body || {};
    const row = {
      id: '00000000-0000-0000-0000-00000000000' + received.length,
      ref: 'A1B2C3D4E5F' + received.length,
      status: 'pending',
      date: sentBody.date,
      time: sentBody.time,
      starts_at: sentBody.date ? new Date(sentBody.date + 'T' + sentBody.time + ':00+04:00').toISOString() : null,
      party_size: sentBody.party_size,
      guest: { name: sentBody.guest_name, phone: sentBody.guest_phone, email: null },
      place: 'Salon · Masa 4',
      external_ref: sentBody.external_ref || null,
    };
    vilkaRows.push(row);
    reply(201, row);
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
  check('Qonağa Vilka-nın kodu verilir', createdBody.code === 'A1B2C3D4E5F1', createdBody.code);
  check('Vilka-ya göndərildi', createdBody.delivery === 'sent', createdBody.delivery);

  const sent = received[received.length - 1];
  check('Vilka sorğusu alındı', Boolean(sent));
  check('Telefon beynəlxalq formata salınıb', sent && sent.body.guest_phone === '+994501234567',
    sent && sent.body.guest_phone);
  check('Açar başlığı göndərilir', sent && sent.auth === 'Bearer test-acar', sent && sent.auth);
  check('Sahə adları dəyişdirilib (field map)', sent && sent.body.guest_name === 'Test Qonaq',
    sent && JSON.stringify(sent.body));
  check('Əlavə sabit sahə göndərilir', sent && sent.body.branch_id === 7);
  check('Saytın kodu Vilka-ya external_ref kimi ötürülür',
    sent && /^MS-\d{6}-\d{4}$/.test(sent.body.external_ref || ''), sent && JSON.stringify(sent.body));
  check('Nəfər sayı party_size (rəqəm) kimi gedir', sent && sent.body.party_size === 4);
  check('Vaxt starts_at kimi Bakı saatı ilə gedir',
    sent && /T19:00:00\+04:00$/.test(sent.body.starts_at || ''), sent && sent.body.starts_at);
  check('Zona, səbəb və qeyd Vilka qeydinə düşür',
    sent && /Zona: Əsas salon/.test(sent.body.note || '') && /Səbəb: Ad günü/.test(sent.body.note || '') &&
      /Pəncərə kənarı olsun/.test(sent.body.note || '') && sent.body.note.includes(sent.body.external_ref),
    sent && sent.body.note);
  check('Köhnə adlar Vilka-ya getmir',
    sent && !('name' in sent.body) && !('phone' in sent.body) && !('guests' in sent.body) &&
      !('external_id' in sent.body) && !('comment' in sent.body),
    sent && Object.keys(sent.body).join(', '));

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

  console.log('\n  BRONU YOXLA\n');

  const bronPage = await fetch(BASE + '/bron');
  const bronHtml = await bronPage.text();
  check('bron.html açılır və yoxlama forması var',
    bronPage.status === 200 && bronHtml.includes('data-lookup-form'), 'status ' + bronPage.status);

  const lookup = await post('/api/booking', { action: 'lookup', code: 'a1b2 c3d4 e5f1', phone: '050 123 45 67' });
  const lookupBody = await lookup.json();
  check('Kod və telefonla bron tapılır',
    lookup.status === 200 && lookupBody.ok && lookupBody.reservation.code === 'A1B2C3D4E5F1',
    'status ' + lookup.status + ' ' + JSON.stringify(lookupBody));
  check('Bronun vəziyyəti və ləğv imkanı göstərilir',
    lookupBody.reservation && lookupBody.reservation.statusLabel === 'Təsdiq gözləyir' &&
      lookupBody.reservation.canCancel === true,
    JSON.stringify(lookupBody.reservation));
  check('Qonağın telefonu cavabda qaytarılmır',
    !JSON.stringify(lookupBody).includes('501234567'), JSON.stringify(lookupBody));

  const bySiteCode = await post('/api/booking', { action: 'lookup', code: sent.body.external_ref, phone: '+994501234567' });
  const bySiteCodeBody = await bySiteCode.json();
  check('Köhnə sayt kodu (MS-…) ilə də tapılır, Vilka kodu göstərilir',
    bySiteCode.status === 200 && bySiteCodeBody.reservation.code === 'A1B2C3D4E5F1',
    'status ' + bySiteCode.status + ' ' + JSON.stringify(bySiteCodeBody));

  const wrongPhone = await post('/api/booking', { action: 'lookup', code: 'A1B2C3D4E5F1', phone: '+994551112233' });
  check('Başqa telefonla bron göstərilmir', wrongPhone.status === 404, 'status ' + wrongPhone.status);

  const wrongPhoneCancel = await post('/api/booking', { action: 'cancel', code: 'A1B2C3D4E5F1', phone: '+994551112233' });
  check('Başqa telefonla bron ləğv olunmur',
    wrongPhoneCancel.status === 404 && findRow('A1B2C3D4E5F1').status === 'pending',
    'status ' + wrongPhoneCancel.status);

  const unknown = await post('/api/booking', { action: 'lookup', code: 'FFFFFFFF', phone: '+994501234567' });
  check('Olmayan kod «tapılmadı» qaytarır', unknown.status === 404, 'status ' + unknown.status);

  const badCode = await post('/api/booking', { action: 'lookup', code: '<x>', phone: '+994501234567' });
  const badCodeBody = await badCode.json();
  check('Yanlış kod formatı rədd olunur', badCode.status === 400 && badCodeBody.field === 'code',
    JSON.stringify(badCodeBody));

  check('Vaxtı və nəfər sayını dəyişmək mümkün göstərilir', lookupBody.reservation && lookupBody.reservation.canChange === true);

  const later = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const moved = await post('/api/booking', {
    action: 'reschedule', code: 'A1B2C3D4E5F1', phone: '+994501234567', date: later, time: '20:30',
  });
  const movedBody = await moved.json();
  check('Qonaq vaxtı dəyişir',
    moved.status === 200 && movedBody.changed === true &&
      movedBody.reservation.date === later && movedBody.reservation.time === '20:30',
    'status ' + moved.status + ' ' + JSON.stringify(movedBody));
  const lastPatch = patches[patches.length - 1];
  check('Vilka-ya yalnız yeni vaxt PATCH ilə gedir',
    lastPatch && lastPatch.ref === 'A1B2C3D4E5F1' && lastPatch.auth === 'Bearer test-acar' &&
      JSON.stringify(lastPatch.body) === JSON.stringify({ date: later, time: '20:30' }),
    lastPatch && JSON.stringify(lastPatch));

  const patchCount = patches.length;
  const moveWrongPhone = await post('/api/booking', {
    action: 'reschedule', code: 'A1B2C3D4E5F1', phone: '+994551112233', date: later, time: '19:00',
  });
  check('Başqa telefonla vaxt dəyişmir',
    moveWrongPhone.status === 404 && patches.length === patchCount && findRow('A1B2C3D4E5F1').time === '20:30',
    'status ' + moveWrongPhone.status);

  const moveBadHour = await post('/api/booking', {
    action: 'reschedule', code: 'A1B2C3D4E5F1', phone: '+994501234567', date: later, time: '04:00',
  });
  const moveBadHourBody = await moveBadHour.json();
  check('İş saatından kənar yeni vaxt rədd olunur',
    moveBadHour.status === 400 && moveBadHourBody.field === 'time' && patches.length === patchCount,
    JSON.stringify(moveBadHourBody));

  const movePast = await post('/api/booking', {
    action: 'reschedule', code: 'A1B2C3D4E5F1', phone: '+994501234567', date: '2020-01-01', time: '19:00',
  });
  check('Keçmiş tarixə köçürmək olmur', movePast.status === 400, 'status ' + movePast.status);

  const moveFull = await post('/api/booking', {
    action: 'reschedule', code: 'A1B2C3D4E5F1', phone: '+994501234567', date: later, time: '22:30',
  });
  const moveFullBody = await moveFull.json();
  check('Vilka-nın səbəbi qonağa çatır (boş masa yoxdur)',
    moveFull.status === 409 && /boş masa yoxdur/.test(moveFullBody.error || '') &&
      findRow('A1B2C3D4E5F1').time === '20:30',
    'status ' + moveFull.status + ' ' + JSON.stringify(moveFullBody));

  const party = await post('/api/booking', {
    action: 'change', code: 'A1B2C3D4E5F1', phone: '+994501234567', guests: 6,
  });
  const partyBody = await party.json();
  check('Qonaq nəfər sayını dəyişir',
    party.status === 200 && partyBody.changed === true && partyBody.reservation.guests === 6 &&
      partyBody.reservation.time === '20:30',
    'status ' + party.status + ' ' + JSON.stringify(partyBody));
  const partyPatch = patches[patches.length - 1];
  check('Vilka-ya yalnız yeni nəfər sayı gedir (vaxt yox)',
    partyPatch && JSON.stringify(partyPatch.body) === JSON.stringify({ party_size: 6 }),
    partyPatch && JSON.stringify(partyPatch.body));

  const both = await post('/api/booking', {
    action: 'change', code: 'A1B2C3D4E5F1', phone: '+994501234567', date: later, time: '19:30', guests: 3,
  });
  const bothBody = await both.json();
  check('Vaxt və nəfər sayı birlikdə dəyişir',
    both.status === 200 && bothBody.reservation.time === '19:30' && bothBody.reservation.guests === 3 &&
      JSON.stringify(patches[patches.length - 1].body) === JSON.stringify({ date: later, time: '19:30', party_size: 3 }),
    'status ' + both.status + ' ' + JSON.stringify(patches[patches.length - 1]));

  const beforeSame = patches.length;
  const same = await post('/api/booking', {
    action: 'change', code: 'A1B2C3D4E5F1', phone: '+994501234567', guests: 3,
  });
  check('Dəyişiklik yoxdursa Vilka-ya sorğu getmir', same.status === 400 && patches.length === beforeSame,
    'status ' + same.status);

  const tooMany = await post('/api/booking', {
    action: 'change', code: 'A1B2C3D4E5F1', phone: '+994501234567', guests: 99,
  });
  const tooManyBody = await tooMany.json();
  check('Həddən çox nəfər rədd olunur', tooMany.status === 400 && tooManyBody.field === 'guests',
    JSON.stringify(tooManyBody));

  const noTable = await post('/api/booking', {
    action: 'change', code: 'A1B2C3D4E5F1', phone: '+994501234567', guests: 12,
  });
  const noTableBody = await noTable.json();
  check('Böyük qrupa masa yoxdursa səbəb qonağa çatır və rezerv dəyişmir',
    noTable.status === 409 && /boş masa yoxdur/.test(noTableBody.error || '') && findRow('A1B2C3D4E5F1').party_size === 3,
    'status ' + noTable.status + ' ' + JSON.stringify(noTableBody));

  const partyWrongPhone = await post('/api/booking', {
    action: 'change', code: 'A1B2C3D4E5F1', phone: '+994551112233', guests: 5,
  });
  check('Başqa telefonla nəfər sayı dəyişmir',
    partyWrongPhone.status === 404 && findRow('A1B2C3D4E5F1').party_size === 3, 'status ' + partyWrongPhone.status);

  const cancel = await post('/api/booking', { action: 'cancel', code: 'A1B2C3D4E5F1', phone: '+994501234567' });
  const cancelBody = await cancel.json();
  check('Qonaq bronu ləğv edir',
    cancel.status === 200 && cancelBody.cancelled === true && cancelBody.reservation.status === 'cancelled' &&
      cancelBody.reservation.canCancel === false,
    'status ' + cancel.status + ' ' + JSON.stringify(cancelBody));
  check('Ləğv Vilka-da qeyd olunur',
    findRow('A1B2C3D4E5F1').status === 'cancelled' && Boolean(findRow('A1B2C3D4E5F1').cancel_reason));

  const cancelAgain = await post('/api/booking', { action: 'cancel', code: 'A1B2C3D4E5F1', phone: '+994501234567' });
  check('Ləğv olunmuş bron təkrar ləğv olunmur', cancelAgain.status === 409, 'status ' + cancelAgain.status);

  const moveCancelled = await post('/api/booking', {
    action: 'reschedule', code: 'A1B2C3D4E5F1', phone: '+994501234567', date: later, time: '19:00',
  });
  check('Ləğv olunmuş bronun vaxtı dəyişmir', moveCancelled.status === 409, 'status ' + moveCancelled.status);

  const bronHasChange = bronHtml.includes('data-reschedule-form') && bronHtml.includes('value="20:30"') &&
    bronHtml.includes('id="bron-new-guests"');
  check('bron.html-də vaxt və nəfər dəyişmə forması var', bronHasChange);

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
  check('Vilka istinadı yazılıb', record && record.delivery.reference === 'A1B2C3D4E5F1',
    record && record.delivery.reference);

  const resolved = await post('/api/admin/resolve', { id: record.id, status: 'manual' }, adminAuth);
  const resolvedBody = await resolved.json();
  check('«Əl ilə həll olundu» işarəsi qoyulur',
    resolved.status === 200 && resolvedBody.reservation.status === 'manual');

  const badResolve = await post('/api/admin/resolve', { id: record.id, status: 'confirmed' }, adminAuth);
  check('Naməlum status rədd olunur', badResolve.status === 400);

  await post('/api/admin/resolve', { id: record.id, status: 'new' }, adminAuth);

  const csv = await fetch(BASE + '/api/admin/export.csv', { headers: adminAuth });
  const csvText = await csv.text();
  check('CSV ixracı işləyir', csv.status === 200 && csvText.includes('Test Qonaq'));

  const adminPage = await fetch(BASE + '/admin', { headers: adminAuth });
  check('Admin səhifəsi açılır', adminPage.status === 200, 'status ' + adminPage.status);

  /* Panelin düymələri məlumat yüklənməsindən ASILI OLMAMALIDIR.
     Əks halda bir uğursuz sorğu bütün düymələri cavabsız qoyur. */
  const panelJs = await (await fetch(BASE + '/admin/admin.js', { headers: adminAuth })).text();

  const initBody = (panelJs.match(/const init = async \(\) => \{([\s\S]*?)\n  \};/) || [])[1] || '';
  check('Panel skripti verilir', panelJs.length > 1000);
  check('Düymələr məlumatdan əvvəl qoşulur',
    initBody.indexOf('wireActions') !== -1 &&
    initBody.indexOf('loadAll') !== -1 &&
    initBody.indexOf('wireActions') < initBody.indexOf('loadAll'),
    initBody.replace(/\s+/g, ' ').slice(0, 160));

  const wireBody = (panelJs.match(/const wireActions = \(\) => \{([\s\S]*?)\n  \};/) || [])[1] || '';
  check('Əsas düymələr wireActions daxilindədir',
    ['[data-save]', '[data-publish]', '[data-rebuild]', '[data-upload]',
      '[data-add-category]', '[data-refresh-res]', '[data-save-integration]',
      '[data-int-preview]', '[data-int-test]', '[data-filter-reset]']
      .every((sel) => wireBody.includes(sel)));
  /* wireActions özü sinxrondur: içindəki «await»-lər yalnız basış
     hadisələrinin içindədir, qoşulma axınını dayandıra bilmir. */
  check('wireActions sinxrondur — sorğu onu yarıda kəsə bilməz',
    /const wireActions = \(\) => \{/.test(panelJs) &&
    !/const wireActions = async/.test(panelJs));
  check('init düymələri qoşana qədər heç nə gözləmir',
    !/\bawait\b/.test(initBody.slice(0, initBody.indexOf('wireActions'))),
    initBody.slice(0, initBody.indexOf('wireActions')).replace(/\s+/g, ' '));

  /* Cavab JSON deyilsə api() səssizcə null qaytarmamalıdır — məhz bu
     «null.site» oxunuşu paneli tamamilə dayandırırdı. */
  check('api() JSON olmayan cavabı xəta kimi qaytarır',
    /if \(body === null\) \{/.test(panelJs) &&
    /notJson = true/.test(panelJs),
    'api() hələ də null qaytara bilir');
  check('Panel alt əməliyyatları tək seqmentli ünvanla çağırır',
    panelJs.includes("'/api/admin/images?action=delete'") &&
    panelJs.includes("'/api/admin/integration?action=preview'") &&
    panelJs.includes("'/api/admin/integration?action=test'") &&
    !/'\/api\/admin\/(images|integration)\/[a-z]+'/.test(panelJs),
    'panel hələ də çox seqmentli ünvan çağırır');
  check('Konfiqurasiyanın tamlığı yoxlanılır',
    /!data \|\| !data\.site \|\| !data\.content \|\| !data\.theme/.test(panelJs));

  /* İcazə olmayanda düymə «disabled» edilməməlidir: basılanda səbəb deyilir */
  check('İcazəsiz düymələr sönülü deyil, izahlıdır',
    /\$\$\('\[data-save\], \[data-publish\]'\)\.forEach\(\(b\) => \{\s*b\.classList\.add\('is-blocked'\)/.test(panelJs),
    'applyCapabilities hələ də disabled istifadə edir');

  console.log('\n  BAĞLANTI PARAMETRLƏRİ\n');

  const intRes = await fetch(BASE + '/api/admin/integration', { headers: adminAuth });
  const intBody = await intRes.json();
  check('Bağlantı parametrləri oxunur', intRes.status === 200 && intBody.ok === true);
  check('Açar açıq şəkildə qaytarılmır', !JSON.stringify(intBody).includes('test-acar'),
    JSON.stringify(intBody.settings).slice(0, 160));
  check('Açarın yazıldığı bilinir', intBody.settings.apiKeySet === true);
  check('Mənbə .env göstərilir', intBody.settings.source === 'env', intBody.settings.source);

  const badMode = await post('/api/admin/integration', { mode: 'yalnis' }, adminAuth);
  check('Naməlum rejim rədd olunur', badMode.status === 400);

  const noUrl = await post('/api/admin/integration', { mode: 'api', apiUrl: '' }, adminAuth);
  check('API rejimində ünvan tələb olunur', noUrl.status === 400);

  const badUrl = await post('/api/admin/integration', { mode: 'api', apiUrl: 'ftp://yalnis' }, adminAuth);
  check('Yanlış ünvan rədd olunur', badUrl.status === 400);

  const badJson = await post('/api/admin/integration',
    { mode: 'api', apiUrl: 'http://127.0.0.1:' + MOCK_PORT + '/r', fieldMap: '{yalnis' }, adminAuth);
  check('Pozuq JSON rədd olunur', badJson.status === 400);

  /* Paneldən ünvanı dəyişirik — yeni ucnöqtəyə göndərilməlidir */
  const savedInt = await post('/api/admin/integration', {
    mode: 'api',
    apiUrl: 'http://127.0.0.1:' + MOCK_PORT + '/panel-endpoint',
    restaurantId: '77',
    authHeader: 'X-Api-Key',
    authScheme: '',
    fieldMap: '{"name":"musteri_adi"}',
    extraFields: '{"kanal":"sayt"}',
    timeoutMs: 9000,
    maxAttempts: 3,
  }, adminAuth);
  const savedIntBody = await savedInt.json();
  check('Paneldən yadda saxlanılır', savedInt.status === 200 && savedIntBody.ok === true,
    JSON.stringify(savedIntBody).slice(0, 160));
  check('Mənbə artıq panel olur', savedIntBody.settings.source === 'panel');
  check('Açar boş göndərildikdə silinmir', savedIntBody.settings.apiKeySet === true);

  /* Panel alt əməliyyatları «?action=» ilə çağırır — öz serveri də tanımalıdır */
  const previewAction = await fetch(BASE + '/api/admin/integration?action=preview', { headers: adminAuth });
  const previewActionBody = await previewAction.json();
  check('«?action=preview» öz serverində də tanınır',
    previewAction.status === 200 && Boolean(previewActionBody.preview),
    'status ' + previewAction.status);

  const deleteAction = await fetch(BASE + '/api/admin/images?action=delete', {
    method: 'POST',
    headers: { ...adminAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'olmayan-fayl.png' }),
  });
  check('«?action=delete» 404 vermir', deleteAction.status !== 404, 'status ' + deleteAction.status);

  const previewRes = await fetch(BASE + '/api/admin/integration/preview', { headers: adminAuth });
  const previewBody = await previewRes.json();
  check('Önizləmə hazırlanır', previewRes.status === 200 && previewBody.ok === true);
  check('Önizləmədə yeni ünvan var', (previewBody.preview.url || '').includes('/panel-endpoint'));
  check('Önizləmədə sahə adı dəyişib', 'musteri_adi' in previewBody.preview.body);
  check('Önizləmədə açar gizlədilib',
    JSON.stringify(previewBody.preview.headers).includes('••••'),
    JSON.stringify(previewBody.preview.headers));

  const before = received.length;
  const testSend = await post('/api/admin/integration/test', {}, adminAuth);
  check('Sınaq göndərişi işləyir', testSend.status === 200, 'status ' + testSend.status);

  const testHit = received[received.length - 1];
  check('Sınaq yeni ünvana getdi', received.length === before + 1 && testHit.path === '/panel-endpoint',
    testHit && testHit.path);
  check('Yeni açar başlığı istifadə olunur', testHit && testHit.auth === null);
  check('Əlavə sahə göndərilir', testHit && testHit.body.kanal === 'sayt');
  check('Filial kodu göndərilir', testHit && String(testHit.body.restaurant_id) === '77');

  /* Rejimi söndürüb yoxlayırıq */
  await post('/api/admin/integration', { mode: 'off' }, adminAuth);
  const offTest = await post('/api/admin/integration/test', {}, adminAuth);
  check('Sönülü rejimdə göndərmə dayanır', offTest.status === 400);

  /* Geri qaytarırıq */
  await post('/api/admin/integration', {
    mode: 'api',
    apiUrl: 'http://127.0.0.1:' + MOCK_PORT + '/reservations',
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    fieldMap: '{"name":"guest_name","note":"comment"}',
    extraFields: '{"branch_id":7}',
  }, adminAuth);

  console.log('\n  MƏZMUN İDARƏETMƏSİ\n');

  const cfgRes = await fetch(BASE + '/api/admin/config', { headers: adminAuth });
  const cfg = await cfgRes.json();
  check('Konfiqurasiya oxunur', cfgRes.status === 200 && cfg.ok === true);
  check('Üç konfiqurasiya da gəlir', Boolean(cfg.site && cfg.content && cfg.theme));
  check('Şəkil siyahısı gəlir', Array.isArray(cfg.images) && cfg.images.length > 0);
  check('Şrift siyahısı gəlir', Array.isArray(cfg.fonts) && cfg.fonts.length > 0);

  const badSave = await post('/api/admin/config', { name: 'site', data: { yalnis: true } }, adminAuth);
  check('Yarımçıq konfiqurasiya rədd olunur', badSave.status === 400, 'status ' + badSave.status);

  const unknownSave = await post('/api/admin/config', { name: 'basqa', data: {} }, adminAuth);
  check('Naməlum bölmə rədd olunur', unknownSave.status === 400);

  /* Real dəyişiklik: telefonu dəyişib saytda yoxlayırıq, sonra geri qaytarırıq */
  const original = JSON.parse(JSON.stringify(cfg.site));
  const changed = JSON.parse(JSON.stringify(cfg.site));
  changed.contact.phone = '+994 55 777 88 99';

  try {
    const saved = await post('/api/admin/config', { name: 'site', data: changed }, adminAuth);
    const savedBody = await saved.json();
    check('Dəyişiklik yadda saxlanılır', saved.status === 200 && savedBody.ok === true,
      JSON.stringify(savedBody).slice(0, 160));

    const rebuilt = await (await fetch(BASE + '/index.html')).text();
    check('Dəyişiklik sayta düşür', rebuilt.includes('+994 55 777 88 99'));
  } finally {
    await post('/api/admin/config', { name: 'site', data: original }, adminAuth);
  }

  const restored = await (await fetch(BASE + '/index.html')).text();
  check('Geri qaytarma işləyir', restored.includes(original.contact.phone));

  const built = await post('/api/admin/build', {}, adminAuth);
  check('Saytı yenidən yığmaq işləyir', built.status === 200, 'status ' + built.status);

  /* Şəkil yükləmə — 1x1 piksel PNG */
  const onePixel =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const upload = await post('/api/admin/images', { name: 'test-yoxlama.png', data: onePixel }, adminAuth);
  const uploadBody = await upload.json();
  check('Şəkil yüklənir', upload.status === 201 && uploadBody.ok === true, JSON.stringify(uploadBody).slice(0, 120));
  check('Yüklənən şəkil siyahıda görünür',
    (uploadBody.images || []).some((i) => i.name === 'test-yoxlama.png'));

  const badExt = await post('/api/admin/images', { name: 'zerer.exe', data: onePixel }, adminAuth);
  check('Yanlış format rədd olunur', badExt.status === 400);

  const usedDelete = await post('/api/admin/images/delete', { name: 'hero-slider-1.jpg' }, adminAuth);
  check('İstifadədə olan şəkil silinmir', usedDelete.status === 400);

  const removed = await post('/api/admin/images/delete', { name: 'test-yoxlama.png' }, adminAuth);
  check('Şəkil silinir', removed.status === 200, 'status ' + removed.status);

  const adminAsset = await fetch(BASE + '/admin/admin.js');
  check('Admin faylları şifrəsiz bağlıdır', adminAsset.status === 401, 'status ' + adminAsset.status);

  const adminAssetOk = await fetch(BASE + '/admin/admin.js', { headers: adminAuth });
  check('Admin faylları şifrə ilə açılır', adminAssetOk.status === 200);

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
