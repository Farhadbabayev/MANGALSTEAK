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

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const img = (name) => `./assets/images/${name}`;

const pad = (n) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------ *
 *  Bloklar (təkrarlanan HTML hissələri)
 * ------------------------------------------------------------------ */

const blocks = {};

blocks.heroSlides = content.hero.slides.map((s, i) => `
          <li class="slider-item${i === 0 ? ' active' : ''}" data-hero-slider-item>

            <div class="slider-bg">
              <img src="${img(s.image)}" width="1880" height="950" alt="" class="img-cover">
            </div>

            <p class="label-2 section-subtitle slider-reveal">${s.subtitle}</p>

            <h1 class="display-1 hero-title slider-reveal">
              ${s.title}
            </h1>

            <p class="body-2 hero-text slider-reveal">
              ${s.text}
            </p>

            <a href="menyu.html" class="btn btn-primary slider-reveal">
              <span class="text text-1">Menyuya bax</span>
              <span class="text text-2" aria-hidden="true">Menyuya bax</span>
            </a>

          </li>`).join('\n');

blocks.serviceCards = content.services.cards.map((c) => `
            <li>
              <div class="service-card">

                <a href="${c.link}" class="has-before hover:shine">
                  <figure class="card-banner img-holder" style="--width: 285; --height: 336;">
                    <img src="${img(c.image)}" width="285" height="336" loading="lazy" alt="${esc(c.title)}"
                      class="img-cover">
                  </figure>
                </a>

                <div class="card-content">
                  <h3 class="title-4 card-title">
                    <a href="${c.link}">${c.title}</a>
                  </h3>

                  <a href="${c.link}" class="btn-text hover-underline label-2">Menyuya bax</a>
                </div>

              </div>
            </li>`).join('\n');

const menuCard = (item, indent = '            ') => `
${indent}<li>
${indent}  <div class="menu-card hover:card">

${indent}    <figure class="card-banner img-holder" style="--width: 100; --height: 100;">
${indent}      <img src="${img(item.image)}" width="100" height="100" loading="lazy" alt="${esc(item.name)}"
${indent}        class="img-cover">
${indent}    </figure>

${indent}    <div>
${indent}      <div class="title-wrapper">
${indent}        <h3 class="title-3">
${indent}          <span class="card-title">${esc(item.name)}</span>
${indent}        </h3>
${item.badge ? `${indent}        <span class="badge label-1">${esc(item.badge)}</span>\n` : ''}
${indent}        <span class="span title-2">${esc(item.price)}</span>
${indent}      </div>

${indent}      <p class="card-text label-1">
${indent}        ${esc(item.text)}
${indent}      </p>
${indent}    </div>

${indent}  </div>
${indent}</li>`;

/* Ana səhifədəki qısa menyu: steyk + mangal kateqoriyalarından ilk 3-3 */
const previewItems = [
  ...content.menu.categories.find((c) => c.id === 'steyk').items.slice(0, 3),
  ...content.menu.categories.find((c) => c.id === 'mangal').items.slice(0, 3),
];
blocks.menuPreviewCards = previewItems.map((i) => menuCard(i)).join('\n');

blocks.menuNav = content.menu.categories.map((c) => `
            <a href="#${c.id}" class="menu-nav-link label-2 hover-underline">${esc(c.name)}</a>`).join('');

blocks.menuCategories = content.menu.categories.map((c) => `
          <div class="menu-category" id="${c.id}">

            <div class="menu-category-head">
              <h3 class="headline-2 menu-category-title">${esc(c.name)}</h3>
              <p class="label-2 menu-category-subtitle">${esc(c.subtitle)}</p>
            </div>

            <ul class="grid-list">
${c.items.map((i) => menuCard(i, '              ')).join('\n')}
            </ul>

          </div>`).join('\n');

blocks.featureCards = content.features.cards.map((c) => `
            <li class="feature-item">
              <div class="feature-card">

                <div class="card-icon">
                  <img src="${img(c.icon)}" width="100" height="80" loading="lazy" alt="">
                </div>

                <h3 class="title-2 card-title">${esc(c.title)}</h3>

                <p class="label-1 card-text">${esc(c.text)}</p>

              </div>
            </li>`).join('\n');

blocks.eventCards = content.events.cards.map((c) => `
            <li>
              <div class="event-card has-before hover:shine">

                <div class="card-banner img-holder" style="--width: 350; --height: 450;">
                  <img src="${img(c.image)}" width="350" height="450" loading="lazy" alt="${esc(c.title)}"
                    class="img-cover">

                  <time class="publish-date label-2" datetime="${c.date}">${c.dateText}</time>
                </div>

                <div class="card-content">
                  <p class="card-subtitle label-2 text-center">${esc(c.category)}</p>

                  <h3 class="card-title title-2 text-center">
                    ${esc(c.title)}
                  </h3>
                </div>

              </div>
            </li>`).join('\n');

blocks.galleryItems = content.gallery.images.map((g) => `
            <li class="gallery-item">
              <figure class="gallery-figure img-holder has-before hover:shine" style="--width: 400; --height: 400;">
                <img src="${img(g.src)}" width="400" height="400" loading="lazy" alt="${esc(g.alt)}"
                  class="img-cover">
                <figcaption class="label-2">${esc(g.alt)}</figcaption>
              </figure>
            </li>`).join('\n');

blocks.statCards = content.pages.haqqimizda.stats.map((s) => `
            <li class="stats-item">
              <p class="stats-value headline-1">${esc(s.value)}</p>
              <p class="label-2 stats-label">${esc(s.label)}</p>
            </li>`).join('\n');

blocks.storyBlocks = content.pages.haqqimizda.blocks.map((b, i) => `
            <li class="story-item">
              <span class="story-num headline-2" aria-hidden="true">${pad(i + 1)}</span>
              <h3 class="title-2 story-title">${esc(b.title)}</h3>
              <p class="label-1 story-text">${esc(b.text)}</p>
            </li>`).join('\n');

blocks.packageCards = content.pages.tedbirler.packages.map((p) => `
            <li class="package-item">
              <div class="package-card${p.featured ? ' is-featured' : ''}">
                ${p.featured ? '<span class="package-badge label-2">Ən çox seçilən</span>' : ''}
                <h3 class="title-2 package-name">${esc(p.name)}</h3>
                <p class="label-2 package-capacity">${esc(p.capacity)}</p>
                <p class="package-price headline-2">${esc(p.price)}</p>

                <ul class="package-features">
${p.features.map((f) => `                  <li class="label-1"><ion-icon name="checkmark-outline" aria-hidden="true"></ion-icon><span>${esc(f)}</span></li>`).join('\n')}
                </ul>

                <a href="rezervasiya.html" class="btn btn-primary">
                  <span class="text text-1">Sorğu göndər</span>
                  <span class="text text-2" aria-hidden="true">Sorğu göndər</span>
                </a>
              </div>
            </li>`).join('\n');

blocks.stepCards = content.pages.rezervasiya.steps.map((s) => `
            <li class="step-item">
              <div class="step-card">
                <span class="step-num headline-2" aria-hidden="true">${esc(s.num)}</span>
                <h3 class="title-2 step-title">${esc(s.title)}</h3>
                <p class="label-1 step-text">${esc(s.text)}</p>
              </div>
            </li>`).join('\n');

blocks.ruleItems = content.pages.rezervasiya.rules.map((r) => `
                <li class="label-1"><ion-icon name="ellipse-outline" aria-hidden="true"></ion-icon><span>${esc(r)}</span></li>`).join('');

/* --- Forma seçimləri --- */

const r = site.reservation;

blocks.guestOptions = (() => {
  const out = [];
  for (let n = r.minGuests; n <= r.maxGuests; n++) {
    out.push(`                    <option value="${n}"${n === 2 ? ' selected' : ''}>${n} nəfər</option>`);
  }
  out.push(`                    <option value="${r.maxGuests + 1}">${r.maxGuests}+ nəfər (qrup)</option>`);
  return out.join('\n');
})();

blocks.timeOptions = (() => {
  const out = [`                    <option value="" disabled selected>Saat seçin</option>`];
  for (let h = r.openHour; h <= r.closeHour; h++) {
    for (let m = 0; m < 60; m += r.slotMinutes) {
      if (h === r.closeHour && m > 0) break;
      const t = `${pad(h)}:${pad(m)}`;
      out.push(`                    <option value="${t}">${t}</option>`);
    }
  }
  return out.join('\n');
})();

blocks.areaOptions = r.areas
  .map((a) => `                    <option value="${a.value}"${a.value === 'any' ? ' selected' : ''}>${esc(a.label)}</option>`)
  .join('\n');

blocks.occasionOptions = r.occasions
  .map((o) => `                    <option value="${o.value}">${esc(o.label)}</option>`)
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
    preload: ['hero-slider-1.jpg', 'hero-slider-2.jpg', 'hero-slider-3.jpg'],
  },
  {
    file: 'menyu.html',
    nav: 'menyu',
    title: `Menyu — ${N}`,
    description: 'Steyklər, mangal və kabablar, başlanğıclar, salatlar, şirniyyat və içkilər. Qiymətlər və təsvirlər.',
    heroTitle: content.pages.menyu.title,
    heroSubtitle: content.pages.menyu.subtitle,
    heroImage: 'hero-slider-2.jpg',
  },
  {
    file: 'haqqimizda.html',
    nav: 'haqqimizda',
    title: `Haqqımızda — ${N}`,
    description: 'Mangal Steak House-un hekayəsi: 28 gün dinləndirilmiş ət, palıd kömürü və Azərbaycan süfrə ənənəsi.',
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
    description: 'Masanızı onlayn ayırın: tarix, saat və nəfər sayını seçin — sorğunuz birbaşa restoranın sisteminə düşür.',
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

const navKeys = pages.map((p) => p.nav);

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
    '\n  <main>\n    <article>\n',
    body,
    '\n    </article>\n  </main>\n',
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

console.log(`  ✓ public/sitemap.xml\n  ✓ public/robots.txt`);

if (!existsSync(join(OUT, 'assets', 'css', 'style.css'))) {
  console.warn('  ! Diqqət: public/assets/css/style.css tapılmadı.');
}

if (failed) {
  console.error('\nBuild xəta ilə bitdi: yuxarıdakı dəyərlər konfiqurasiya fayllarında yoxdur.');
  process.exit(1);
}

console.log('\nBuild hazırdır.');
