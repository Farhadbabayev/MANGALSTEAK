#!/usr/bin/env node
/**
 * Google Fonts şriftlərini yerli yükləyir (self-hosting).
 *
 *   node scripts/fetch-fonts.mjs
 *
 * Niyə: CDN-dən asılılıq olmur, sayt daha sürətli açılır və Azərbaycan
 * hərfləri (ə, ğ, ş, ç, ö, ü, ı) üçün latin-ext alt dəsti də yüklənir.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'public', 'assets', 'fonts');

/* Brauzer kimi təqdim olunuruq ki, woff2 alaq */
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* Yalnız bu alt dəstlər lazımdır */
const KEEP = ['latin', 'latin-ext'];

const FAMILIES = [
  'Archivo:wdth,wght@62..125,100..900',
  'Anton',
  'Manrope:wght@400;500;600;700;800',
  'Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700',
  'Karla:wght@400;500;700',
  'Cormorant+Garamond:wght@300;400;500;600',
  'Inter:wght@300;400;500;600',
  'Pirata+One',
  'Grenze+Gotisch:wght@500;600;700',
];

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const fetchText = async (url) => {
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' — ' + url);
  return response.text();
};

/**
 * Kiril (rus dili) üçün köməkçi şrift.
 *
 * Archivo-da kiril hərfləri yoxdur. Roboto Flex-in kiril alt dəsti eyni
 * «wdth» oxuna malikdir, ona görə «Archivo» adı altında, yalnız kiril
 * unicode-range ilə qoşulur: başlıqlar (font-stretch: 68%) sıx, mətn isə
 * normal enində qalır. Fayl ayrıca CSS-dədir və yalnız /ru/ səhifələrinə
 * qoşulur — digər dillərdə heç yüklənmir.
 *
 *   node scripts/fetch-fonts.mjs --cyrillic   (yalnız bu hissə)
 */
const CYRILLIC = { family: 'Roboto+Flex:wdth,wght@25..151,100..1000', as: 'Archivo', subsets: ['cyrillic', 'cyrillic-ext'] };

const fetchCyrillic = async () => {
  await mkdir(FONT_DIR, { recursive: true });

  const css = await fetchText('https://fonts.googleapis.com/css2?family=' + CYRILLIC.family + '&display=swap');
  const out = [
    '/*-----------------------------------*\\',
    '  #fonts-cyrillic.css — rus səhifələri üçün kiril hərfləri',
    '  scripts/fetch-fonts.mjs ilə yaradılıb, əl ilə redaktə etməyin.',
    '\\*-----------------------------------*/',
    '',
  ];

  for (const part of css.split('/*').slice(1)) {
    const subset = part.slice(0, part.indexOf('*/')).trim();
    if (!CYRILLIC.subsets.includes(subset)) continue;

    const block = part.slice(part.indexOf('*/') + 2);
    const srcMatch = block.match(/src:\s*url\(([^)]+)\)\s*format\('([^']+)'\)/);
    const rangeMatch = block.match(/unicode-range:\s*([^;]+);/);
    if (!srcMatch || !rangeMatch) continue;

    const fileName = 'roboto-flex-cyr-' + subset + '.woff2';
    const response = await fetch(srcMatch[1], { headers: { 'User-Agent': UA } });
    if (!response.ok) throw new Error('yüklənmədi: ' + srcMatch[1]);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(join(FONT_DIR, fileName), buffer);

    for (const family of [CYRILLIC.as]) {
      out.push('@font-face {');
      out.push("  font-family: '" + family + "';");
      out.push('  font-style: normal;');
      out.push('  font-weight: 100 900;');
      out.push('  font-stretch: 25% 151%;');
      out.push('  font-display: swap;');
      out.push("  src: url('../fonts/" + fileName + "') format('woff2');");
      out.push('  unicode-range: ' + rangeMatch[1].trim() + ';');
      out.push('}');
      out.push('');
    }

    console.log('  ✓ ' + fileName + '  (' + Math.round(buffer.length / 1024) + ' KB)');
  }

  await writeFile(join(ROOT, 'public', 'assets', 'css', 'fonts-cyrillic.css'), out.join('\n'), 'utf8');
  console.log('  public/assets/css/fonts-cyrillic.css yeniləndi');
};

const main = async () => {
  if (process.argv.includes('--cyrillic')) return fetchCyrillic();

  await mkdir(FONT_DIR, { recursive: true });

  const out = [
    '/*-----------------------------------*\\',
    '  #fonts.css — yerli şriftlər',
    '  scripts/fetch-fonts.mjs ilə yaradılıb, əl ilə redaktə etməyin.',
    '\\*-----------------------------------*/',
    '',
  ];

  let downloaded = 0;

  for (const family of FAMILIES) {
    const url = 'https://fonts.googleapis.com/css2?family=' + family + '&display=swap';
    const css = await fetchText(url);

    /* CSS-i @font-face bloklarına ayırırıq; hər blokdan əvvəl /* subset *​/ şərhi gəlir */
    const parts = css.split('/*').slice(1);

    for (const part of parts) {
      const subset = part.slice(0, part.indexOf('*/')).trim();
      if (!KEEP.includes(subset)) continue;

      const block = part.slice(part.indexOf('*/') + 2);

      const nameMatch = block.match(/font-family:\s*'([^']+)'/);
      const weightMatch = block.match(/font-weight:\s*([\d\s]+)/);
      const styleMatch = block.match(/font-style:\s*(\w+)/);
      const stretchMatch = block.match(/font-stretch:\s*([^;]+);/);
      const srcMatch = block.match(/src:\s*url\(([^)]+)\)\s*format\('([^']+)'\)/);
      const rangeMatch = block.match(/unicode-range:\s*([^;]+);/);

      if (!nameMatch || !srcMatch) continue;

      const name = nameMatch[1];
      const weight = (weightMatch ? weightMatch[1] : '400').trim();
      const style = styleMatch ? styleMatch[1] : 'normal';
      const remoteUrl = srcMatch[1];
      const format = srcMatch[2];

      const fileName =
        slug(name) + '-' + slug(weight) + '-' + style + '-' + subset + '.' + (format === 'woff2' ? 'woff2' : format);

      const response = await fetch(remoteUrl, { headers: { 'User-Agent': UA } });
      if (!response.ok) {
        console.warn('  ! yüklənmədi: ' + remoteUrl);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(join(FONT_DIR, fileName), buffer);
      downloaded++;

      out.push('@font-face {');
      out.push("  font-family: '" + name + "';");
      out.push('  font-style: ' + style + ';');
      out.push('  font-weight: ' + weight + ';');
      if (stretchMatch) out.push('  font-stretch: ' + stretchMatch[1].trim() + ';');
      out.push('  font-display: swap;');
      out.push("  src: url('../fonts/" + fileName + "') format('" + format + "');");
      if (rangeMatch) out.push('  unicode-range: ' + rangeMatch[1].trim() + ';');
      out.push('}');
      out.push('');

      console.log('  ✓ ' + fileName + '  (' + Math.round(buffer.length / 1024) + ' KB)');
    }
  }

  await writeFile(join(ROOT, 'public', 'assets', 'css', 'fonts.css'), out.join('\n'), 'utf8');
  console.log('\n  ' + downloaded + ' fayl yükləndi → public/assets/fonts/');
  console.log('  public/assets/css/fonts.css yeniləndi');

  await fetchCyrillic();
};

main().catch((err) => {
  console.error('Şrift yüklənməsi uğursuz:', err.message);
  process.exit(1);
});
