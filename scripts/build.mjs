#!/usr/bin/env node
/**
 * Mangal Steak House — statik sayt generatoru
 *
 * src/pages + src/partials + *.config.json  ->  public/*.html
 *
 * İstifadə:  npm run build
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'public');

const site = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const content = JSON.parse(readFileSync(join(ROOT, 'content.config.json'), 'utf8'));

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
    (c, i) => `
            <li>
              <p class="label">${pad(i + 1)}</p>
              <h3 class="title-2">${esc(c.title)}</h3>
              <p>${esc(c.text)}</p>
            </li>`
  )
  .join('');

/* --- Menyu --- */

const menuItem = (item, indent = '            ') => `
${indent}<div class="menu-item">
${indent}  <div class="menu-item-top">
${indent}    <h3>${esc(item.name)}${item.badge ? `<span class="tag">${esc(item.badge)}</span>` : ''}</h3>
${indent}    <span class="cost">${esc(item.price)}</span>
${indent}  </div>
${indent}  <p>${esc(item.text)}</p>
${indent}</div>`;

const previewItems = [
  ...content.menu.categories.find((c) => c.id === 'steyk').items.slice(0, 3),
  ...content.menu.categories.find((c) => c.id === 'mangal').items.slice(0, 3),
];

blocks.menuPreviewItems = previewItems.map((i) => menuItem(i)).join('');

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
    (c) => `
            <li>
              <article class="event-card">
                <figure>
                  <img src="${img(c.image)}" width="350" height="300" loading="lazy" alt="${esc(c.title)}">
                </figure>
                <div class="event-body">
                  <time datetime="${c.date}">${c.dateText} · ${esc(c.category)}</time>
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
    (b, i) => `
            <li class="story-item">
              <span class="num">№ ${pad(i + 1)}</span>
              <div>
                <h3>${esc(b.title)}</h3>
                <p>${esc(b.text)}</p>
              </div>
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

              <a href="rezervasiya.html" class="btn">Sorğu göndər</a>
            </li>`
  )
  .join('');

/* --- Rezervasiya səhifəsi --- */

blocks.stepCards = content.pages.rezervasiya.steps
  .map(
    (s) => `
            <li class="step">
              <span class="num">${esc(s.num)}</span>
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
    title: `${N} — ${site.site.tagline}`,
    description: site.site.description,
    preload: ['hero-slider-1.jpg'],
  },
  {
    file: 'menyu.html',
    nav: 'menyu',
    title: `Menyu — ${N}`,
    description:
      'Steyklər, mangal və kabablar, başlanğıclar, salatlar, şirniyyat və içkilər. Qiymətlər və təsvirlər.',
    heroTitle: content.pages.menyu.title,
    heroSubtitle: content.pages.menyu.subtitle,
    heroImage: 'hero-slider-2.jpg',
  },
  {
    file: 'haqqimizda.html',
    nav: 'haqqimizda',
    title: `Haqqımızda — ${N}`,
    description:
      'Mangal Steak House-un hekayəsi: 28 gün dinləndirilmiş ət, palıd kömürü və Azərbaycan süfrə ənənəsi.',
    heroTitle: content.pages.haqqimizda.title,
    heroSubtitle: content.pages.haqqimizda.subtitle,
    heroImage: 'about-banner.jpg',
  },
  {
    file: 'qalereya.html',
    nav: 'qalereya',
    title: `Qalereya — ${N}`,
    description: 'Restoranımızdan, mətbəximizdən və yeməklərimizdən fotolar.',
    heroTitle: content.pages.qalereya.title,
    heroSubtitle: content.pages.qalereya.subtitle,
    heroImage: 'event-2.jpg',
  },
  {
    file: 'tedbirler.html',
    nav: 'tedbirler',
    title: `Tədbirlər və Banket — ${N}`,
    description: 'Ad günü, korporativ tədbir və banketlər üçün paketlər, zal imkanları və fərdi menyu.',
    heroTitle: content.pages.tedbirler.title,
    heroSubtitle: content.pages.tedbirler.subtitle,
    heroImage: 'event-1.jpg',
  },
  {
    file: 'rezervasiya.html',
    nav: 'rezervasiya',
    title: `Onlayn Rezervasiya — ${N}`,
    description:
      'Masanızı onlayn ayırın: tarix, saat və nəfər sayını seçin — sorğunuz birbaşa restoranın sisteminə düşür.',
    heroTitle: content.pages.rezervasiya.title,
    heroSubtitle: content.pages.rezervasiya.subtitle,
    heroImage: 'hero-slider-3.jpg',
  },
  {
    file: 'elaqe.html',
    nav: 'elaqe',
    title: `Əlaqə — ${N}`,
    description: 'Ünvan, telefon, e-mail və iş saatları. Bakının mərkəzində, xəritədə bax.',
    heroTitle: content.pages.elaqe.title,
    heroSubtitle: content.pages.elaqe.subtitle,
    heroImage: 'service-2.jpg',
  },
  {
    file: '404.html',
    nav: '',
    title: `Səhifə tapılmadı — ${N}`,
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

let failed = false;

for (const page of pages) {
  const body = readFileSync(join(SRC, 'pages', page.file), 'utf8');

  const raw = [
    partials.head,
    partials.topbar,
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

  writeFileSync(join(OUT, page.file), html, 'utf8');
  console.log(`  ✓ public/${page.file}  (${(html.length / 1024).toFixed(1)} KB)`);
}

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
