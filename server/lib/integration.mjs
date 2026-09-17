/**
 * Rezervasiya sisteminin (Vilka) bağlantı parametrləri.
 *
 * İki mənbə var:
 *   1. .env faylı — server qurulanda təyin olunur
 *   2. data/integration.json — admin paneldən yazılır və .env-i üstələyir
 *
 * Açar heç vaxt git-ə düşmür: data/ qovluğu .gitignore-dadır və fayl
 * yalnız sahibinin oxuya biləcəyi icazə ilə yazılır (0600).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.mjs';

const FILE = join(config.dataDir, 'integration.json');

/** Paneldən dəyişdirilə bilən sahələr */
const FIELDS = [
  'mode',
  'apiUrl',
  'apiKey',
  'authHeader',
  'authScheme',
  'restaurantId',
  'fieldMap',
  'extraFields',
  'timeoutMs',
  'maxAttempts',
  'retryEveryMs',
];

const MODES = ['off', 'api', 'webhook'];

let cache = null;

const readFile = () => {
  if (cache) return cache;
  if (!existsSync(FILE)) { cache = {}; return cache; }
  try {
    cache = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch (_) {
    console.warn('[integration] data/integration.json oxunmadı, .env dəyərləri istifadə olunur.');
    cache = {};
  }
  return cache;
};

/** Serverdə istifadə olunan real parametrlər */
export const getVilka = () => {
  const stored = readFile();
  const merged = { ...config.vilka };

  for (const key of FIELDS) {
    const value = stored[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    merged[key] = value;
  }

  if (!MODES.includes(merged.mode)) merged.mode = 'off';
  return merged;
};

export const vilkaEnabled = () => {
  const mode = getVilka().mode;
  return mode === 'api' || mode === 'webhook';
};

/** Panelə göndərilən versiya — açar gizlədilir */
export const maskedVilka = () => {
  const vilka = getVilka();
  const stored = readFile();

  return {
    mode: vilka.mode,
    apiUrl: vilka.apiUrl || '',
    apiKeySet: Boolean(vilka.apiKey),
    apiKeyHint: vilka.apiKey ? '••••' + String(vilka.apiKey).slice(-4) : '',
    authHeader: vilka.authHeader || 'Authorization',
    authScheme: vilka.authScheme === undefined ? 'Bearer' : vilka.authScheme,
    restaurantId: vilka.restaurantId || '',
    fieldMap: vilka.fieldMap || {},
    extraFields: vilka.extraFields || {},
    timeoutMs: vilka.timeoutMs || 15000,
    maxAttempts: vilka.maxAttempts || 4,
    retryEveryMs: vilka.retryEveryMs || 300000,
    source: Object.keys(stored).length ? 'panel' : 'env',
  };
};

const writeFileSafe = (data) => {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  try { chmodSync(tmp, 0o600); } catch (_) { /* bəzi fayl sistemlərində dəstəklənmir */ }
  renameSync(tmp, FILE);
  cache = data;
};

/**
 * Paneldən gələn dəyişiklikləri yadda saxlayır.
 * apiKey boş gəlirsə köhnə açar saxlanılır (panel açarı göstərmir).
 */
export const saveVilka = (input) => {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Məlumat düzgün deyil.' };
  }

  const mode = String(input.mode || 'off');
  if (!MODES.includes(mode)) {
    return { ok: false, error: 'Rejim yalnız off, api və ya webhook ola bilər.' };
  }

  const apiUrl = String(input.apiUrl || '').trim();
  if (mode !== 'off') {
    if (!apiUrl) return { ok: false, error: 'Rejim seçilibsə, API ünvanı mütləqdir.' };
    if (!/^https?:\/\//i.test(apiUrl)) {
      return { ok: false, error: 'API ünvanı http:// və ya https:// ilə başlamalıdır.' };
    }
  }

  const parseJsonField = (value, label) => {
    if (value === undefined || value === null || value === '') return {};
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('obyekt deyil');
      return parsed;
    } catch (_) {
      throw new Error(label + ' düzgün JSON deyil. Nümunə: {"name":"guest_name"}');
    }
  };

  let fieldMap;
  let extraFields;
  try {
    fieldMap = parseJsonField(input.fieldMap, 'Sahə uyğunluğu');
    extraFields = parseJsonField(input.extraFields, 'Əlavə sahələr');
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const previous = readFile();
  const apiKey = String(input.apiKey || '').trim();

  const next = {
    mode,
    apiUrl,
    apiKey: apiKey || previous.apiKey || config.vilka.apiKey || '',
    authHeader: String(input.authHeader || 'Authorization').trim() || 'Authorization',
    authScheme: input.authScheme === undefined ? 'Bearer' : String(input.authScheme).trim(),
    restaurantId: String(input.restaurantId || '').trim(),
    fieldMap,
    extraFields,
    timeoutMs: Math.min(Math.max(Number(input.timeoutMs) || 15000, 2000), 60000),
    maxAttempts: Math.min(Math.max(Number(input.maxAttempts) || 4, 1), 20),
    retryEveryMs: Math.min(Math.max(Number(input.retryEveryMs) || 300000, 30000), 3600000),
  };

  if (input.clearKey === true) next.apiKey = '';

  writeFileSafe(next);
  return { ok: true, settings: maskedVilka() };
};
