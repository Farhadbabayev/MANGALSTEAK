/**
 * GitHub Contents API — Vercel kimi «yalnız oxunan» hostinqlərdə
 * idarəetmə panelinin yaddaşı.
 *
 * Panel faylı birbaşa diskə yaza bilmədiyi üçün dəyişikliyi repoya commit edir;
 * Vercel isə push-u görüb saytı özü yenidən yığır.
 *
 * Mühit dəyişənləri:
 *   GITHUB_TOKEN   — fine-grained token, «Contents: Read and write» icazəsi ilə
 *   GITHUB_REPO    — sahib/repo   (məs. Farhadbabayev/MANGALSTEAK)
 *   GITHUB_BRANCH  — hansı budağa yazılsın (standart: main)
 */

/* Sınaq üçün başqa ünvana yönləndirmək olar */
const API = (process.env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');

export const ghConfig = () => {
  const repo = (process.env.GITHUB_REPO || '').trim();
  const [owner, name] = repo.split('/');

  return {
    token: (process.env.GITHUB_TOKEN || '').trim(),
    owner: owner || '',
    name: name || '',
    branch: (process.env.GITHUB_BRANCH || 'main').trim(),
  };
};

export const ghEnabled = () => {
  const { token, owner, name } = ghConfig();
  return Boolean(token && owner && name);
};

const request = async (method, path, body) => {
  const { token } = ghConfig();

  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'restaurant-site-admin',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    /* JSON deyil */
  }

  if (!response.ok) {
    const message = (payload && payload.message) || ('HTTP ' + response.status);
    const error = new Error('GitHub: ' + message);
    error.status = response.status;
    throw error;
  }

  return payload;
};

const contentsPath = (filePath) => {
  const { owner, name } = ghConfig();
  return '/repos/' + owner + '/' + name + '/contents/' + filePath.split('/').map(encodeURIComponent).join('/');
};

/** Faylı oxuyur. Yoxdursa null qaytarır. */
export const ghGetFile = async (filePath) => {
  const { branch } = ghConfig();

  try {
    const data = await request('GET', contentsPath(filePath) + '?ref=' + encodeURIComponent(branch));
    if (!data || Array.isArray(data) || !data.content) return null;
    return { buffer: Buffer.from(data.content, 'base64'), sha: data.sha };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
};

export const ghGetJson = async (filePath) => {
  const file = await ghGetFile(filePath);
  if (!file) return null;
  return JSON.parse(file.buffer.toString('utf8'));
};

/** Faylı yazır (varsa üstünə). Commit qaytarır. */
export const ghPutFile = async (filePath, buffer, message) => {
  const { branch } = ghConfig();
  const existing = await ghGetFile(filePath);

  const data = await request('PUT', contentsPath(filePath), {
    message,
    content: Buffer.from(buffer).toString('base64'),
    branch,
    ...(existing ? { sha: existing.sha } : {}),
  });

  return {
    sha: data && data.commit ? data.commit.sha : null,
    url: data && data.commit ? data.commit.html_url : null,
  };
};

export const ghDeleteFile = async (filePath, message) => {
  const { branch } = ghConfig();
  const existing = await ghGetFile(filePath);
  if (!existing) return { deleted: false };

  await request('DELETE', contentsPath(filePath), { message, sha: existing.sha, branch });
  return { deleted: true };
};

/** Qovluqdakı faylların siyahısı */
export const ghListDir = async (dirPath) => {
  const { branch } = ghConfig();

  try {
    const data = await request('GET', contentsPath(dirPath) + '?ref=' + encodeURIComponent(branch));
    if (!Array.isArray(data)) return [];
    return data
      .filter((entry) => entry.type === 'file')
      .map((entry) => ({ name: entry.name, size: entry.size, sha: entry.sha }));
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
};

/** Bağlantının işlədiyini yoxlayır */
export const ghCheck = async () => {
  const { owner, name, branch } = ghConfig();

  if (!ghEnabled()) {
    return { ok: false, error: 'GITHUB_TOKEN və GITHUB_REPO təyin olunmayıb.' };
  }

  try {
    const repo = await request('GET', '/repos/' + owner + '/' + name);
    const canWrite = Boolean(repo.permissions && (repo.permissions.push || repo.permissions.admin));

    if (!canWrite) {
      return { ok: false, error: 'Token-in bu repoda yazma icazəsi yoxdur.' };
    }

    return { ok: true, repo: owner + '/' + name, branch, private: Boolean(repo.private) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
