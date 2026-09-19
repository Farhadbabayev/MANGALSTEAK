#!/usr/bin/env node
/**
 * Vercel serverless funksiyalarının yoxlanması.
 *
 *   node scripts/test-serverless.mjs
 *
 * Saxta rezervasiya tətbiqi və saxta GitHub API-si qaldırılır;
 * heç bir real xidmətə sorğu getmir. Hər hal ayrıca prosesdə işləyir,
 * çünki parametrlər modul yüklənərkən oxunur.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VILKA_PORT = 4188;
const GH_PORT = 4189;

/* ================================================================== *
 *  UŞAQ PROSES — bir halı işlədir
 * ================================================================== */

if (process.env.SERVERLESS_CASE) {
  const fakeRes = () => {
    const captured = { status: 0, body: null, headers: {} };
    return {
      captured,
      setHeader(k, v) { captured.headers[k] = v; },
      status(code) { captured.status = code; return this; },
      json(body) { captured.body = body; return this; },
      send(body) { captured.body = body; return this; },
    };
  };

  const tomorrow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const auth = (user, pass) => ({
    authorization: 'Basic ' + Buffer.from(user + ':' + pass).toString('base64'),
  });

  const run = async () => {
    const which = process.env.SERVERLESS_CASE;

    /* ---- rezervasiya ---- */
    if (which.startsWith('reservation')) {
      const { default: handler } = await import(join(ROOT, 'api', 'reservations.js'));
      const res = fakeRes();
      await handler(
        {
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
        },
        res
      );
      return res.captured;
    }

    /* ---- admin ---- */
    const { default: admin } = await import(join(ROOT, 'api', 'admin', '[...path].js'));

    const call = async (path, method, body, headers, url) => {
      const res = fakeRes();
      await admin(
        {
          method: method || 'GET',
          headers: headers || auth('admin', 'sifre'),
          query: path === null ? {} : { path },
          url: url || ('/api/admin/' + [].concat(path || []).join('/')),
          body,
        },
        res
      );
      return res.captured;
    };

    if (which === 'admin-noauth') return call(['config'], 'GET', null, {});
    if (which === 'admin-wrongpass') return call(['config'], 'GET', null, auth('admin', 'yanlis'));
    if (which === 'admin-config') return call(['config'], 'GET');
    if (which === 'admin-page') return call(['index'], 'GET');

    if (which === 'admin-save') {
      const current = await call(['config'], 'GET');
      const site = current.body.site;
      site.site.tagline = 'GitHub vasitəsilə dəyişdi';
      return call(['config'], 'POST', { name: 'site', data: site });
    }

    if (which === 'admin-save-broken') {
      return call(['config'], 'POST', { name: 'site', data: { yalnis: true } });
    }

    if (which === 'admin-image') {
      return call(['images'], 'POST', {
        name: 'yoxlama-sekil.png',
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      });
    }

    if (which === 'admin-image-bad') {
      return call(['images'], 'POST', { name: 'zerer.exe', data: 'data:image/png;base64,AAAA' });
    }

    /* Vercel catch-all-ı doldurmasa nə olur? Ünvandan tanınmalıdır. */
    if (which === 'admin-config-noquery') return call(null, 'GET', null, null, '/api/admin/config');
    if (which === 'admin-page-noquery') return call(null, 'GET', null, null, '/admin');

    if (which === 'admin-integration') return call(['integration'], 'GET');
    if (which === 'admin-integration-write') return call(['integration'], 'POST', { mode: 'off' });
    if (which === 'admin-journal') return call(['reservations'], 'GET');
    if (which === 'admin-build') return call(['build'], 'POST');

    throw new Error('Naməlum hal: ' + which);
  };

  const result = await run();
  process.stdout.write('\n__RESULT__' + JSON.stringify(result) + '\n');
  process.exit(0);
}

/* ================================================================== *
 *  ANA PROSES
 * ================================================================== */

let passed = 0;
let failed = 0;

const check = (name, condition, detail) => {
  if (condition) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (detail ? '  →  ' + detail : '')); }
};

/* --- saxta rezervasiya tətbiqi --- */

const vilkaHits = [];

const vilka = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    vilkaHits.push({ path: req.url, auth: req.headers.authorization || null, body });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'VLK-SRV-' + vilkaHits.length }));
  });
});

/* --- saxta GitHub API --- */

const ghWrites = [];

const ghFile = (path) => {
  try {
    return readFileSync(join(ROOT, path));
  } catch (_) {
    return null;
  }
};

const github = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });

  req.on('end', () => {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    const json = (code, payload) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    /* Vaxtı bitmiş token — panelin buna necə davrandığı yoxlanılır */
    if (req.headers.authorization === 'Bearer bitmis-token') {
      return json(401, { message: 'Bad credentials' });
    }

    /* repo məlumatı */
    if (/^\/repos\/[^/]+\/[^/]+$/.test(path)) {
      return json(200, { permissions: { push: true, admin: true }, private: false });
    }

    const contents = path.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.*)$/);
    if (!contents) return json(404, { message: 'Not Found' });

    const filePath = contents[1];

    if (req.method === 'GET') {
      /* qovluq siyahısı */
      if (filePath === 'public/assets/images') {
        return json(200, [
          { type: 'file', name: 'hero-slider-1.jpg', size: 133000, sha: 'aaa' },
          { type: 'file', name: 'about-banner.jpg', size: 87000, sha: 'bbb' },
        ]);
      }

      const file = ghFile(filePath);
      if (!file) return json(404, { message: 'Not Found' });
      return json(200, { content: file.toString('base64'), sha: 'sha-' + filePath });
    }

    if (req.method === 'PUT') {
      ghWrites.push({ path: filePath, body: JSON.parse(body || '{}') });
      return json(200, { commit: { sha: 'commit' + ghWrites.length, html_url: 'https://example/c' } });
    }

    if (req.method === 'DELETE') {
      ghWrites.push({ path: filePath, deleted: true });
      return json(200, { commit: { sha: 'del1' } });
    }

    return json(405, { message: 'Method Not Allowed' });
  });
});

const runCase = (name, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'test-serverless.mjs')], {
      cwd: ROOT,
      env: { ...process.env, SERVERLESS_CASE: name, DATA_DIR: join(ROOT, 'data'), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });

    child.on('close', () => {
      const match = out.match(/__RESULT__(.+)/);
      if (!match) return reject(new Error('Nəticə oxunmadı (' + name + ')\n' + out + err));
      resolve({ result: JSON.parse(match[1]), stderr: err });
    });
  });

await new Promise((r) => vilka.listen(VILKA_PORT, '127.0.0.1', r));
await new Promise((r) => github.listen(GH_PORT, '127.0.0.1', r));

const GH_ENV = {
  GITHUB_API: 'http://127.0.0.1:' + GH_PORT,
  GITHUB_TOKEN: 'saxta-token',
  GITHUB_REPO: 'sahib/repo',
  GITHUB_BRANCH: 'main',
  ADMIN_USER: 'admin',
  ADMIN_PASSWORD: 'sifre',
};

console.log('\n══════════════════════════════════════════════');
console.log('  Serverless funksiyaları (Vercel)');
console.log('══════════════════════════════════════════════');

try {
  console.log('\n  REZERVASİYA\n');

  const none = await runCase('reservation-none', {
    VILKA_MODE: 'off', VILKA_API_URL: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '',
  });
  check('Kanal yoxdursa rezervasiya «qəbul olundu» sayılmır',
    none.result.status === 503, 'status ' + none.result.status);
  check('Müştəriyə telefonla əlaqə təklif olunur',
    Boolean(none.result.body && /telefon/i.test(none.result.body.error)));
  check('İtən sorğu server jurnalına yazılır', /ÇATDIRILMADI/.test(none.stderr));

  const before = vilkaHits.length;
  const ok = await runCase('reservation-ok', {
    VILKA_MODE: 'api',
    VILKA_API_URL: 'http://127.0.0.1:' + VILKA_PORT + '/reservations',
    VILKA_API_KEY: 'serverless-acar',
    VILKA_FIELD_MAP: '{"name":"guest_name"}',
    TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '',
  });
  check('Tətbiq qoşulanda rezervasiya qəbul olunur', ok.result.status === 201,
    'status ' + ok.result.status + ' ' + JSON.stringify(ok.result.body));
  check('Müştəriyə kod verilir', /^MS-\d{6}-\d{4}$/.test((ok.result.body || {}).code || ''));
  check('Sorğu tətbiqə çatdı', vilkaHits.length === before + 1);
  check('Açar göndərilir', vilkaHits[vilkaHits.length - 1].auth === 'Bearer serverless-acar');
  check('Sahə uyğunluğu işləyir', vilkaHits[vilkaHits.length - 1].body.includes('guest_name'));

  console.log('\n  PANEL (GitHub üzərindən)\n');

  const noauth = await runCase('admin-noauth', GH_ENV);
  check('Şifrəsiz giriş bağlıdır', noauth.result.status === 401, 'status ' + noauth.result.status);

  const wrong = await runCase('admin-wrongpass', GH_ENV);
  check('Yanlış şifrə rədd olunur', wrong.result.status === 401);

  const noPass = await runCase('admin-config', { ...GH_ENV, ADMIN_PASSWORD: '' });
  check('Şifrə təyin olunmayıbsa panel sönülüdür', noPass.result.status === 503);

  const page = await runCase('admin-page', GH_ENV);
  check('Panel səhifəsi verilir',
    page.result.status === 200 && String(page.result.body).includes('data-panel'),
    'status ' + page.result.status);

  /**
   * Panel Basic Auth arxasındadır: ayrıca <link>/<script> sorğuları brauzerdə
   * giriş məlumatı olmadan gedib 401 ala bilir və panel üslubsuz açılır.
   * Ona görə CSS və JS səhifənin içində gəlməlidir.
   */
  const pageBody = String(page.result.body);
  check('Panelin üslubu və skripti səhifənin içindədir',
    pageBody.includes('<style>') &&
    pageBody.includes('<script>') &&
    !pageBody.includes('href="/admin/admin.css"') &&
    !pageBody.includes('src="/admin/admin.js"'),
    (pageBody.length / 1024).toFixed(1) + ' KB');

  const cfg = await runCase('admin-config', GH_ENV);
  check('Konfiqurasiya oxunur', cfg.result.status === 200 && cfg.result.body.ok === true);
  check('Üç konfiqurasiya da gəlir',
    Boolean(cfg.result.body.site && cfg.result.body.content && cfg.result.body.theme));
  check('Quruluş «git» kimi bildirilir', cfg.result.body.capabilities.mode === 'git');
  check('Yazma icazəsi təsdiqlənir', cfg.result.body.capabilities.configWrite === true,
    JSON.stringify(cfg.result.body.capabilities));
  check('Jurnal bu quruluşda yoxdur', cfg.result.body.capabilities.journal === false);
  check('Şəkil siyahısı GitHub-dan gəlir', (cfg.result.body.images || []).length === 2);
  check('Şrift siyahısı gəlir', (cfg.result.body.fonts || []).length > 0);

  const writesBefore = ghWrites.length;
  const saved = await runCase('admin-save', GH_ENV);
  check('Dəyişiklik yadda saxlanılır', saved.result.status === 200 && saved.result.body.ok === true,
    JSON.stringify(saved.result.body).slice(0, 160));
  check('Yayım növbəyə düşür', saved.result.body.deploy === 'queued');

  const write = ghWrites[ghWrites.length - 1];
  check('GitHub-a düzgün fayl yazılır', write && write.path === 'site.config.json', write && write.path);
  check('Yazılan məzmun dəyişikliyi saxlayır',
    write && Buffer.from(write.body.content, 'base64').toString('utf8').includes('GitHub vasitəsilə dəyişdi'));
  check('Commit mesajı var', write && typeof write.body.message === 'string' && write.body.message.length > 5);
  check('Düzgün budaq göstərilir', write && write.body.branch === 'main');

  const broken = await runCase('admin-save-broken', GH_ENV);
  check('Yarımçıq konfiqurasiya rədd olunur', broken.result.status === 400);
  check('Pozuq məlumat GitHub-a yazılmır', ghWrites.length === writesBefore + 1);

  const noToken = await runCase('admin-save', { ...GH_ENV, GITHUB_TOKEN: '' });
  check('Token yoxdursa aydın xəta verilir', noToken.result.status === 503,
    'status ' + noToken.result.status);

  /* Vercel öz dəyişənlərini verəndə repo/budaq əl ilə yazılmadan tapılmalıdır */
  const VERCEL_ENV = {
    GITHUB_API: GH_ENV.GITHUB_API,
    GITHUB_TOKEN: 'saxta-token',
    ADMIN_USER: 'admin',
    ADMIN_PASSWORD: 'sifre',
    VERCEL_GIT_REPO_OWNER: 'sahib',
    VERCEL_GIT_REPO_SLUG: 'repo',
    VERCEL_GIT_COMMIT_REF: 'yayim-budagi',
  };

  const autoCaps = await runCase('admin-config', VERCEL_ENV);
  check('GITHUB_REPO olmadan repo tapılır',
    autoCaps.result.body.capabilities.repo === 'sahib/repo',
    String(autoCaps.result.body.capabilities.repo));
  check('Budaq deployment-in budağından götürülür',
    autoCaps.result.body.capabilities.branch === 'yayim-budagi',
    String(autoCaps.result.body.capabilities.branch));
  check('Mənbə «vercel» kimi işarələnir',
    autoCaps.result.body.capabilities.repoSource === 'vercel',
    String(autoCaps.result.body.capabilities.repoSource));

  const writesBeforeAuto = ghWrites.length;
  await runCase('admin-save', VERCEL_ENV);
  const autoWrite = ghWrites[ghWrites.length - 1];
  check('Yazma həmin budağa gedir',
    ghWrites.length === writesBeforeAuto + 1 && autoWrite.body.branch === 'yayim-budagi',
    autoWrite && autoWrite.body.branch);

  /* Əl ilə yazılan dəyər Vercel-inkini üstələməlidir */
  const overrideCaps = await runCase('admin-config', { ...VERCEL_ENV, GITHUB_BRANCH: 'main' });
  check('Əl ilə yazılan budaq üstələyir',
    overrideCaps.result.body.capabilities.branch === 'main',
    String(overrideCaps.result.body.capabilities.branch));

  const image = await runCase('admin-image', GH_ENV);
  check('Şəkil yüklənir', image.result.status === 201, 'status ' + image.result.status);
  check('Şəkil GitHub-a yazılır',
    ghWrites[ghWrites.length - 1].path === 'public/assets/images/yoxlama-sekil.png',
    ghWrites[ghWrites.length - 1].path);

  const badImage = await runCase('admin-image-bad', GH_ENV);
  check('Yanlış format rədd olunur', badImage.result.status === 400);

  const integration = await runCase('admin-integration', { ...GH_ENV, VILKA_MODE: 'off' });
  check('Bağlantı parametrləri oxunur', integration.result.status === 200);
  check('Parametrlər yalnız oxunur kimi işarələnir', integration.result.body.readOnly === true);

  const intWrite = await runCase('admin-integration-write', GH_ENV);
  check('Parametrləri paneldən dəyişmək bağlıdır', intWrite.result.status === 400);
  check('Harada dəyişiləcəyi izah olunur',
    /Environment Variables/.test((intWrite.result.body || {}).error || ''));

  const journal = await runCase('admin-journal', GH_ENV);
  check('Jurnal boş qaytarılır və izah verilir',
    journal.result.status === 200 && journal.result.body.reservations.length === 0 &&
    Boolean(journal.result.body.note));

  const build = await runCase('admin-build', GH_ENV);
  check('Yığma düyməsi izahla cavab verir',
    build.result.status === 200 && /Vercel/.test(build.result.body.log || ''));

  /* ---------------------------------------------------------------- *
   *  GitHub əlçatmaz olanda panel AÇILMALIDIR.
   *
   *  Əvvəl bu hal 500 qaytarırdı: panel boş açılır, heç bir düymə
   *  cavab vermirdi. İndi bundle-dakı nüsxə göstərilir, yazma isə
   *  bağlanır və səbəb «error» sahəsində izah olunur.
   * ---------------------------------------------------------------- */

  console.log('\n  GITHUB DÜŞƏNDƏ PANEL\n');

  const offline = await runCase('admin-config', { ...GH_ENV, GITHUB_API: 'http://127.0.0.1:1' });
  check('GitHub əlçatmaz olsa da panel açılır',
    offline.result.status === 200 && offline.result.body.ok === true,
    'status ' + offline.result.status);
  check('Konfiqurasiya bundle-dan göstərilir',
    Boolean(offline.result.body.site && offline.result.body.content && offline.result.body.theme));
  check('Məlumatın köhnə ola biləcəyi bildirilir',
    offline.result.body.capabilities.stale === true);
  check('Yazma bağlanır — səhv dəyişiklik itməsin',
    offline.result.body.capabilities.configWrite === false &&
    offline.result.body.capabilities.imageWrite === false);
  check('Səbəb izah olunur',
    typeof offline.result.body.capabilities.error === 'string' &&
    offline.result.body.capabilities.error.length > 10,
    String(offline.result.body.capabilities.error));

  /* ---------------------------------------------------------------- *
   *  Ünvanın tanınması.
   *
   *  req.query.path boş gələndə route boş qalır və handler HƏR sorğuya
   *  panel səhifəsini qaytarırdı — /api/admin/config-a da. Panel JSON
   *  gözlədiyi üçün heç açılmırdı. İndi ünvanın özündən tanınır.
   * ---------------------------------------------------------------- */

  const noQuery = await runCase('admin-config-noquery', GH_ENV);
  check('Catch-all boş gəlsə ünvandan tanınır',
    noQuery.result.status === 200 && noQuery.result.body && noQuery.result.body.ok === true,
    typeof noQuery.result.body === 'string'
      ? 'HTML qaytardı: ' + noQuery.result.body.slice(0, 60)
      : 'status ' + noQuery.result.status);
  check('Konfiqurasiya JSON kimi gəlir — HTML deyil',
    Boolean(noQuery.result.body && noQuery.result.body.site));

  const pageNoQuery = await runCase('admin-page-noquery', GH_ENV);
  check('/admin hələ də panel səhifəsini verir',
    pageNoQuery.result.status === 200 &&
    typeof pageNoQuery.result.body === 'string' &&
    pageNoQuery.result.body.includes('<!DOCTYPE html>'));

  const expired = await runCase('admin-config', { ...GH_ENV, GITHUB_TOKEN: 'bitmis-token' });
  check('Token bitəndə də panel açılır',
    expired.result.status === 200 && expired.result.body.ok === true,
    'status ' + expired.result.status);
  check('Token-in bitdiyi aydın deyilir',
    /GITHUB_TOKEN/.test(expired.result.body.capabilities.error || ''),
    String(expired.result.body.capabilities.error));

} catch (err) {
  failed++;
  console.error('\n  Yoxlama zamanı xəta:', err.message);
}

vilka.close();
github.close();

console.log('\n──────────────────────────────────────────────');
console.log('  Uğurlu: ' + passed + '   Uğursuz: ' + failed);
console.log('──────────────────────────────────────────────\n');

process.exit(failed ? 1 : 0);
