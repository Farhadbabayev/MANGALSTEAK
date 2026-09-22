/**
 * Məzmun idarəetməsi — admin panelin arxa tərəfi.
 *
 * Konfiqurasiya fayllarını oxuyur/yazır, şəkilləri idarə edir və
 * saytı yenidən yığır. Yazmadan əvvəl ehtiyat nüsxə götürülür;
 * build uğursuz olarsa əvvəlki vəziyyət geri qaytarılır.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, mkdirSync, renameSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { ROOT } from './config.mjs';
import { MENU_DIR, MAX_PDF_BYTES, menuFileName, checkSlot, parsePdf, menuMatrix } from './menus.mjs';

const CONFIG_FILES = {
  site: 'site.config.json',
  content: 'content.config.json',
  theme: 'theme.config.json',
  i18n: 'i18n.config.json',
};

/** Hər konfiqurasiyada mütləq olmalı olan açarlar (səhv yazılışdan qoruyur) */
const REQUIRED_KEYS = {
  site: ['site', 'contact', 'hours', 'social', 'reservation', 'footer'],
  content: ['hero', 'menu', 'gallery', 'pages'],
  theme: ['colors', 'fonts', 'layout', 'logo'],
  i18n: [],
};

const IMAGE_DIR = join(ROOT, 'public', 'assets', 'images');
const BACKUP_DIR = join(ROOT, 'data', 'backups');

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.avif'];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/* ------------------------------------------------------------------ *
 *  Konfiqurasiya
 * ------------------------------------------------------------------ */

const configPath = (name) => {
  const file = CONFIG_FILES[name];
  if (!file) throw new Error('Naməlum konfiqurasiya: ' + name);
  return join(ROOT, file);
};

export const readConfig = (name) => {
  const path = configPath(name);
  /* Tərcümə faylı hələ yoxdursa boş sayılır */
  if (name === 'i18n' && !existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
};

export const readAllConfigs = () => ({
  site: readConfig('site'),
  content: readConfig('content'),
  theme: readConfig('theme'),
  i18n: readConfig('i18n'),
});

const backup = (name) => {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(BACKUP_DIR, `${name}-${stamp}.json`);
  writeFileSync(target, existsSync(configPath(name)) ? readFileSync(configPath(name)) : '{}\n');

  /* Son 30 nüsxəni saxlayırıq */
  const old = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(name + '-'))
    .sort()
    .slice(0, -30);
  for (const file of old) {
    try { unlinkSync(join(BACKUP_DIR, file)); } catch (_) { /* nəzərə alınmır */ }
  }

  return target;
};

const writeJson = (path, data) => {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
};

/**
 * Konfiqurasiyanı yadda saxlayır və saytı yenidən yığır.
 * Build uğursuz olarsa köhnə fayl geri qaytarılır.
 */
export const saveConfig = async (name, data) => {
  if (!CONFIG_FILES[name]) return { ok: false, error: 'Naməlum bölmə.' };

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Məlumat düzgün deyil.' };
  }

  const missing = (REQUIRED_KEYS[name] || []).filter((key) => !(key in data));
  if (missing.length) {
    return { ok: false, error: 'Bu açarlar çatışmır: ' + missing.join(', ') };
  }

  const path = configPath(name);
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : '{}\n';
  const backupPath = backup(name);

  writeJson(path, data);

  const result = await runBuild();

  if (!result.ok) {
    writeFileSync(path, previous, 'utf8');
    await runBuild();
    return { ok: false, error: 'Dəyişiklik tətbiq olunmadı: ' + result.error, log: result.log };
  }

  return { ok: true, backup: basename(backupPath), log: result.log };
};

/* ------------------------------------------------------------------ *
 *  Saytın yığılması
 * ------------------------------------------------------------------ */

export const runBuild = () =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      [join(ROOT, 'scripts', 'build.mjs')],
      { cwd: ROOT, timeout: 60000 },
      (err, stdout, stderr) => {
        const log = (stdout || '') + (stderr || '');
        if (err) {
          resolve({ ok: false, error: (stderr || err.message).trim().slice(0, 500), log });
        } else {
          resolve({ ok: true, log });
        }
      }
    );
  });

/* ------------------------------------------------------------------ *
 *  Şəkillər
 * ------------------------------------------------------------------ */

const safeImageName = (raw) => {
  const name = basename(String(raw || ''))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '');

  const ext = extname(name);
  if (!ALLOWED_EXT.includes(ext)) return null;
  if (name.length < 5 || name.length > 80) return null;
  return name;
};

/** SVG-dən skript və hadisə atributlarını təmizləyir */
const sanitizeSvg = (text) =>
  text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');

export const listImages = () => {
  if (!existsSync(IMAGE_DIR)) return [];

  return readdirSync(IMAGE_DIR)
    .filter((f) => ALLOWED_EXT.includes(extname(f).toLowerCase()))
    .map((f) => {
      const stats = statSync(join(IMAGE_DIR, f));
      return { name: f, size: stats.size, modified: stats.mtime.toISOString() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Şəkilin konfiqurasiyalarda harada işləndiyini tapır */
export const imageUsage = (name) => {
  const used = [];
  for (const key of Object.keys(CONFIG_FILES)) {
    if (!existsSync(configPath(key))) continue;
    const raw = readFileSync(configPath(key), 'utf8');
    if (raw.includes('"' + name + '"')) used.push(CONFIG_FILES[key]);
  }

  for (const file of readdirSync(join(ROOT, 'src', 'pages'))) {
    const raw = readFileSync(join(ROOT, 'src', 'pages', file), 'utf8');
    if (raw.includes(name)) used.push('src/pages/' + file);
  }

  return used;
};

export const saveImage = (rawName, dataUrl) => {
  const name = safeImageName(rawName);
  if (!name) {
    return { ok: false, error: 'Fayl adı və ya formatı uyğun deyil (jpg, png, webp, svg, avif).' };
  }

  const match = String(dataUrl || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) return { ok: false, error: 'Fayl oxunmadı.' };

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Şəkil çox böyükdür (maksimum 8 MB).' };
  }

  if (!existsSync(IMAGE_DIR)) mkdirSync(IMAGE_DIR, { recursive: true });

  if (extname(name) === '.svg') {
    writeFileSync(join(IMAGE_DIR, name), sanitizeSvg(buffer.toString('utf8')), 'utf8');
  } else {
    writeFileSync(join(IMAGE_DIR, name), buffer);
  }

  return { ok: true, name, size: buffer.length };
};

export const deleteImage = (rawName) => {
  const name = safeImageName(rawName);
  if (!name) return { ok: false, error: 'Fayl adı uyğun deyil.' };

  const path = join(IMAGE_DIR, name);
  if (!existsSync(path)) return { ok: false, error: 'Şəkil tapılmadı.' };

  const used = imageUsage(name);
  if (used.length) {
    return { ok: false, error: 'Bu şəkil hələ istifadədədir: ' + used.join(', ') };
  }

  unlinkSync(path);
  return { ok: true };
};

/* ------------------------------------------------------------------ *
 *  Mövcud şriftlər
 * ------------------------------------------------------------------ */

export const listFonts = () => {
  const path = join(ROOT, 'public', 'assets', 'css', 'fonts.css');
  if (!existsSync(path)) return [];

  const raw = readFileSync(path, 'utf8');
  const names = new Set();
  for (const match of raw.matchAll(/font-family:\s*'([^']+)'/g)) names.add(match[1]);
  return [...names].sort();
};

/* ------------------------------------------------------------------ *
 *  Zalların PDF menyuları
 * ------------------------------------------------------------------ */

const MENU_PATH = join(ROOT, ...MENU_DIR.split('/'));

const menuFiles = () => {
  if (!existsSync(MENU_PATH)) return [];
  return readdirSync(MENU_PATH)
    .filter((f) => f.endsWith('.pdf'))
    .map((f) => ({ name: f, size: statSync(join(MENU_PATH, f)).size }));
};

export const listMenus = () => menuMatrix(readConfig('site'), readConfig('content'), menuFiles());

/** PDF-i yazır və saytı yenidən yığır — düymələr dərhal görünsün */
export const saveMenu = async (hall, lang, dataUrl) => {
  const invalid = checkSlot(hall, lang, readConfig('site'), readConfig('content'));
  if (invalid) return { ok: false, error: invalid };

  const pdf = parsePdf(dataUrl, MAX_PDF_BYTES);
  if (!pdf.ok) return pdf;

  if (!existsSync(MENU_PATH)) mkdirSync(MENU_PATH, { recursive: true });
  writeFileSync(join(MENU_PATH, menuFileName(hall, lang)), pdf.buffer);

  const build = await runBuild();
  return { ok: true, name: menuFileName(hall, lang), size: pdf.buffer.length, log: build.log, menus: listMenus() };
};

export const deleteMenu = async (hall, lang) => {
  const invalid = checkSlot(hall, lang, readConfig('site'), readConfig('content'));
  if (invalid) return { ok: false, error: invalid };

  const path = join(MENU_PATH, menuFileName(hall, lang));
  if (!existsSync(path)) return { ok: false, error: 'Menyu tapılmadı.' };

  unlinkSync(path);
  const build = await runBuild();
  return { ok: true, log: build.log, menus: listMenus() };
};
