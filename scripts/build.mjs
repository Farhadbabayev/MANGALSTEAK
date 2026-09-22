#!/usr/bin/env node
/**
 * Mangal Steak House — statik sayt generatoru
 *
 * src/pages + src/partials + *.config.json  ->  public/*.html
 *
 * İstifadə:  npm run build
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'public');

const site = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const content = JSON.parse(readFileSync(join(ROOT, 'content.config.json'), 'utf8'));
const theme = JSON.parse(readFileSync(join(ROOT, 'theme.config.json'), 'utf8'));

/* ------------------------------------------------------------------ *
 *  Partial-lar
 * ------------------------------------------------------------------ */

const partials = {};
for (const file of readdirSync(join(SRC, 'partials'))) {
  if (file.endsWith('.html')) {
    partials[file.replace(/\.html$/, '')] = readFileSync(join(SRC, 'partials', file), 'utf8');
  }
}

const expandPartials = (html, depth = 0) => {
  if (depth > 10) throw new Error('Partial-lar dövrə girdi (10 səviyyədən dərin).');
  const next = html.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    if (!(name in partials)) throw new Error(`Partial tapılmadı: ${name}`);
    return partials[name];
  });
  return next === html ? html : expandPartials(next, depth + 1);
};

/* ------------------------------------------------------------------ *
 *  Köməkçilər
 * ------------------------------------------------------------------ */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML saxlayan mətnlər üçün: yalnız dırnaqları qoruyuruq (atribut içində) */
const attr = (s) => String(s).replace(/"/g, '&quot;');

const img = (name) => `./assets/images/${name}`;
const pad = (n) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------ *
 *  Bloklar
 * ------------------------------------------------------------------ */

const blocks = {};

/* --- İkonlar (Phosphor Icons, "light" çəkisi, MIT — src/icons/) --- */

const icons = {};
for (const file of readdirSync(join(SRC, 'icons'))) {
  if (!file.endsWith('.svg')) continue;
  icons[file.replace(/\.svg$/, '')] = readFileSync(join(SRC, 'icons', file), 'utf8')
    .trim()
    .replace('<svg ', '<svg class="icon" aria-hidden="true" focusable="false" ');
}

/* --- Loqo --- */

const MARKS = {
  bull: `<svg viewBox="0 0 160 225" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 8 C22 28 48 37 80 37 C112 37 138 28 155 8 C140 31 118 50 80 50 C42 50 20 31 5 8 Z"/>
      <path fill-rule="evenodd" d="M80 33 C92 33 101 43 102 58 C103 72 100 85 96 97 C92 109 87 118 82 127 L80 132 L78 127 C73 118 68 109 64 97 C60 85 57 72 58 58 C59 43 68 33 80 33 Z M65 57 L79 63 L76 77 L63 69 Z M95 57 L81 63 L84 77 L97 69 Z M80 86 L87 100 L73 100 Z"/>
      <path d="M76 130 L84 130 L84 140 L89 145 L84 149 L84 203 L80 220 L76 203 L76 149 L71 145 L76 140 Z"/>
    </svg>`,

  flame: `<svg viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 1.5c1.2 4.3-1.1 6.4-3.2 8.6-2.4 2.5-4.6 4.9-4.6 9.1 0 4.7 3.5 8.3 7.8 8.3s7.8-3.6 7.8-8.3c0-2.6-1-4.4-2.2-6 .2 1.9-.5 3.4-1.9 4.1.6-3.7-.7-7.2-3.7-10.4.4 2.6-.5 4.3-2.3 6.2-1.4 1.5-2.2 2.8-2.2 4.6 0 1.4.5 2.6 1.4 3.5-2.5-.9-3.6-3-3.1-5.6.6-3.1 3-4.8 4.6-7.3 1.3-2 1.9-4.2 1.6-6.8z" fill="currentColor"/>
      <path d="M3 29h22M6 32h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`,

  fork: `<svg viewBox="0 0 40 120" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 6v26a6 6 0 0 0 4 5.6V114h4V37.6A6 6 0 0 0 20 32V6h-3v22h-2.5V6h-3v22H9V6H8z"/>
      <path d="M30 6c-4 6-6 14-6 22s2 12 4 13v73h4V6h-2z"/>
    </svg>`,

  leaf: `<svg viewBox="0 0 40 40" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M33 5C18 5 8 12 8 24c0 3 .8 5.6 2.2 7.6L5 37l2 2 5.4-5.2C14.4 35.2 17 36 20 36c12 0 17-13 13-31zM20 32c-2 0-3.8-.5-5.2-1.4L28 17.4l-2.8-2.8-13.2 13.2C11 26.4 10.5 24.4 10.5 22 10.5 13 18 9 30.5 8.6 32.6 21 29 32 20 32z"/>
    </svg>`,
};

const logoInner = (() => {
  const mode = theme.logo?.mode || 'mark';
  const nameHtml =
    `<span class="logo-text">` +
    `<span class="logo-title">${esc(site.site.logoTop)}</span>` +
    `<span class="logo-sub">${esc(site.site.logoBottom)}</span>` +
    `</span>`;

  if (mode === 'image' && theme.logo.image) {
    return `<img src="${img(theme.logo.image)}" alt="${esc(site.site.name)}" class="logo-img">`;
  }

  if (mode === 'text') return nameHtml;

  const mark = MARKS[theme.logo?.mark] || MARKS.bull;
  return `<span class="logo-mark" aria-hidden="true">${mark}</span>\n  ${nameHtml}`;
})();

blocks.logoInner = logoInner;

/* --- Hero --- */

blocks.heroSlides = content.hero.slides
  .map(
    (s, i) => `
        <div class="hero-slide${i === 0 ? ' active' : ''}" data-hero-slide
          data-label="${attr(s.subtitle)}" data-title="${attr(s.title)}" data-text="${attr(s.text)}">
          <img src="${img(s.image)}" width="1880" height="950" alt=""${i === 0 ? '' : ' loading="lazy"'}>
        </div>`
  )
  .join('');

blocks.heroDots = content.hero.slides
  .map(
    (s, i) => `
          <button type="button" data-hero-dot class="${i === 0 ? 'active' : ''}"
            aria-label="Slayd ${i + 1}"></button>`
  )
  .join('');

/* --- Üstünlüklər (hairline şəbəkə) --- */

blocks.featureCards = content.features.cards
  .map(
    (c) => `
            <li class="virtue">
              <span class="gol-mark" aria-hidden="true"></span>
              <h3>${esc(c.title)}</h3>
              <p>${esc(c.text)}</p>
            </li>`
  )
  .join('');

/* --- Menyu --- */

const menuItem = (item, indent = '            ') => `
${indent}<div class="menu-item">
${indent}  <div class="menu-item-top">
${indent}    <h3>${esc(item.name)}</h3>
${indent}    <span class="leader" aria-hidden="true"></span>
${indent}    <span class="cost">${esc(item.price)}</span>
${indent}  </div>
${indent}  <p>${item.badge ? `<span class="tag">${esc(item.badge)}</span>` : ''}${esc(item.text)}</p>
${indent}</div>`;

/* İlk iki kateqoriyadan 3-3 yemək, hər biri öz sütununda */
blocks.menuPreviewItems = content.menu.categories
  .slice(0, 2)
  .map(
    (c) => `
            <div class="menu-col">
              <h3 class="menu-col-title"><a href="menyu.html#${c.id}">${esc(c.name)}</a></h3>
${c.items.slice(0, 3).map((i) => menuItem(i, '              ')).join('')}
            </div>`
  )
  .join('');

blocks.menuNav = content.menu.categories
  .map((c) => `
            <a href="#${c.id}">${esc(c.name)}</a>`)
  .join('');

blocks.menuCategories = content.menu.categories
  .map(
    (c) => `
          <div class="menu-category reveal" id="${c.id}">

            <div class="menu-category-head">
              <h2>${esc(c.name)}</h2>
              <p class="label">${esc(c.subtitle)}</p>
            </div>

            <div class="menu-grid">
${c.items.map((i) => menuItem(i, '              ')).join('')}
            </div>

          </div>`
  )
  .join('');

/* --- Tədbirlər --- */

blocks.eventCards = content.events.cards
  .map(
    (c, i) => `
            <li class="event${i === 0 ? ' is-lead' : ''}">
              <article>
                <figure class="frame">
                  <img src="${img(c.image)}" width="700" height="800" loading="lazy" alt="${esc(c.title)}">
                </figure>
                <div class="event-body">
                  <p class="event-meta"><time datetime="${c.date}">${c.dateText}</time><span>${esc(c.category)}</span></p>
                  <h3>${esc(c.title)}</h3>
                </div>
              </article>
            </li>`
  )
  .join('');

/* --- Qalereya --- */

blocks.galleryItems = content.gallery.images
  .map(
    (g, i) => `
            <li class="gallery-item${i % 5 === 0 ? ' tall' : ''}">
              <figure>
                <img src="${img(g.src)}" width="500" height="500" loading="lazy" alt="${esc(g.alt)}">
                <figcaption>${esc(g.alt)}</figcaption>
              </figure>
            </li>`
  )
  .join('');

/* --- Haqqımızda --- */

blocks.statCards = content.pages.haqqimizda.stats
  .map(
    (s) => `
            <li>
              <p class="value">${esc(s.value)}</p>
              <span class="label">${esc(s.label)}</span>
            </li>`
  )
  .join('');

blocks.storyBlocks = content.pages.haqqimizda.blocks
  .map(
    (b) => `
            <li class="story-item">
              <span class="gol-mark" aria-hidden="true"></span>
              <h3>${esc(b.title)}</h3>
              <p>${esc(b.text)}</p>
            </li>`
  )
  .join('');

/* --- Banket paketləri --- */

blocks.packageCards = content.pages.tedbirler.packages
  .map(
    (p) => `
            <li class="package-card${p.featured ? ' is-featured' : ''}">
              ${p.featured ? '<span class="package-badge">Ən çox seçilən</span>' : ''}
              <h3>${esc(p.name)}</h3>
              <p class="package-capacity">${esc(p.capacity)}</p>
              <p class="package-price">${esc(p.price)}</p>

              <ul class="package-features">
${p.features.map((f) => `                <li>${esc(f)}</li>`).join('\n')}
              </ul>

              <a href="rezervasiya.html" class="btn${p.featured ? ' btn-solid' : ''}">Sorğu göndər</a>
            </li>`
  )
  .join('');

/* --- Rezervasiya səhifəsi --- */

blocks.stepCards = content.pages.rezervasiya.steps
  .map(
    (s) => `
            <li class="step">
              <h3>${esc(s.title)}</h3>
              <p>${esc(s.text)}</p>
            </li>`
  )
  .join('');

blocks.ruleItems = content.pages.rezervasiya.rules
  .map((r) => `
              <li>${esc(r)}</li>`)
  .join('');

/* --- Forma seçimləri --- */

const r = site.reservation;

blocks.guestOptions = (() => {
  const out = [];
  for (let n = r.minGuests; n <= r.maxGuests; n++) {
    out.push(`                  <option value="${n}"${n === 2 ? ' selected' : ''}>${n} nəfər</option>`);
  }
  out.push(`                  <option value="${r.maxGuests + 1}">${r.maxGuests}+ nəfər (qrup)</option>`);
  return out.join('\n');
})();

blocks.timeOptions = (() => {
  const out = ['                  <option value="" disabled selected>Saat seçin</option>'];
  for (let h = r.openHour; h <= r.closeHour; h++) {
    for (let m = 0; m < 60; m += r.slotMinutes) {
      if (h === r.closeHour && m > 0) break;
      const t = `${pad(h)}:${pad(m)}`;
      out.push(`                  <option value="${t}">${t}</option>`);
    }
  }
  return out.join('\n');
})();

blocks.areaOptions = r.areas
  .map(
    (a) =>
      `                  <option value="${a.value}"${a.value === 'any' ? ' selected' : ''}>${esc(a.label)}</option>`
  )
  .join('\n');

blocks.occasionOptions = r.occasions
  .map((o) => `                  <option value="${o.value}">${esc(o.label)}</option>`)
  .join('\n');

/* ------------------------------------------------------------------ *
 *  Səhifələr
 * ------------------------------------------------------------------ */

const N = site.site.name;

const pages = [
  {
    file: 'index.html',
    nav: 'index',
    title: `${N} | ${site.site.tagline}`,
    description: site.site.description,
    preload: ['hero-slider-1.jpg'],
  },
  {
    file: 'menyu.html',
    nav: 'menyu',
    title: `Menyu | ${N}`,
    description:
      'Steyklər, mangal və kabablar, başlanğıclar, salatlar, şirniyyat və içkilər. Qiymətlər və təsvirlər.',
    heroTitle: content.pages.menyu.title,
    heroSubtitle: content.pages.menyu.subtitle,
    heroImage: 'hero-slider-2.jpg',
  },
  {
    file: 'haqqimizda.html',
    nav: 'haqqimizda',
    title: `Haqqımızda | ${N}`,
    description:
      'Mangal Steak House-un hekayəsi: 28 gün dinləndirilmiş ət, palıd kömürü və Azərbaycan süfrə ənənəsi.',
    heroTitle: content.pages.haqqimizda.title,
    heroSubtitle: content.pages.haqqimizda.subtitle,
    heroImage: 'about-banner.jpg',
  },
  {
    file: 'qalereya.html',
    nav: 'qalereya',
    title: `Qalereya | ${N}`,
    description: 'Restoranımızdan, mətbəximizdən və yeməklərimizdən fotolar.',
    heroTitle: content.pages.qalereya.title,
    heroSubtitle: content.pages.qalereya.subtitle,
    heroImage: 'event-2.jpg',
  },
  {
    file: 'tedbirler.html',
    nav: 'tedbirler',
    title: `Tədbirlər və Banket | ${N}`,
    description: 'Ad günü, korporativ tədbir və banketlər üçün paketlər, zal imkanları və fərdi menyu.',
    heroTitle: content.pages.tedbirler.title,
    heroSubtitle: content.pages.tedbirler.subtitle,
    heroImage: 'event-1.jpg',
  },
  {
    file: 'rezervasiya.html',
    nav: 'rezervasiya',
    title: `Onlayn Rezervasiya | ${N}`,
    description:
      'Masanızı onlayn ayırın: tarix, saat və nəfər sayını seçin. Sorğunuz birbaşa restoranın sisteminə düşür.',
    heroTitle: content.pages.rezervasiya.title,
    heroSubtitle: content.pages.rezervasiya.subtitle,
    heroImage: 'hero-slider-3.jpg',
  },
  {
    file: 'bron.html',
    nav: '',
    title: `Bronu yoxla | ${N}`,
    description: 'Bron kodunuzla rezervasiyanızın vəziyyətini yoxlayın və ya onu ləğv edin.',
    heroTitle: 'Bronu yoxla',
    heroSubtitle: 'Bron kodunuz və telefon nömrənizlə rezervasiyanın vəziyyətinə baxın və ya onu ləğv edin.',
    heroImage: 'hero-slider-3.jpg',
    noIndex: true,
  },
  {
    file: 'elaqe.html',
    nav: 'elaqe',
    title: `Əlaqə | ${N}`,
    description: 'Ünvan, telefon, e-mail və iş saatları. Bakının mərkəzində, xəritədə bax.',
    heroTitle: content.pages.elaqe.title,
    heroSubtitle: content.pages.elaqe.subtitle,
    heroImage: 'service-2.jpg',
  },
  {
    file: '404.html',
    nav: '',
    title: `Səhifə tapılmadı | ${N}`,
    description: 'Axtardığınız səhifə tapılmadı.',
    noIndex: true,
  },
];

const navKeys = pages.map((p) => p.nav).filter(Boolean);

/* ------------------------------------------------------------------ *
 *  Render
 * ------------------------------------------------------------------ */

const lookup = (data, path) =>
  path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), data);

const render = (template, data) => {
  const missing = new Set();
  const html = template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, path) => {
    const value = lookup(data, path);
    if (value === undefined || value === null) {
      missing.add(path);
      return '';
    }
    return String(value);
  });
  return { html, missing: [...missing] };
};

/* ------------------------------------------------------------------ *
 *  theme.css — rəng, şrift və ölçü dəyişənləri
 * ------------------------------------------------------------------ */

const fontStack = (name, fallback) => `'${name}', ${fallback}`;

const c = theme.colors || {};
const f = theme.fonts || {};
const l = theme.layout || {};

const themeCss = `/*-----------------------------------*\\
  #theme.css
  Admin panelin «Dizayn» bölməsindən yaradılır — əl ilə redaktə etməyin.
  (Mənbə: theme.config.json)
\\*-----------------------------------*/

:root {
  --black: ${c.black || '#121212'};
  --black-2: ${c.black2 || '#181817'};
  --black-3: ${c.black3 || '#0D0D0D'};
  --cream: ${c.cream || '#FAF8F5'};
  --cream-dim: ${c.creamDim || '#A9A49C'};
  --gold: ${c.gold || '#B99B6B'};
  --brand: ${c.brand || '#4E0007'};
  --brand-2: ${c.brand2 || '#6B0A12'};

  --display: ${fontStack(f.display || 'Archivo', 'system-ui, -apple-system, sans-serif')};
  --body: ${fontStack(f.body || 'Archivo', 'system-ui, -apple-system, sans-serif')};
  --logo: ${fontStack(f.logo || 'Grenze Gotisch', 'Georgia, serif')};

  --space: ${Number(l.sectionSpace) || 130}px;
}

.logo-title { font-size: ${Number(l.logoSize) || 31}px; }
.logo-mark { width: ${Number(l.markSize) || 26}px; }
.logo-img { max-height: ${Math.round((Number(l.logoSize) || 31) * 1.6)}px; width: auto; }
`;

writeFileSync(join(OUT, 'assets', 'css', 'theme.css'), themeCss, 'utf8');

console.log('  ✓ public/assets/css/theme.css');

/* ------------------------------------------------------------------ *
 *  Fayl versiyaları
 * ------------------------------------------------------------------ */

/**
 * Hər CSS/JS ünvanına məzmunundan çıxarılan qısa açar əlavə olunur:
 *   ./assets/css/site.css  ->  ./assets/css/site.css?v=8f3c1a92
 *
 * Fayl dəyişəndə ünvan da dəyişir — beləcə brauzer (və CDN) köhnə
 * nüsxəni saxlamır, yenilik dərhal görünür.
 */

const shortHash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 8);

const assetVersions = { 'css/theme.css': shortHash(themeCss) };

for (const rel of ['css/site.css', 'css/fonts.css', 'js/script.js', 'js/reservation.js', 'js/booking.js']) {
  const file = join(OUT, 'assets', ...rel.split('/'));
  if (existsSync(file)) assetVersions[rel] = shortHash(readFileSync(file, 'utf8'));
}

const withVersions = (html) =>
  html.replace(/\.\/assets\/(css|js)\/([\w.-]+\.(?:css|js))/g, (match, dir, file) => {
    const version = assetVersions[`${dir}/${file}`];
    return version ? `${match}?v=${version}` : match;
  });

let failed = false;

for (const page of pages) {
  const body = readFileSync(join(SRC, 'pages', page.file), 'utf8');

  const raw = [
    partials.head,
    partials.header,
    '\n  <main>\n',
    body,
    '\n  </main>\n',
    partials.footer,
    partials.scripts,
  ].join('\n');

  const nav = Object.fromEntries(navKeys.map((k) => [k, k === page.nav ? 'active' : '']));

  const preload = (page.preload || [])
    .map((i) => `  <link rel="preload" as="image" href="${img(i)}">`)
    .join('\n');

  const data = {
    ...site,
    ...content,
    blocks,
    icons,
    nav,
    page: {
      ...page,
      preload: preload ? preload + '\n' : '',
      heroTitle: page.heroTitle || '',
      heroSubtitle: page.heroSubtitle || '',
      heroImage: page.heroImage || 'hero-slider-1.jpg',
    },
  };

  const { html, missing } = render(expandPartials(raw), data);

  if (missing.length) {
    failed = true;
    console.error(`  ✗ ${page.file}: tapılmayan dəyər(lər): ${missing.join(', ')}`);
  }

  const versioned = withVersions(html);

  writeFileSync(join(OUT, page.file), versioned, 'utf8');
  console.log(`  ✓ public/${page.file}  (${(versioned.length / 1024).toFixed(1)} KB)`);
}


/* ------------------------------------------------------------------ *
 *  admin-info.html — Vercel kimi statik hostinqdə /admin üçün izah
 * ------------------------------------------------------------------ */

writeFileSync(
  join(OUT, 'admin-info.html'),
  `<!DOCTYPE html>
<html lang="az">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>İdarəetmə paneli — ${esc(site.site.name)}</title>
  <link rel="shortcut icon" href="./favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="./assets/css/fonts.css">
  <link rel="stylesheet" href="./assets/css/site.css">
  <link rel="stylesheet" href="./assets/css/theme.css">
  <style>
    body { display: grid; place-items: center; min-height: 100vh; padding: 40px 20px; }
    .box { width: min(640px, 100%); }
    .box h1 { margin-block: 18px 20px; }
    .box ol { display: grid; gap: 14px; margin-block: 22px 30px; counter-reset: s; }
    .box li { display: grid; grid-template-columns: 30px 1fr; gap: 14px; color: var(--cream-dim); }
    .box li::before {
      counter-increment: s; content: counter(s, decimal-leading-zero);
      font-family: var(--display); color: var(--gold); font-size: 15px; padding-top: 2px;
    }
    code {
      display: inline-block; background: var(--black-2); border: 1px solid var(--hair);
      padding: 2px 8px; font-family: ui-monospace, monospace; font-size: 13px; color: var(--gold);
    }
    pre { background: var(--black-2); border: 1px solid var(--hair); padding: 16px; overflow-x: auto;
      font-family: ui-monospace, monospace; font-size: 13px; color: var(--cream-dim); line-height: 1.8; }
  </style>
</head>
<body>
  <div class="box">
    <p class="label">İdarəetmə paneli</p>
    <h1 class="display-2">Panel bu ünvanda işləmir</h1>

    <p class="lede">
      Sayt Vercel-də yerləşir — orada fayllar yalnız oxunur, ona görə panel
      məzmunu birbaşa dəyişə bilmir. Panel öz kompüterinizdə işləyir, dəyişiklik
      isə saytda avtomatik yenilənir.
    </p>

    <ol>
      <li>Reponu kompüterinizə yükləyin və <code>npm start</code> yazın</li>
      <li><code>http://localhost:3000/admin</code> ünvanını açın və məzmunu dəyişin</li>
      <li><code>git push</code> — Vercel saytı bir neçə saniyəyə özü yeniləyir</li>
    </ol>

    <pre>git clone https://github.com/Farhadbabayev/MANGALSTEAK.git
cd MANGALSTEAK
cp .env.example .env    # ADMIN_PASSWORD təyin edin
npm start</pre>

    <p class="lede" style="margin-block: 26px 30px">
      Rezervasiya sisteminin (Vilka) ünvanı və açarı Vercel-də
      <strong>Settings → Environment Variables</strong> bölməsindən təyin olunur.
    </p>

    <a href="./index.html" class="btn">Sayta qayıt</a>
  </div>
</body>
</html>
`,
  'utf8'
);

console.log('  ✓ public/admin-info.html');

/* ------------------------------------------------------------------ *
 *  robots.txt + sitemap.xml
 * ------------------------------------------------------------------ */

const base = site.site.url.replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);

writeFileSync(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .filter((p) => !p.noIndex)
  .map(
    (p) => `  <url>
    <loc>${base}/${p.file === 'index.html' ? '' : p.file}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${p.file === 'index.html' ? '1.0' : '0.8'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`,
  'utf8'
);

writeFileSync(
  join(OUT, 'robots.txt'),
  `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${base}/sitemap.xml
`,
  'utf8'
);

console.log('  ✓ public/sitemap.xml\n  ✓ public/robots.txt');

if (!existsSync(join(OUT, 'assets', 'css', 'site.css'))) {
  console.warn('  ! Diqqət: public/assets/css/site.css tapılmadı.');
}

if (failed) {
  console.error('\nBuild xəta ilə bitdi: yuxarıdakı dəyərlər konfiqurasiya fayllarında yoxdur.');
  process.exit(1);
}

console.log('\nBuild hazırdır.');
