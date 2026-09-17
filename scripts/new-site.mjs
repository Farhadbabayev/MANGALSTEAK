#!/usr/bin/env node
/**
 * Yeni restoran üçün sıfırlama.
 *
 *   npm run new-site -- --yes
 *
 * Mətnləri boş şablona qaytarır, köhnə konfiqurasiyanı və rezervasiyaları
 * data/backups/ qovluğuna köçürür. Şəkillər və kod toxunulmadan qalır.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP = join(ROOT, 'data', 'backups');

if (!process.argv.includes('--yes')) {
  console.log(`
  Bu əmr saytın bütün mətnlərini boş şablona qaytarır.
  Köhnə məlumatlar data/backups/ qovluğuna köçürüləcək.

  Davam etmək üçün:  npm run new-site -- --yes
`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (!existsSync(BACKUP)) mkdirSync(BACKUP, { recursive: true });

const archive = (file) => {
  const path = join(ROOT, file);
  if (!existsSync(path)) return;
  const name = file.replace(/[/\\]/g, '_');
  writeFileSync(join(BACKUP, `${stamp}-${name}`), readFileSync(path));
};

for (const file of ['site.config.json', 'content.config.json', 'theme.config.json']) archive(file);

/* Rezervasiyalar da arxivə köçürülür */
const reservations = join(ROOT, 'data', 'reservations.jsonl');
if (existsSync(reservations)) {
  renameSync(reservations, join(BACKUP, `${stamp}-reservations.jsonl`));
}

/* ------------------------------------------------------------------ *
 *  Boş şablon
 * ------------------------------------------------------------------ */

const site = {
  _comment: 'Saytdakı BÜTÜN məlumatlar buradan idarə olunur. Admin panel: /admin',
  site: {
    name: 'Restoranın adı',
    shortName: 'Restoran',
    logoTop: 'Restoran',
    logoBottom: 'Adı',
    domain: 'example.az',
    url: 'https://example.az',
    tagline: 'Qısa şüar',
    description: 'Restoran haqqında bir cümləlik təsvir — axtarış sistemlərində görünür.',
    locale: 'az_AZ',
    lang: 'az',
  },
  contact: {
    addressShort: 'Küçə 00, Bakı',
    addressFull: 'Küçə 00, rayon,<br> Bakı, Azərbaycan',
    addressOneLine: 'Küçə 00, rayon, Bakı, Azərbaycan',
    phone: '+994 12 000 00 00',
    phoneHref: '+994120000000',
    mobile: '+994 50 000 00 00',
    mobileHref: '+994500000000',
    whatsapp: '994500000000',
    email: 'info@example.az',
    mapEmbed: 'https://www.google.com/maps?q=Baku&output=embed',
    mapLink: 'https://maps.google.com/?q=Baku',
  },
  hours: {
    topbar: 'Hər gün: 10:00 – 23:00',
    short: 'Hər gün 10:00 – 23:00',
    lunchTitle: 'Nahar saatları',
    lunchValue: 'Bazar ertəsi – Bazar<br> 10:00 – 16:00',
    dinnerTitle: 'Şam yeməyi',
    dinnerValue: 'Bazar ertəsi – Bazar<br> 17:00 – 23:00',
    kitchenNote: 'Mətbəx sifarişləri saat <span class="span">22:30</span>-a qədər qəbul edir',
  },
  social: {
    instagram: 'https://instagram.com/',
    facebook: 'https://facebook.com/',
    tiktok: 'https://tiktok.com/',
    youtube: 'https://youtube.com/',
  },
  reservation: {
    minGuests: 1,
    maxGuests: 20,
    openHour: 10,
    closeHour: 22,
    slotMinutes: 30,
    maxDaysAhead: 90,
    timezoneOffset: '+04:00',
    areas: [
      { value: 'salon', label: 'Əsas salon' },
      { value: 'terrace', label: 'Terras' },
      { value: 'vip', label: 'VIP otaq' },
      { value: 'any', label: 'Fərqi yoxdur' },
    ],
    occasions: [
      { value: '', label: 'Səbəb (istəyə bağlı)' },
      { value: 'ad-gunu', label: 'Ad günü' },
      { value: 'is-gorusu', label: 'İş görüşü' },
      { value: 'diger', label: 'Digər' },
    ],
  },
  footer: {
    newsletterTitle: 'Xəbər və kampaniyalar',
    newsletterText: 'Abunə olun, yeniliklərdən ilk siz xəbər tutun.',
    copyrightYear: String(new Date().getFullYear()),
  },
};

const dish = (name) => ({ name, price: '0 ₼', badge: '', text: 'Yeməyin qısa təsviri.' });

const content = {
  _comment: 'Menyu, qalereya, xəbərlər və səhifə mətnləri. Admin panel: /admin',
  hero: {
    slides: [
      { image: 'hero-slider-1.jpg', subtitle: 'Kiçik etiket', title: 'Əsas başlıq', text: 'Bir-iki cümləlik giriş mətni.' },
    ],
  },
  services: { text: 'Restoranın qısa təqdimatı — bu mətn ana səhifədə üstünlüklərin üstündə görünür.' },
  about: {
    subtitle: 'Bizim hekayə',
    title: 'Hekayəmizin başlığı',
    text: 'Restoranın hekayəsi burada yazılır.',
    callLabel: 'Telefonla rezervasiya',
    buttonText: 'Ətraflı oxu',
    buttonLink: 'haqqimizda.html',
  },
  specialDish: {
    subtitle: 'Şefin seçimi',
    title: 'Yeməyin adı',
    text: 'Yeməyin təsviri.',
    oldPrice: '0 ₼',
    newPrice: '0 ₼',
    buttonText: 'Bütün menyu',
    buttonLink: 'menyu.html',
  },
  menuPreview: {
    subtitle: 'Xüsusi seçim',
    title: 'Menyumuzdan',
    buttonText: 'Bütün menyuya bax',
    buttonLink: 'menyu.html',
  },
  testimonial: { text: 'Müştəri rəyi burada yazılır.', author: 'Ad Soyad' },
  features: {
    subtitle: 'Niyə biz?',
    title: 'Güclü tərəflərimiz',
    cards: [
      { title: 'Birinci üstünlük', text: 'Qısa izah.' },
      { title: 'İkinci üstünlük', text: 'Qısa izah.' },
      { title: 'Üçüncü üstünlük', text: 'Qısa izah.' },
      { title: 'Dördüncü üstünlük', text: 'Qısa izah.' },
    ],
  },
  events: {
    subtitle: 'Son xəbərlər',
    title: 'Yaxınlaşan tədbirlər',
    buttonText: 'Bütün tədbirlər',
    buttonLink: 'tedbirler.html',
    cards: [
      { image: 'event-1.jpg', date: '2026-01-01', dateText: '01/01/2026', category: 'Kateqoriya', title: 'Tədbirin adı' },
    ],
  },
  menu: {
    subtitle: 'Menyu',
    title: 'Menyumuz',
    note: 'Bütün qiymətlərə ƏDV daxildir.',
    categories: [
      { id: 'esas', name: 'Əsas yeməklər', subtitle: 'Alt başlıq', items: [dish('Birinci yemək'), dish('İkinci yemək')] },
      { id: 'salatlar', name: 'Salatlar', subtitle: 'Alt başlıq', items: [dish('Salat')] },
      { id: 'ickiler', name: 'İçkilər', subtitle: 'Alt başlıq', items: [dish('İçki')] },
    ],
  },
  gallery: {
    subtitle: 'Obyektivdən',
    title: 'Qalereya',
    text: 'Restorandan bir neçə kadr.',
    images: [
      { src: 'hero-slider-1.jpg', alt: 'Şəkil' },
      { src: 'event-1.jpg', alt: 'Şəkil' },
      { src: 'about-banner.jpg', alt: 'Şəkil' },
    ],
  },
  pages: {
    haqqimizda: {
      title: 'Haqqımızda',
      subtitle: 'Kiçik etiket',
      lead: 'Giriş cümləsi.',
      blocks: [{ title: 'Blokun başlığı', text: 'Blokun mətni.' }],
      stats: [
        { value: '0', label: 'il təcrübə' },
        { value: '0', label: 'oturacaq' },
        { value: '0', label: 'yemək' },
        { value: '0', label: 'reytinq' },
      ],
    },
    tedbirler: {
      title: 'Tədbirlər',
      subtitle: 'Kiçik etiket',
      lead: 'Giriş cümləsi.',
      packages: [
        { name: 'Paketin adı', capacity: '0–0 nəfər', price: '0 ₼ / nəfər', features: ['Daxil olan xidmət'] },
      ],
    },
    elaqe: { title: 'Əlaqə', subtitle: 'Bizi tapın', lead: 'Giriş cümləsi.' },
    qalereya: { title: 'Qalereya', subtitle: 'Kiçik etiket' },
    menyu: { title: 'Menyu', subtitle: 'Kiçik etiket' },
    rezervasiya: {
      title: 'Rezervasiya',
      subtitle: 'Üç sadə addım',
      lead: 'Formanı doldurun — sorğunuz birbaşa restorana çatır.',
      steps: [
        { num: '01', title: 'Formanı doldurun', text: 'Tarix, saat və nəfər sayını seçin.' },
        { num: '02', title: 'Sorğu qeydə alınır', text: 'Sizə rezervasiya kodu verilir.' },
        { num: '03', title: 'Təsdiq', text: 'Heyətimiz sizinlə əlaqə saxlayır.' },
      ],
      rules: ['Birinci qayda.', 'İkinci qayda.'],
    },
  },
};

const theme = {
  _comment: 'Rənglər, şriftlər və loqo. Admin panel: /admin',
  colors: {
    black: '#121212',
    black2: '#181817',
    black3: '#0D0D0D',
    cream: '#FAF8F5',
    creamDim: '#A9A49C',
    gold: '#B99B6B',
    brand: '#2B2B2B',
    brand2: '#3A3A3A',
  },
  fonts: { display: 'Cormorant Garamond', body: 'Inter', logo: 'Cormorant Garamond' },
  layout: { sectionSpace: 130, logoSize: 26, markSize: 24 },
  logo: { mode: 'text', mark: 'fork', image: '' },
};

const write = (file, data) =>
  writeFileSync(join(ROOT, file), JSON.stringify(data, null, 2) + '\n', 'utf8');

write('site.config.json', site);
write('content.config.json', content);
write('theme.config.json', theme);

console.log(`
  Şablon hazırdır. Köhnə məlumatlar: data/backups/${stamp}-*

  Növbəti addımlar:
    1. npm run build        — saytı yığın
    2. npm start            — serveri işə salın
    3. /admin               — məlumatları, menyunu, şəkilləri və rəngləri doldurun

  Unutmayın: .env faylında ADMIN_PASSWORD və rezervasiya sisteminin
  ünvanını təyin edin.
`);
