/**
 * İdarəetmə paneli — Vercel variantı.
 *
 * Vercel-də disk yalnız oxunur, ona görə panel dəyişikliyi GitHub repoya
 * commit edir. Vercel push-u görüb saytı özü yenidən yığır (1–2 dəqiqə).
 *
 * Tələb olunan mühit dəyişənləri:
 *   ADMIN_USER, ADMIN_PASSWORD   — panelə giriş
 *   GITHUB_TOKEN, GITHUB_REPO    — dəyişikliyin yazılması
 *   GITHUB_BRANCH                — standart: main
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { ghEnabled, ghGetJson, ghGetFile, ghPutFile, ghDeleteFile, ghListDir, ghCheck, ghConfig } from '../../server/lib/github.mjs';
import { maskedVilka } from '../../server/lib/integration.mjs';
import { vilkaStatus, previewPayload, sendTest } from '../../server/lib/vilka.mjs';

/* ------------------------------------------------------------------ *
 *  Fayl tapma (bundle daxilində)
 * ------------------------------------------------------------------ */

const ROOTS = [
  process.cwd(),
  join(process.cwd(), '..'),
  fileURLToPath(new URL('../../', import.meta.url)),
];

const findFile = (relative) => {
  for (const root of ROOTS) {
    const candidate = join(root, relative);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

const readLocal = (relative) => {
  const path = findFile(relative);
  return path ? readFileSync(path) : null;
};

/* ------------------------------------------------------------------ *
 *  Giriş
 * ------------------------------------------------------------------ */

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

const requireAdmin = (req, res) => {
  const user = (process.env.ADMIN_USER || 'admin').trim();
  const password = (process.env.ADMIN_PASSWORD || '').trim();

  if (!password) {
    res.status(503).json({
      ok: false,
      error: 'Panel sönülüdür. Vercel → Settings → Environment Variables bölməsində ADMIN_PASSWORD təyin edin.',
    });
    return false;
  }

  const header = req.headers.authorization || '';
  const unauthorized = () => {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin", charset="UTF-8"');
    res.status(401).send('Giriş tələb olunur.');
    return false;
  };

  if (!header.startsWith('Basic ')) return unauthorized();

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const index = decoded.indexOf(':');

  if (!safeEqual(decoded.slice(0, index), user) || !safeEqual(decoded.slice(index + 1), password)) {
    return unauthorized();
  }

  return true;
};

/* ------------------------------------------------------------------ *
 *  Konfiqurasiya oxunması — GitHub varsa oradan (həmişə təzə)
 * ------------------------------------------------------------------ */

const CONFIG_FILES = {
  site: 'site.config.json',
  content: 'content.config.json',
  theme: 'theme.config.json',
};

const REQUIRED_KEYS = {
  site: ['site', 'contact', 'hours', 'social', 'reservation', 'footer'],
  content: ['hero', 'menu', 'gallery', 'pages'],
  theme: ['colors', 'fonts', 'layout', 'logo'],
};

const readConfig = async (name) => {
  const file = CONFIG_FILES[name];

  if (ghEnabled()) {
    const remote = await ghGetJson(file);
    if (remote) return remote;
  }

  const local = readLocal(file);
  if (!local) throw new Error(file + ' tapılmadı.');
  return JSON.parse(local.toString('utf8'));
};

const listImages = async () => {
  const dir = 'public/assets/images';

  if (ghEnabled()) {
    const files = await ghListDir(dir);
    return files
      .filter((f) => /\.(jpe?g|png|webp|svg|avif)$/i.test(f.name))
      .map((f) => ({ name: f.name, size: f.size, modified: null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return [];
};

const listFonts = async () => {
  let raw = null;

  if (ghEnabled()) {
    const file = await ghGetFile('public/assets/css/fonts.css');
    if (file) raw = file.buffer.toString('utf8');
  }

  if (!raw) {
    const local = readLocal('public/assets/css/fonts.css');
    if (local) raw = local.toString('utf8');
  }

  if (!raw) return [];

  const names = new Set();
  for (const match of raw.matchAll(/font-family:\s*'([^']+)'/g)) names.add(match[1]);
  return [...names].sort();
};

/* ------------------------------------------------------------------ *
 *  Şəkil adının təhlükəsizliyi
 * ------------------------------------------------------------------ */

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.avif'];

const safeImageName = (raw) => {
  const name = String(raw || '')
    .split(/[/\\]/)
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '');

  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot);

  if (!ALLOWED_EXT.includes(ext)) return null;
  if (name.length < 5 || name.length > 80) return null;
  return name;
};

const sanitizeSvg = (text) =>
  text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');

/* ------------------------------------------------------------------ *
 *  Gövdənin oxunması
 * ------------------------------------------------------------------ */

const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw new Error('too-large');
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

/* ------------------------------------------------------------------ *
 *  Əsas
 * ------------------------------------------------------------------ */

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

/**
 * Panelin CSS və JS-i səhifənin içinə yerləşdirilir.
 *
 * Panel Basic Auth arxasındadır. Ayrıca <link> və <script> sorğuları
 * brauzerdə giriş məlumatı olmadan gedib 401 ala bilir — o zaman brauzer
 * ikinci dəfə şifrə soruşmur, sadəcə səssizcə buraxır və panel üslubsuz,
 * işləməz açılır. Tək cavab bu ehtimalı tamamilə aradan qaldırır.
 *
 * /admin/admin.css və /admin/admin.js ünvanları öz yerində qalır.
 */
const inlineAssets = (html) => {
  const css = readLocal('server/admin/admin.css');
  const js = readLocal('server/admin/admin.js');

  /* Əvəzləyici funksiyadır: fayldakı «$&» kimi ardıcıllıqlar olduğu kimi qalsın */
  return html
    .replace('<link rel="stylesheet" href="/admin/admin.css">', () =>
      css ? '<style>\n' + css.toString('utf8').replace(/<\/style/gi, '<\\/style') + '\n</style>' : ''
    )
    .replace('<script src="/admin/admin.js"></script>', () =>
      js ? '<script>\n' + js.toString('utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>' : ''
    );
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!requireAdmin(req, res)) return;

  const segments = [].concat(req.query.path || []);
  const route = segments.join('/');

  try {
    /* ---------- Panelin öz faylları ---------- */

    if (route === 'index' || route === '') {
      const html = readLocal('server/admin/index.html');
      if (!html) return res.status(500).send('Panel faylları tapılmadı.');
      res.setHeader('Content-Type', MIME['.html']);
      return res.status(200).send(inlineAssets(html.toString('utf8')));
    }

    if (route === 'admin.css' || route === 'admin.js') {
      const file = readLocal('server/admin/' + route);
      if (!file) return res.status(404).send('Tapılmadı.');
      res.setHeader('Content-Type', route.endsWith('.css') ? MIME['.css'] : MIME['.js']);
      return res.status(200).send(file.toString('utf8'));
    }

    /* ---------- Konfiqurasiya ---------- */

    if (route === 'config' && req.method === 'GET') {
      const [site, content, theme, images, fonts, gh] = await Promise.all([
        readConfig('site'),
        readConfig('content'),
        readConfig('theme'),
        listImages(),
        listFonts(),
        ghCheck(),
      ]);

      return res.status(200).json({
        ok: true,
        site,
        content,
        theme,
        images,
        fonts,
        site_url: process.env.SITE_URL || '',
        capabilities: {
          mode: 'git',
          build: false,
          journal: false,
          integrationWrite: false,
          imageWrite: gh.ok,
          configWrite: gh.ok,
          repo: gh.ok ? gh.repo : null,
          branch: gh.ok ? gh.branch : null,
          repoSource: ghConfig().source,
          error: gh.ok ? null : gh.error,
        },
      });
    }

    if (route === 'config' && req.method === 'POST') {
      if (!ghEnabled()) {
        return res.status(503).json({
          ok: false,
          error: 'Dəyişikliyi yadda saxlamaq üçün Vercel-də GITHUB_TOKEN təyin olunmalıdır.',
        });
      }

      const body = await readBody(req);
      const name = body.name;
      const data = body.data;

      if (!CONFIG_FILES[name]) {
        return res.status(400).json({ ok: false, error: 'Naməlum bölmə.' });
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return res.status(400).json({ ok: false, error: 'Məlumat düzgün deyil.' });
      }

      const missing = (REQUIRED_KEYS[name] || []).filter((key) => !(key in data));
      if (missing.length) {
        return res.status(400).json({ ok: false, error: 'Bu açarlar çatışmır: ' + missing.join(', ') });
      }

      const commit = await ghPutFile(
        CONFIG_FILES[name],
        Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8'),
        'Panel: ' + CONFIG_FILES[name] + ' yeniləndi'
      );

      return res.status(200).json({
        ok: true,
        deploy: 'queued',
        commit: commit.sha,
        log: 'Dəyişiklik repoya yazıldı (' + String(commit.sha || '').slice(0, 7) + ').\n' +
          'Vercel saytı 1–2 dəqiqəyə yenidən yığacaq.',
      });
    }

    /* ---------- Şəkillər ---------- */

    if (route === 'images' && req.method === 'GET') {
      return res.status(200).json({ ok: true, images: await listImages() });
    }

    if (route === 'images' && req.method === 'POST') {
      if (!ghEnabled()) {
        return res.status(503).json({ ok: false, error: 'GITHUB_TOKEN təyin olunmayıb.' });
      }

      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        const tooLarge = err && err.message === 'too-large';
        return res.status(tooLarge ? 413 : 400).json({
          ok: false,
          error: tooLarge ? 'Şəkil çox böyükdür (maksimum 8 MB).' : 'Fayl oxunmadı.',
        });
      }

      const name = safeImageName(body.name);
      if (!name) {
        return res.status(400).json({ ok: false, error: 'Fayl adı və ya formatı uyğun deyil.' });
      }

      const match = String(body.data || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
      if (!match) return res.status(400).json({ ok: false, error: 'Fayl oxunmadı.' });

      let buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 8 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'Şəkil çox böyükdür (maksimum 8 MB).' });
      }

      if (name.endsWith('.svg')) {
        buffer = Buffer.from(sanitizeSvg(buffer.toString('utf8')), 'utf8');
      }

      await ghPutFile('public/assets/images/' + name, buffer, 'Panel: ' + name + ' yükləndi');

      return res.status(201).json({ ok: true, name, images: await listImages(), deploy: 'queued' });
    }

    if (route === 'images/delete' && req.method === 'POST') {
      if (!ghEnabled()) {
        return res.status(503).json({ ok: false, error: 'GITHUB_TOKEN təyin olunmayıb.' });
      }

      const body = await readBody(req);
      const name = safeImageName(body.name);
      if (!name) return res.status(400).json({ ok: false, error: 'Fayl adı uyğun deyil.' });

      /* İstifadədədirsə silmirik */
      const [site, content, theme] = await Promise.all([
        readConfig('site'),
        readConfig('content'),
        readConfig('theme'),
      ]);

      const used = [site, content, theme].some((cfg) => JSON.stringify(cfg).includes('"' + name + '"'));
      if (used) {
        return res.status(400).json({ ok: false, error: 'Bu şəkil hələ istifadədədir.' });
      }

      await ghDeleteFile('public/assets/images/' + name, 'Panel: ' + name + ' silindi');
      return res.status(200).json({ ok: true, images: await listImages(), deploy: 'queued' });
    }

    /* ---------- Rezervasiya sistemi ---------- */

    if (route === 'integration' && req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        settings: { ...maskedVilka(), source: 'env' },
        status: vilkaStatus(),
        readOnly: true,
      });
    }

    if (route === 'integration' && req.method === 'POST') {
      return res.status(400).json({
        ok: false,
        error:
          'Bu saytda bağlantı parametrləri Vercel-in mühit dəyişənlərindən oxunur. ' +
          'Dəyişmək üçün: Vercel → Settings → Environment Variables (VILKA_MODE, VILKA_API_URL, VILKA_API_KEY).',
      });
    }

    if (route === 'integration/preview' && req.method === 'GET') {
      return res.status(200).json({ ok: true, preview: previewPayload() });
    }

    if (route === 'integration/test' && req.method === 'POST') {
      const result = await sendTest();
      return res.status(result.ok ? 200 : 400).json(result);
    }

    /* ---------- Bu quruluşda mövcud olmayanlar ---------- */

    if (route === 'reservations' && req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        total: 0,
        reservations: [],
        vilka: vilkaStatus(),
        telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
        note: 'Bu saytda rezervasiya jurnalı saxlanılmır — sorğular birbaşa rezervasiya tətbiqinə və Telegram-a gedir.',
      });
    }

    if (route === 'build' && req.method === 'POST') {
      return res.status(200).json({
        ok: true,
        log: 'Bu saytda ayrıca yığma lazım deyil — hər dəyişiklik repoya yazılan kimi Vercel saytı özü yeniləyir.',
      });
    }

    return res.status(404).json({ ok: false, error: 'Tapılmadı.' });
  } catch (err) {
    console.error('[admin]', err);
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };
