/**
 * GitHub Contents API — Vercel kimi «yalnız oxunan» hostinqlərdə
 * idarəetmə panelinin yaddaşı.
 *
 * Panel faylı birbaşa diskə yaza bilmədiyi üçün dəyişikliyi repoya commit edir;
 * Vercel isə push-u görüb saytı özü yenidən yığır.
 *
 * Mühit dəyişənləri:
 *   GITHUB_TOKEN   — fine-grained token, «Contents: Read and write» icazəsi ilə
 *                    (YEGANƏ məcburi dəyişən)
 *   GITHUB_REPO    — sahib/repo. Boşdursa Vercel-in VERCEL_GIT_REPO_OWNER /
 *                    VERCEL_GIT_REPO_SLUG dəyişənlərindən özü tapılır.
 *   GITHUB_BRANCH  — hansı budağa yazılsın. Boşdursa VERCEL_GIT_COMMIT_REF —
 *                    yəni bu deployment-in yığıldığı budaq. Beləliklə panel
 *                    HƏMİŞƏ saytın yığıldığı budağa yazır; «panel bir budağa
 *                    yazır, Vercel başqasını yığır» səhvi mümkün deyil.
 */

/* Sınaq üçün başqa ünvana yönləndirmək olar */
const API = (process.env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');

const env = (key) => (process.env[key] || '').trim();

export const ghConfig = () => {
  /* Əvvəl əl ilə yazılana baxırıq, sonra Vercel-in öz dəyişənlərinə */
  const [setOwner, setName] = env('GITHUB_REPO').split('/');

  const owner = setOwner || env('VERCEL_GIT_REPO_OWNER');
  const name = setName || env('VERCEL_GIT_REPO_SLUG');
  const branch = env('GITHUB_BRANCH') || env('VERCEL_GIT_COMMIT_REF') || 'main';

  return {
    token: env('GITHUB_TOKEN'),
    owner: owner || '',
    name: name || '',
    branch,
    /* Panelə göstərmək üçün: dəyər haradan gəldi? */
    source: setOwner && setName ? 'env' : owner && name ? 'vercel' : 'none',
  };
};

export const ghEnabled = () => {
  const { token, owner, name } = ghConfig();
  return Boolean(token && owner && name);
};

/**
 * Texniki xətanı panelin sahibinin anlayacağı dilə çevirir.
 *
 * GitHub-un öz mətni HƏMİŞƏ sonda saxlanılır: izah yanlış olsa belə,
 * əsl səbəb gözdən itməsin (məs. «Resource not accessible by personal
 * access token» — token icazəsi, «protected branch» — budaq qorunması).
 */
const explain = (status, message) => {
  const raw = message ? ' (GitHub: ' + message + ')' : '';

  if (status === 401) {
    return 'GITHUB_TOKEN yanlışdır və ya vaxtı bitib — yenisini yaradın.' + raw;
  }

  if (status === 403) {
    return 'Token oxuya bilir, amma yaza bilmir. GitHub → Settings → Developer settings → ' +
      'Personal access tokens → Fine-grained tokens → həmin token → Repository permissions → ' +
      'Contents: «Read and write» seçin. Token dəyişmir, Vercel-də heç nə etmək lazım deyil.' + raw;
  }

  if (status === 404) {
    return 'Repo tapılmadı — GITHUB_REPO dəyərini (sahib/repo) və token-in bu repoya icazəsini yoxlayın.' + raw;
  }

  return 'GitHub: ' + message;
};

/** Paneldə hansı izahı göstərməyi bilmək üçün maşın oxuyan kod */
const codeFor = (status) =>
  status === 401 ? 'gh-unauthorized'
    : status === 403 ? 'gh-no-write'
      : status === 404 ? 'gh-not-found'
        : 'gh-error';

const request = async (method, path, body) => {
  const { token } = ghConfig();

  let response;
  try {
    response = await fetch(API + path, {
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
  } catch (err) {
    /* Şəbəkə xətası: «fetch failed» heç nə izah etmir */
    const wrapped = new Error('GitHub-a qoşulmaq alınmadı (' + ((err && err.message) || 'şəbəkə xətası') + ').');
    wrapped.status = 0;
    throw wrapped;
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    /* JSON deyil */
  }

  if (!response.ok) {
    const message = (payload && payload.message) || ('HTTP ' + response.status);
    const error = new Error(explain(response.status, message));
    error.status = response.status;
    error.code = codeFor(response.status);
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
  const { token, owner, name, branch } = ghConfig();

  if (!ghEnabled()) {
    if (!token) {
      return {
        ok: false,
        error: 'GITHUB_TOKEN təyin olunmayıb — paneldən dəyişiklik yazmaq üçün lazımdır.',
      };
    }

    if (!owner || !name) {
      return {
        ok: false,
        error: 'Repo tapılmadı. GITHUB_REPO təyin edin (məs. sahib/repo).',
      };
    }

    return { ok: false, error: 'GitHub bağlantısı qurulmayıb.' };
  }

  try {
    const repo = await request('GET', '/repos/' + owner + '/' + name);

    /* Diqqət: repo.permissions token-in deyil, HESABIN repoya girişini
       göstərir. «Contents: Read» ilə yaradılmış token də burada push:true
       görünür — ona görə bu yoxlama yazmanı TƏSDİQLƏMİR, yalnız repoya
       çatdığımızı bildirir. Yazma icazəsi ilk yazmada üzə çıxır və
       oradakı 403 izahlı mesaj verir. */
    const reachable = Boolean(repo.permissions && (repo.permissions.push || repo.permissions.admin));

    if (!reachable) {
      return { ok: false, error: 'Bu hesabın həmin repoda yazma icazəsi yoxdur.', code: 'gh-no-write' };
    }

    return { ok: true, repo: owner + '/' + name, branch, private: Boolean(repo.private) };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || 'gh-error' };
  }
};
