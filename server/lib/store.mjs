/**
 * Sadə fayl əsaslı anbar (JSONL).
 * Restoran həcmi üçün kifayətdir, heç bir verilənlər bazası tələb etmir.
 */

import { appendFile, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.mjs';

const RESERVATIONS = join(config.dataDir, 'reservations.jsonl');
const NEWSLETTER = join(config.dataDir, 'newsletter.jsonl');

/* Eyni anda yazılışın qarşısını alan sadə növbə */
let chain = Promise.resolve();
const withLock = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.then(() => undefined, () => undefined);
  return run;
};

const ensureDir = async () => {
  if (!existsSync(config.dataDir)) await mkdir(config.dataDir, { recursive: true });
};

const readLines = async (file) => {
  if (!existsSync(file)) return [];
  const raw = await readFile(file, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
};

/* --- Rezervasiya kodu: MS-YYMMDD-XXXX --- */

export const makeCode = (date = new Date()) => {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `MS-${yy}${mm}${dd}-${rand}`;
};

export const createReservation = async (fields) =>
  withLock(async () => {
    await ensureDir();

    const record = {
      id: randomUUID(),
      code: makeCode(),
      createdAt: new Date().toISOString(),
      status: 'new', // new | confirmed | cancelled
      delivery: {
        status: 'pending', // pending | sent | failed | skipped
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        reference: null,
      },
      ...fields,
    };

    await appendFile(RESERVATIONS, JSON.stringify(record) + '\n', 'utf8');
    return record;
  });

export const listReservations = async () => readLines(RESERVATIONS);

export const findReservation = async (id) => {
  const all = await readLines(RESERVATIONS);
  return all.find((r) => r.id === id || r.code === id) || null;
};

/** Qeydi yeniləyir (bütün faylı təhlükəsiz şəkildə yenidən yazır). */
export const updateReservation = async (id, patch) =>
  withLock(async () => {
    await ensureDir();
    const all = await readLines(RESERVATIONS);

    let updated = null;
    const next = all.map((r) => {
      if (r.id !== id) return r;
      updated = {
        ...r,
        ...patch,
        delivery: patch.delivery ? { ...r.delivery, ...patch.delivery } : r.delivery,
      };
      return updated;
    });

    if (!updated) return null;

    const tmp = RESERVATIONS + '.tmp';
    await writeFile(tmp, next.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    await rename(tmp, RESERVATIONS);

    return updated;
  });

/** Çatdırılmamış rezervasiyalar (təkrar cəhd üçün) */
export const pendingDeliveries = async (maxAttempts) => {
  const all = await readLines(RESERVATIONS);
  return all.filter(
    (r) =>
      r.delivery &&
      (r.delivery.status === 'pending' || r.delivery.status === 'failed') &&
      (r.delivery.attempts || 0) < maxAttempts &&
      r.status !== 'cancelled'
  );
};

/** Son 1 saatda həmin IP-dən neçə rezervasiya gəlib */
export const countRecentByIp = async (ip, windowMs) => {
  if (!ip) return 0;
  const since = Date.now() - windowMs;
  const all = await readLines(RESERVATIONS);
  return all.filter((r) => r.ip === ip && new Date(r.createdAt).getTime() >= since).length;
};

export const addNewsletter = async (email, ip) =>
  withLock(async () => {
    await ensureDir();
    const all = await readLines(NEWSLETTER);
    if (all.some((e) => e.email.toLowerCase() === email.toLowerCase())) return { duplicate: true };

    await appendFile(
      NEWSLETTER,
      JSON.stringify({ email, ip, createdAt: new Date().toISOString() }) + '\n',
      'utf8'
    );
    return { duplicate: false };
  });
