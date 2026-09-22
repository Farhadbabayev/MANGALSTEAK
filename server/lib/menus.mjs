/**
 * Zalların PDF menyuları — həm yerli server, həm də Vercel paneli üçün
 * ümumi qaydalar.
 *
 * Hər zal × hər dil üçün bir fayl:  public/assets/menus/<zal>-<dil>.pdf
 * (məs. steak-az.pdf, ocakbasi-ru.pdf, milli-en.pdf). Zalların kodu
 * content.config.json → halls.items[].id, dillər site.config.json →
 * site.languages[].code-dan götürülür. Build faylın olub-olmadığına baxır:
 * varsa saytda «Menyunu aç / PDF yüklə» düymələri, yoxdursa «tezliklə» yazısı.
 */

export const MENU_DIR = 'public/assets/menus';

/** Yerli serverdə limit. Vercel-də sorğu gövdəsi platforma tərəfindən ~4.5 MB ilə məhduddur. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_BYTES_VERCEL = Math.floor(3.2 * 1024 * 1024);

export const menuFileName = (hall, lang) => hall + '-' + lang + '.pdf';

export const hallIds = (content) =>
  ((content && content.halls && content.halls.items) || [])
    .map((h) => h && h.id)
    .filter((id) => typeof id === 'string' && /^[a-z0-9-]+$/.test(id));

export const langCodes = (site) => {
  const list = (site && site.site && site.site.languages) || [];
  const codes = list.map((l) => l && l.code).filter((c) => /^[a-z]{2}$/.test(c || ''));
  return codes.length ? codes : ['az'];
};

/** Zal və dil mövcuddurmu? Ad yalnız bu siyahılardan qurulur — ixtiyari yol yazmaq mümkün deyil. */
export const checkSlot = (hall, lang, site, content) => {
  if (!hallIds(content).includes(hall)) return 'Belə zal yoxdur: ' + String(hall).slice(0, 40);
  if (!langCodes(site).includes(lang)) return 'Belə dil yoxdur: ' + String(lang).slice(0, 10);
  return null;
};

const fmtMb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';

/** data:application/pdf;base64,... → Buffer. Faylın həqiqətən PDF olduğu yoxlanılır. */
export const parsePdf = (dataUrl, maxBytes) => {
  const match = String(dataUrl || '').match(/^data:([\w/+.-]*);base64,(.+)$/);
  if (!match) return { ok: false, error: 'Fayl oxunmadı.' };

  const buffer = Buffer.from(match[2], 'base64');

  if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') {
    return { ok: false, error: 'Bu fayl PDF deyil.' };
  }

  if (buffer.length > maxBytes) {
    return {
      ok: false,
      error: 'PDF çox böyükdür (' + fmtMb(buffer.length) + ', maksimum ' + fmtMb(maxBytes) + '). ' +
        'Faylı sıxın (məs. «Save as → Reduced size PDF» və ya ilovepdf.com/compress_pdf).',
    };
  }

  return { ok: true, buffer };
};

/** Panelə göstərmək üçün: hər zal × dil üçün faylın vəziyyəti */
export const menuMatrix = (site, content, files) => {
  const byName = new Map((files || []).map((f) => [f.name, f]));
  const out = {};
  for (const hall of hallIds(content)) {
    out[hall] = {};
    for (const lang of langCodes(site)) {
      const file = byName.get(menuFileName(hall, lang));
      out[hall][lang] = file ? { name: file.name, size: file.size || 0 } : null;
    }
  }
  return out;
};
