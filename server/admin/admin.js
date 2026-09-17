'use strict';

/**
 * İdarəetmə paneli — saytın bütün məzmunu buradan idarə olunur.
 * Xarici kitabxana yoxdur.
 */

(function () {

  /* ================================================================ *
   *  Köməkçilər
   * ================================================================ */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  const get = (obj, path) =>
    path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

  const set = (obj, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    let cur = obj;
    for (const key of keys) {
      if (cur[key] == null) cur[key] = /^\d+$/.test(key) ? [] : {};
      cur = cur[key];
    }
    cur[last] = value;
  };

  const api = async (path, options) => {
    const response = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
    let body = null;
    try { body = await response.json(); } catch (_) { /* boş cavab */ }
    if (!response.ok || (body && body.ok === false)) {
      const message = (body && body.error) || ('HTTP ' + response.status);
      const error = new Error(message);
      error.payload = body;
      throw error;
    }
    return body;
  };

  let toastTimer = null;
  const toast = (message, kind) => {
    const box = $('[data-toast]');
    box.textContent = message;
    box.className = 'toast ' + (kind || 'info');
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, kind === 'bad' ? 9000 : 4000);
  };

  const fmtSize = (bytes) => (bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB');

  /* ================================================================ *
   *  Vəziyyət
   * ================================================================ */

  const state = { site: null, content: null, theme: null, images: [], fonts: [], reservations: [],
    integration: null, siteUrl: '', caps: { mode: 'server', build: true, journal: true, integrationWrite: true, imageWrite: true, configWrite: true } };
  const dirty = new Set();

  const markDirty = (name) => {
    dirty.add(name);
    $('[data-dirty]').hidden = dirty.size === 0;
  };

  const clearDirty = (name) => {
    dirty.delete(name);
    $('[data-dirty]').hidden = dirty.size === 0;
  };

  window.addEventListener('beforeunload', (event) => {
    if (dirty.size) { event.preventDefault(); event.returnValue = ''; }
  });

  /* ================================================================ *
   *  Sahə sxemləri
   * ================================================================ */

  const f = (p, l, t, extra) => Object.assign({ p, l, t: t || 'text' }, extra || {});

  const SITE_SCHEMA = [
    {
      title: 'Ümumi',
      hint: 'Ad, domen və qısa təsvir',
      fields: [
        f('site.name', 'Restoranın adı'),
        f('site.shortName', 'Qısa ad'),
        f('site.logoTop', 'Loqonun üst sətri'),
        f('site.logoBottom', 'Loqonun alt sətri'),
        f('site.domain', 'Domen', 'text', { help: 'Nümunə: mangalsteakhouse.az' }),
        f('site.url', 'Tam ünvan', 'url', { help: 'https:// ilə başlamalıdır' }),
        f('site.tagline', 'Şüar', 'text', { full: true }),
        f('site.description', 'Axtarış sistemləri üçün təsvir', 'textarea', { full: true, help: '150–160 simvol ideal sayılır' }),
      ],
    },
    {
      title: 'Əlaqə',
      fields: [
        f('contact.phone', 'Telefon (göründüyü kimi)'),
        f('contact.phoneHref', 'Telefon (zəng üçün)', 'text', { help: 'Boşluqsuz: +994120000000' }),
        f('contact.mobile', 'Mobil (göründüyü kimi)'),
        f('contact.mobileHref', 'Mobil (zəng üçün)'),
        f('contact.whatsapp', 'WhatsApp nömrəsi', 'text', { help: 'Yalnız rəqəmlər: 994500000000' }),
        f('contact.email', 'E-mail', 'email'),
        f('contact.addressShort', 'Qısa ünvan'),
        f('contact.addressOneLine', 'Ünvan (bir sətir)'),
        f('contact.addressFull', 'Ünvan (çox sətir)', 'html', { full: true, help: 'Sətir keçidi üçün <br> yazın' }),
        f('contact.mapEmbed', 'Xəritə (embed ünvanı)', 'url', { full: true, help: 'Google Maps → Paylaş → Xəritəni yerləşdir' }),
        f('contact.mapLink', 'Xəritə (keçid)', 'url', { full: true }),
      ],
    },
    {
      title: 'İş saatları',
      fields: [
        f('hours.topbar', 'Üst zolaqda'),
        f('hours.short', 'Qısa yazılış'),
        f('hours.lunchTitle', 'Nahar başlığı'),
        f('hours.lunchValue', 'Nahar saatları', 'html'),
        f('hours.dinnerTitle', 'Şam başlığı'),
        f('hours.dinnerValue', 'Şam saatları', 'html'),
        f('hours.kitchenNote', 'Mətbəx qeydi', 'html', { full: true }),
      ],
    },
    {
      title: 'Sosial şəbəkələr',
      fields: [
        f('social.instagram', 'Instagram', 'url'),
        f('social.facebook', 'Facebook', 'url'),
        f('social.tiktok', 'TikTok', 'url'),
        f('social.youtube', 'YouTube', 'url'),
      ],
    },
    {
      title: 'Rezervasiya qaydaları',
      hint: 'Formadakı seçimləri müəyyən edir',
      fields: [
        f('reservation.minGuests', 'Minimum nəfər', 'number'),
        f('reservation.maxGuests', 'Maksimum nəfər', 'number'),
        f('reservation.openHour', 'İlk saat', 'number', { help: '0–23' }),
        f('reservation.closeHour', 'Son saat', 'number', { help: '0–23' }),
        f('reservation.slotMinutes', 'Saat aralığı (dəq)', 'number', { help: '30 = yarım saatlıq seçimlər' }),
        f('reservation.maxDaysAhead', 'Neçə gün əvvəlcədən', 'number'),
        f('reservation.timezoneOffset', 'Saat qurşağı', 'text', { help: 'Azərbaycan: +04:00' }),
      ],
    },
    {
      title: 'Rezervasiya zonaları',
      array: 'reservation.areas',
      label: (item) => item.label || 'Zona',
      blank: { value: '', label: '' },
      fields: [f('value', 'Kod', 'text', { help: 'Latın hərfləri, boşluqsuz' }), f('label', 'Göstərilən ad')],
    },
    {
      title: 'Rezervasiya səbəbləri',
      array: 'reservation.occasions',
      label: (item) => item.label || 'Səbəb',
      blank: { value: '', label: '' },
      fields: [f('value', 'Kod'), f('label', 'Göstərilən ad')],
    },
    {
      title: 'Footer',
      fields: [
        f('footer.newsletterTitle', 'Abunəlik başlığı'),
        f('footer.copyrightYear', 'Müəllif hüququ ili'),
        f('footer.newsletterText', 'Abunəlik mətni', 'html', { full: true }),
      ],
    },
  ];

  const CONTENT_SCHEMA = [
    {
      title: 'Ana səhifə slayderi',
      hint: 'Ən üstdə növbələşən şəkillər və mətnlər',
      array: 'hero.slides',
      label: (item, i) => item.subtitle || 'Slayd ' + (i + 1),
      blank: { image: '', subtitle: '', title: '', text: '' },
      fields: [
        f('image', 'Şəkil', 'image'),
        f('subtitle', 'Kiçik etiket'),
        f('title', 'Böyük başlıq', 'html', { full: true, help: 'Sətri bölmək üçün <br>' }),
        f('text', 'Alt mətn', 'textarea', { full: true }),
      ],
    },
    {
      title: 'Ana səhifə — giriş mətni',
      fields: [f('services.text', 'Üstünlüklər bölməsinin girişi', 'textarea', { full: true })],
    },
    {
      title: 'Üstünlüklər bölməsi',
      fields: [f('features.subtitle', 'Kiçik etiket'), f('features.title', 'Başlıq')],
    },
    {
      title: 'Üstünlük kartları',
      array: 'features.cards',
      label: (item) => item.title || 'Kart',
      blank: { title: '', text: '' },
      fields: [f('title', 'Başlıq'), f('text', 'Mətn', 'textarea', { full: true })],
    },
    {
      title: 'Şefin seçimi',
      fields: [
        f('specialDish.subtitle', 'Kiçik etiket'),
        f('specialDish.title', 'Yeməyin adı'),
        f('specialDish.oldPrice', 'Köhnə qiymət'),
        f('specialDish.newPrice', 'Yeni qiymət'),
        f('specialDish.text', 'Təsvir', 'textarea', { full: true }),
        f('specialDish.buttonText', 'Düymənin yazısı'),
        f('specialDish.buttonLink', 'Düymənin keçidi'),
      ],
    },
    {
      title: 'Menyu başlıqları',
      fields: [
        f('menu.subtitle', 'Menyu səhifəsi — etiket'),
        f('menu.title', 'Menyu səhifəsi — başlıq'),
        f('menu.note', 'Menyu qeydi', 'text', { full: true }),
        f('menuPreview.subtitle', 'Ana səhifə — etiket'),
        f('menuPreview.title', 'Ana səhifə — başlıq'),
        f('menuPreview.buttonText', 'Düymənin yazısı'),
        f('menuPreview.buttonLink', 'Düymənin keçidi'),
      ],
    },
    {
      title: 'Haqqımızda bölməsi',
      fields: [
        f('about.subtitle', 'Kiçik etiket'),
        f('about.title', 'Başlıq'),
        f('about.text', 'Mətn', 'textarea', { full: true }),
        f('about.callLabel', 'Telefon etiketi'),
        f('about.buttonText', 'Düymənin yazısı'),
        f('about.buttonLink', 'Düymənin keçidi'),
      ],
    },
    {
      title: 'Müştəri rəyi',
      fields: [
        f('testimonial.text', 'Rəy mətni', 'textarea', { full: true }),
        f('testimonial.author', 'Müəllif'),
      ],
    },
    {
      title: 'Tədbirlər bölməsi',
      fields: [
        f('events.subtitle', 'Kiçik etiket'),
        f('events.title', 'Başlıq'),
        f('events.buttonText', 'Düymənin yazısı'),
        f('events.buttonLink', 'Düymənin keçidi'),
      ],
    },
    {
      title: 'Tədbir kartları',
      array: 'events.cards',
      label: (item) => item.title || 'Tədbir',
      blank: { image: '', date: '', dateText: '', category: '', title: '' },
      fields: [
        f('image', 'Şəkil', 'image'),
        f('category', 'Kateqoriya'),
        f('date', 'Tarix', 'text', { help: 'Format: 2026-10-04' }),
        f('dateText', 'Tarix (göründüyü kimi)', 'text', { help: 'Nümunə: 04/10/2026' }),
        f('title', 'Başlıq', 'text', { full: true }),
      ],
    },
    {
      title: 'Qalereya bölməsi',
      fields: [
        f('gallery.subtitle', 'Kiçik etiket'),
        f('gallery.title', 'Başlıq'),
        f('gallery.text', 'Mətn', 'textarea', { full: true }),
      ],
    },
    {
      title: 'Qalereya şəkilləri',
      array: 'gallery.images',
      label: (item) => item.alt || item.src || 'Şəkil',
      blank: { src: '', alt: '' },
      fields: [f('src', 'Şəkil', 'image'), f('alt', 'Təsvir', 'text', { help: 'Şəkilin üzərində və axtarışda görünür' })],
    },
    {
      title: 'Haqqımızda səhifəsi',
      fields: [
        f('pages.haqqimizda.title', 'Səhifə başlığı'),
        f('pages.haqqimizda.subtitle', 'Kiçik etiket'),
        f('pages.haqqimizda.lead', 'Giriş mətni', 'textarea', { full: true }),
      ],
    },
    {
      title: 'Haqqımızda — mətn blokları',
      array: 'pages.haqqimizda.blocks',
      label: (item) => item.title || 'Blok',
      blank: { title: '', text: '' },
      fields: [f('title', 'Başlıq', 'text', { full: true }), f('text', 'Mətn', 'textarea', { full: true })],
    },
    {
      title: 'Haqqımızda — rəqəmlər',
      array: 'pages.haqqimizda.stats',
      label: (item) => (item.value || '') + ' ' + (item.label || ''),
      blank: { value: '', label: '' },
      fields: [f('value', 'Rəqəm'), f('label', 'İzah')],
    },
    {
      title: 'Tədbirlər səhifəsi',
      fields: [
        f('pages.tedbirler.title', 'Səhifə başlığı'),
        f('pages.tedbirler.subtitle', 'Kiçik etiket'),
        f('pages.tedbirler.lead', 'Giriş mətni', 'textarea', { full: true }),
      ],
    },
    {
      title: 'Banket paketləri',
      array: 'pages.tedbirler.packages',
      label: (item) => item.name || 'Paket',
      blank: { name: '', capacity: '', price: '', features: [] },
      fields: [
        f('name', 'Paketin adı'),
        f('capacity', 'Tutum', 'text', { help: 'Nümunə: 10–25 nəfər' }),
        f('price', 'Qiymət'),
        f('featured', 'Ən çox seçilən kimi işarələ', 'checkbox'),
        f('features', 'Daxil olanlar', 'stringlist', { full: true }),
      ],
    },
    {
      title: 'Rezervasiya səhifəsi',
      fields: [
        f('pages.rezervasiya.title', 'Səhifə başlığı'),
        f('pages.rezervasiya.subtitle', 'Kiçik etiket'),
        f('pages.rezervasiya.lead', 'Giriş mətni', 'textarea', { full: true }),
      ],
    },
    {
      title: 'Rezervasiya addımları',
      array: 'pages.rezervasiya.steps',
      label: (item) => item.title || 'Addım',
      blank: { num: '', title: '', text: '' },
      fields: [f('num', 'Nömrə', 'text', { help: 'Nümunə: 01' }), f('title', 'Başlıq'), f('text', 'Mətn', 'textarea', { full: true })],
    },
    {
      title: 'Rezervasiya qaydaları',
      stringArray: 'pages.rezervasiya.rules',
    },
    {
      title: 'Əlaqə səhifəsi',
      fields: [
        f('pages.elaqe.title', 'Səhifə başlığı'),
        f('pages.elaqe.subtitle', 'Kiçik etiket'),
        f('pages.elaqe.lead', 'Giriş mətni', 'textarea', { full: true }),
      ],
    },
    {
      title: 'Digər səhifə başlıqları',
      fields: [
        f('pages.menyu.title', 'Menyu — başlıq'),
        f('pages.menyu.subtitle', 'Menyu — etiket'),
        f('pages.qalereya.title', 'Qalereya — başlıq'),
        f('pages.qalereya.subtitle', 'Qalereya — etiket'),
      ],
    },
  ];

  const THEME_SCHEMA = [
    {
      title: 'Rənglər',
      hint: 'Saytın bütün rəngləri',
      fields: [
        f('colors.brand', 'Brend rəngi', 'color', { help: 'Üst zolaq və dolu düymələr' }),
        f('colors.brand2', 'Brend (açıq çalar)', 'color'),
        f('colors.gold', 'Vurğu rəngi', 'color', { help: 'Etiketlər, qiymətlər, xətlər' }),
        f('colors.black', 'Əsas fon', 'color'),
        f('colors.black2', 'İkinci fon', 'color', { help: 'Növbələşən bölmələr' }),
        f('colors.black3', 'Footer fonu', 'color'),
        f('colors.cream', 'Mətn rəngi', 'color'),
        f('colors.creamDim', 'Solğun mətn', 'color'),
      ],
    },
    {
      title: 'Şriftlər',
      fields: [
        f('fonts.display', 'Başlıq şrifti', 'font'),
        f('fonts.body', 'Mətn şrifti', 'font'),
        f('fonts.logo', 'Loqo şrifti', 'font'),
      ],
    },
    {
      title: 'Ölçülər',
      fields: [
        f('layout.sectionSpace', 'Bölmələr arası boşluq (px)', 'number', { help: 'Adi hal: 130' }),
        f('layout.logoSize', 'Loqo yazısının ölçüsü (px)', 'number'),
        f('layout.markSize', 'Loqo nişanının eni (px)', 'number'),
      ],
    },
    {
      title: 'Loqo',
      fields: [
        f('logo.mode', 'Loqo növü', 'select', {
          options: [
            { v: 'mark', t: 'Nişan + yazı' },
            { v: 'text', t: 'Yalnız yazı' },
            { v: 'image', t: 'Yüklənmiş şəkil' },
          ],
        }),
        f('logo.mark', 'Nişan', 'select', {
          options: [
            { v: 'bull', t: 'Buğa kəlləsi və şiş' },
            { v: 'flame', t: 'Alov və mangal' },
            { v: 'fork', t: 'Çəngəl və bıçaq' },
            { v: 'leaf', t: 'Yarpaq' },
          ],
        }),
        f('logo.image', 'Loqo şəkli', 'image', { full: true, help: 'Yalnız «Yüklənmiş şəkil» rejimində istifadə olunur' }),
      ],
    },
  ];

  /* ================================================================ *
   *  Sahə qurucuları
   * ================================================================ */

  const imageOptions = (select, value) => {
    select.innerHTML = '';
    select.appendChild(new Option('— seçilməyib —', ''));
    state.images.forEach((image) => select.appendChild(new Option(image.name, image.name)));
    if (value && !state.images.some((i) => i.name === value)) {
      select.appendChild(new Option(value + ' (tapılmadı)', value));
    }
    select.value = value || '';
  };

  const buildField = (field, configName, basePath) => {
    const fullPath = basePath ? basePath + '.' + field.p : field.p;
    const value = get(state[configName], fullPath);

    const wrap = el('div', 'field' + (field.full ? ' full' : ''));

    if (field.t !== 'checkbox') {
      wrap.appendChild(el('label', null, field.l));
    }

    const commit = (v) => { set(state[configName], fullPath, v); markDirty(configName); };

    let input;

    switch (field.t) {
      case 'textarea':
      case 'html':
        input = el('textarea');
        input.value = value == null ? '' : value;
        input.addEventListener('input', () => commit(input.value));
        break;

      case 'number':
        input = el('input');
        input.type = 'number';
        input.value = value == null ? '' : value;
        input.addEventListener('input', () => commit(input.value === '' ? 0 : Number(input.value)));
        break;

      case 'checkbox': {
        const row = el('label', 'color-row');
        input = el('input');
        input.type = 'checkbox';
        input.checked = Boolean(value);
        input.addEventListener('change', () => commit(input.checked));
        row.appendChild(input);
        row.appendChild(el('span', null, field.l));
        wrap.appendChild(row);
        if (field.help) wrap.appendChild(el('span', 'help', field.help));
        return wrap;
      }

      case 'color': {
        const row = el('div', 'color-row');
        input = el('input');
        input.type = 'color';
        input.value = value || '#000000';
        const text = el('input');
        text.type = 'text';
        text.value = value || '';
        input.addEventListener('input', () => { text.value = input.value; commit(input.value); updatePreview(); });
        text.addEventListener('input', () => {
          if (/^#[0-9a-fA-F]{6}$/.test(text.value)) { input.value = text.value; commit(text.value); updatePreview(); }
        });
        row.appendChild(input);
        row.appendChild(text);
        wrap.appendChild(row);
        if (field.help) wrap.appendChild(el('span', 'help', field.help));
        return wrap;
      }

      case 'select':
        input = el('select');
        (field.options || []).forEach((o) => input.appendChild(new Option(o.t, o.v)));
        input.value = value == null ? '' : value;
        input.addEventListener('change', () => commit(input.value));
        break;

      case 'font':
        input = el('select');
        state.fonts.forEach((name) => input.appendChild(new Option(name, name)));
        if (value && state.fonts.indexOf(value) === -1) input.appendChild(new Option(value, value));
        input.value = value || '';
        input.addEventListener('change', () => { commit(input.value); updatePreview(); });
        break;

      case 'image': {
        const row = el('div', 'img-pick');
        const thumb = el('img', 'thumb');
        thumb.alt = '';

        const showThumb = (name) => {
          if (name) {
            thumb.src = '/assets/images/' + name;
            thumb.style.visibility = 'visible';
          } else {
            thumb.removeAttribute('src');
            thumb.style.visibility = 'hidden';
          }
        };

        showThumb(value);

        input = el('select');
        imageOptions(input, value);
        input.addEventListener('change', () => {
          commit(input.value);
          showThumb(input.value);
        });
        row.appendChild(thumb);
        row.appendChild(input);
        wrap.appendChild(row);
        if (field.help) wrap.appendChild(el('span', 'help', field.help));
        return wrap;
      }

      case 'stringlist': {
        const list = el('div', 'list');
        const values = Array.isArray(value) ? value.slice() : [];

        const redraw = () => {
          list.innerHTML = '';
          values.forEach((line, index) => {
            const row = el('div', 'color-row');
            const text = el('input');
            text.type = 'text';
            text.value = line;
            text.addEventListener('input', () => { values[index] = text.value; commit(values.slice()); });
            const del = el('button', 'icon-btn danger', '×');
            del.type = 'button';
            del.title = 'Sil';
            del.addEventListener('click', () => { values.splice(index, 1); commit(values.slice()); redraw(); });
            row.appendChild(text);
            row.appendChild(del);
            list.appendChild(row);
          });

          const add = el('button', 'add-btn', '+ Sətir əlavə et');
          add.type = 'button';
          add.addEventListener('click', () => { values.push(''); commit(values.slice()); redraw(); });
          list.appendChild(add);
        };

        redraw();
        wrap.appendChild(list);
        return wrap;
      }

      default:
        input = el('input');
        input.type = field.t === 'number' ? 'number' : (field.t === 'email' ? 'email' : (field.t === 'url' ? 'url' : 'text'));
        input.value = value == null ? '' : value;
        input.addEventListener('input', () => commit(input.value));
    }

    wrap.appendChild(input);
    if (field.help) wrap.appendChild(el('span', 'help', field.help));
    return wrap;
  };

  /* ================================================================ *
   *  Qrup və siyahı qurucuları
   * ================================================================ */

  const buildGroup = (group, configName, closed) => {
    const box = el('section', 'group' + (closed ? ' is-closed' : ''));

    const head = el('button', 'group-head');
    head.type = 'button';
    const titleWrap = el('div');
    titleWrap.appendChild(el('h2', null, group.title));
    if (group.hint) titleWrap.appendChild(el('span', 'hint', group.hint));
    head.appendChild(titleWrap);
    head.appendChild(el('span', 'chev', '▾'));
    head.addEventListener('click', () => box.classList.toggle('is-closed'));
    box.appendChild(head);

    const body = el('div', 'group-body');
    box.appendChild(body);

    /* Siyahı qruplarında sahələr yalnız element daxilində göstərilir */
    if (group.fields && !group.array) {
      const grid = el('div', 'grid-2');
      group.fields.forEach((field) => grid.appendChild(buildField(field, configName)));
      body.appendChild(grid);
    }

    if (group.array) body.appendChild(buildArray(group, configName));
    if (group.stringArray) body.appendChild(buildStringArray(group, configName));

    return box;
  };

  const buildArray = (group, configName) => {
    const holder = el('div', 'list');

    const redraw = () => {
      holder.innerHTML = '';
      const list = get(state[configName], group.array) || [];

      list.forEach((item, index) => {
        const card = el('div', 'item is-closed');

        const head = el('div', 'item-head');
        head.appendChild(el('span', 'item-num', String(index + 1).padStart(2, '0')));

        const title = el('span', 'item-title', group.label ? group.label(item, index) : 'Element ' + (index + 1));
        title.addEventListener('click', () => card.classList.toggle('is-closed'));
        head.appendChild(title);

        const tools = el('div', 'item-tools');

        const up = el('button', 'icon-btn', '↑');
        up.type = 'button'; up.title = 'Yuxarı';
        up.addEventListener('click', () => {
          if (index === 0) return;
          list.splice(index - 1, 0, list.splice(index, 1)[0]);
          markDirty(configName); redraw();
        });

        const down = el('button', 'icon-btn', '↓');
        down.type = 'button'; down.title = 'Aşağı';
        down.addEventListener('click', () => {
          if (index === list.length - 1) return;
          list.splice(index + 1, 0, list.splice(index, 1)[0]);
          markDirty(configName); redraw();
        });

        const del = el('button', 'icon-btn danger', '×');
        del.type = 'button'; del.title = 'Sil';
        del.addEventListener('click', () => {
          if (!confirm('Bu elementi silmək istəyirsiniz?')) return;
          list.splice(index, 1);
          markDirty(configName); redraw();
        });

        tools.appendChild(up); tools.appendChild(down); tools.appendChild(del);
        head.appendChild(tools);
        card.appendChild(head);

        const body = el('div', 'item-body');
        const grid = el('div', 'grid-2');
        group.fields.forEach((field) => grid.appendChild(buildField(field, configName, group.array + '.' + index)));
        body.appendChild(grid);
        card.appendChild(body);

        holder.appendChild(card);
      });

      const add = el('button', 'add-btn', '+ Yeni əlavə et');
      add.type = 'button';
      add.addEventListener('click', () => {
        const current = get(state[configName], group.array) || [];
        current.push(JSON.parse(JSON.stringify(group.blank || {})));
        set(state[configName], group.array, current);
        markDirty(configName); redraw();
      });
      holder.appendChild(add);
    };

    redraw();
    return holder;
  };

  const buildStringArray = (group, configName) => {
    const holder = el('div', 'list');

    const redraw = () => {
      holder.innerHTML = '';
      const list = get(state[configName], group.stringArray) || [];

      list.forEach((line, index) => {
        const row = el('div', 'color-row');
        const input = el('input');
        input.type = 'text';
        input.value = line;
        input.addEventListener('input', () => { list[index] = input.value; markDirty(configName); });

        const del = el('button', 'icon-btn danger', '×');
        del.type = 'button';
        del.addEventListener('click', () => { list.splice(index, 1); markDirty(configName); redraw(); });

        row.appendChild(input);
        row.appendChild(del);
        holder.appendChild(row);
      });

      const add = el('button', 'add-btn', '+ Sətir əlavə et');
      add.type = 'button';
      add.addEventListener('click', () => {
        const current = get(state[configName], group.stringArray) || [];
        current.push('');
        set(state[configName], group.stringArray, current);
        markDirty(configName); redraw();
      });
      holder.appendChild(add);
    };

    redraw();
    return holder;
  };

  const renderForm = (selector, schema, configName) => {
    const host = $(selector);
    host.innerHTML = '';
    schema.forEach((group, index) => host.appendChild(buildGroup(group, configName, index > 0)));
  };

  /* ================================================================ *
   *  Menyu redaktoru
   * ================================================================ */

  const slugify = (text) =>
    String(text || '')
      .toLowerCase()
      .replace(/ə/g, 'e').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'kateqoriya';

  const renderMenu = () => {
    const host = $('[data-menu-editor]');
    host.innerHTML = '';

    const cats = state.content.menu.categories;

    cats.forEach((cat, ci) => {
      const box = el('section', 'group cat');

      const head = el('div', 'group-head');
      const left = el('div');
      left.appendChild(el('h2', null, cat.name || 'Kateqoriya'));
      left.appendChild(el('span', 'hint', (cat.items || []).length + ' yemək · kod: ' + cat.id));
      head.appendChild(left);

      const tools = el('div', 'item-tools');

      const up = el('button', 'icon-btn', '↑');
      up.type = 'button'; up.title = 'Yuxarı';
      up.addEventListener('click', () => {
        if (ci === 0) return;
        cats.splice(ci - 1, 0, cats.splice(ci, 1)[0]);
        markDirty('content'); renderMenu();
      });

      const down = el('button', 'icon-btn', '↓');
      down.type = 'button'; down.title = 'Aşağı';
      down.addEventListener('click', () => {
        if (ci === cats.length - 1) return;
        cats.splice(ci + 1, 0, cats.splice(ci, 1)[0]);
        markDirty('content'); renderMenu();
      });

      const del = el('button', 'icon-btn danger', '×');
      del.type = 'button'; del.title = 'Kateqoriyanı sil';
      del.addEventListener('click', () => {
        if (!confirm('«' + cat.name + '» kateqoriyası və içindəki bütün yeməklər silinsin?')) return;
        cats.splice(ci, 1);
        markDirty('content'); renderMenu();
      });

      const fold = el('button', 'icon-btn', '▾');
      fold.type = 'button'; fold.title = 'Aç / bağla';
      fold.addEventListener('click', () => box.classList.toggle('is-closed'));

      tools.appendChild(up); tools.appendChild(down); tools.appendChild(fold); tools.appendChild(del);
      head.appendChild(tools);
      box.appendChild(head);

      const body = el('div', 'group-body');

      const meta = el('div', 'grid-2');
      meta.appendChild(buildField(f('name', 'Kateqoriyanın adı'), 'content', 'menu.categories.' + ci));
      meta.appendChild(buildField(f('subtitle', 'Alt başlıq'), 'content', 'menu.categories.' + ci));
      meta.appendChild(buildField(f('id', 'Kod (menyu keçidi üçün)', 'text', { help: 'Latın hərfləri, boşluqsuz' }), 'content', 'menu.categories.' + ci));
      body.appendChild(meta);

      const items = el('div', 'cat-items');
      (cat.items || []).forEach((dish, di) => {
        const row = el('div', 'dish-row');
        const base = 'menu.categories.' + ci + '.items.' + di;

        row.appendChild(el('span', 'item-num', String(di + 1).padStart(2, '0')));
        row.appendChild(buildField(f('name', 'Yemək'), 'content', base));
        row.appendChild(buildField(f('price', 'Qiymət'), 'content', base));
        row.appendChild(buildField(f('badge', 'Nişan'), 'content', base));
        row.appendChild(buildField(f('text', 'Təsvir', 'textarea'), 'content', base));

        const tools2 = el('div', 'item-tools');
        const mUp = el('button', 'icon-btn', '↑');
        mUp.type = 'button';
        mUp.addEventListener('click', () => {
          if (di === 0) return;
          cat.items.splice(di - 1, 0, cat.items.splice(di, 1)[0]);
          markDirty('content'); renderMenu();
        });
        const mDown = el('button', 'icon-btn', '↓');
        mDown.type = 'button';
        mDown.addEventListener('click', () => {
          if (di === cat.items.length - 1) return;
          cat.items.splice(di + 1, 0, cat.items.splice(di, 1)[0]);
          markDirty('content'); renderMenu();
        });
        const mDel = el('button', 'icon-btn danger', '×');
        mDel.type = 'button';
        mDel.addEventListener('click', () => {
          cat.items.splice(di, 1);
          markDirty('content'); renderMenu();
        });
        tools2.appendChild(mUp); tools2.appendChild(mDown); tools2.appendChild(mDel);
        row.appendChild(tools2);

        items.appendChild(row);
      });

      const addDish = el('button', 'add-btn', '+ Yemək əlavə et');
      addDish.type = 'button';
      addDish.addEventListener('click', () => {
        if (!Array.isArray(cat.items)) cat.items = [];
        cat.items.push({ name: '', price: '', badge: '', text: '' });
        markDirty('content'); renderMenu();
      });

      body.appendChild(items);
      body.appendChild(addDish);
      box.appendChild(body);
      host.appendChild(box);
    });
  };

  /* ================================================================ *
   *  Şəkillər
   * ================================================================ */

  const renderImages = () => {
    const host = $('[data-images]');
    host.innerHTML = '';

    if (!state.images.length) {
      host.appendChild(el('p', 'muted', 'Hələ şəkil yoxdur.'));
      return;
    }

    state.images.forEach((image) => {
      const card = el('div', 'media');

      const img = el('img');
      img.src = '/assets/images/' + image.name + '?t=' + Date.now();
      img.alt = image.name;
      img.loading = 'lazy';
      card.appendChild(img);

      const info = el('div', 'media-info');
      info.appendChild(el('div', 'media-name', image.name));
      info.appendChild(el('div', 'media-meta', fmtSize(image.size)));
      card.appendChild(info);

      const actions = el('div', 'media-actions');

      const copy = el('button', 'btn btn-sm', 'Adı kopyala');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(image.name); toast('Kopyalandı: ' + image.name, 'ok'); }
        catch (_) { toast(image.name, 'info'); }
      });

      const del = el('button', 'btn btn-sm btn-danger', 'Sil');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!confirm(image.name + ' silinsin?')) return;
        try {
          const result = await api('/api/admin/images/delete', { method: 'POST', body: JSON.stringify({ name: image.name }) });
          state.images = result.images;
          renderImages();
          toast('Silindi.', 'ok');
        } catch (err) { toast(err.message, 'bad'); }
      });

      actions.appendChild(copy);
      actions.appendChild(del);
      card.appendChild(actions);

      host.appendChild(card);
    });
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Fayl oxunmadı.'));
      reader.readAsDataURL(file);
    });

  const handleUpload = async (files) => {
    const status = $('[data-upload-status]');
    status.innerHTML = '';

    for (const file of files) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const result = await api('/api/admin/images', {
          method: 'POST',
          body: JSON.stringify({ name: file.name, data: dataUrl }),
        });
        state.images = result.images;
        toast(
          result.deploy === 'queued'
            ? file.name + ' yükləndi — sayt 1–2 dəqiqəyə yenilənəcək.'
            : file.name + ' yükləndi.',
          'ok'
        );
      } catch (err) {
        const banner = el('div', 'banner bad', file.name + ': ' + err.message);
        status.appendChild(banner);
      }
    }

    renderImages();
    renderForm('[data-form="content"]', CONTENT_SCHEMA, 'content');
    renderForm('[data-form="theme"]', THEME_SCHEMA, 'theme');
  };

  /* ================================================================ *
   *  Dizayn önizləməsi
   * ================================================================ */

  const updatePreview = () => {
    const box = $('[data-theme-preview]');
    if (!box || !state.theme) return;

    const c = state.theme.colors || {};
    const fo = state.theme.fonts || {};

    box.style.background = c.black || '#121212';
    box.style.color = c.cream || '#FAF8F5';

    const bar = $('.pv-bar', box);
    bar.style.background = c.brand || '#4E0007';
    bar.style.color = c.cream || '#FAF8F5';

    $('.pv-label', box).style.color = c.gold || '#B99B6B';
    $('.pv-label', box).style.fontFamily = "'" + (fo.body || 'Inter') + "', sans-serif";

    const title = $('.pv-title', box);
    title.style.fontFamily = "'" + (fo.display || 'Cormorant Garamond') + "', serif";

    const text = $('.pv-text', box);
    text.style.fontFamily = "'" + (fo.body || 'Inter') + "', sans-serif";
    text.style.color = c.creamDim || '#A9A49C';

    const btn = $('.pv-btn', box);
    btn.style.background = c.brand || '#4E0007';
    btn.style.borderColor = c.brand2 || '#6B0A12';
    btn.style.color = c.cream || '#FAF8F5';
    btn.style.fontFamily = "'" + (fo.body || 'Inter') + "', sans-serif";
  };

  /* ================================================================ *
   *  Yadda saxlama və yayım
   * ================================================================ */

  const withBusy = async (button, label, fn) => {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try { await fn(); } finally { button.disabled = false; button.textContent = original; }
  };

  const saveConfig = async (name, button) => {
    await withBusy(button, 'Yadda saxlanılır…', async () => {
      try {
        const result = await api('/api/admin/config', {
          method: 'POST',
          body: JSON.stringify({ name, data: state[name] }),
        });
        clearDirty(name);
        $('[data-log]').textContent = result.log || '—';
        toast(
          result.deploy === 'queued'
            ? 'Yadda saxlanıldı. Sayt 1–2 dəqiqəyə yenilənəcək.'
            : 'Yadda saxlanıldı və sayt yeniləndi.',
          'ok'
        );
        if (name === 'site') refreshBrand();
      } catch (err) {
        $('[data-log]').textContent = (err.payload && err.payload.log) || err.message;
        toast(err.message, 'bad');
      }
    });
  };

  const publish = async (button) => {
    const pending = Array.from(dirty);
    await withBusy(button, 'Yayımlanır…', async () => {
      try {
        for (const name of pending) {
          await api('/api/admin/config', { method: 'POST', body: JSON.stringify({ name, data: state[name] }) });
          clearDirty(name);
        }
        const result = await api('/api/admin/build', { method: 'POST' });
        $('[data-log]').textContent = result.log || '—';

        if (state.caps.mode === 'git') {
          toast(pending.length
            ? 'Dəyişikliklər repoya yazıldı — sayt 1–2 dəqiqəyə yenilənəcək.'
            : 'Dəyişiklik yox idi.', 'ok');
        } else {
          toast(pending.length ? 'Dəyişikliklər yayımlandı.' : 'Sayt yenidən yığıldı.', 'ok');
        }

        refreshBrand();
      } catch (err) {
        $('[data-log]').textContent = (err.payload && err.payload.log) || err.message;
        toast(err.message, 'bad');
      }
    });
  };

  const refreshBrand = () => {
    const name = get(state.site, 'site.name');
    if (name) $('[data-site-name]').textContent = name;
  };

  /* ================================================================ *
   *  Rezervasiya sisteminin bağlantısı
   * ================================================================ */

  const INT_FIELDS = ['mode', 'apiUrl', 'apiKey', 'authHeader', 'authScheme',
    'restaurantId', 'fieldMap', 'extraFields', 'timeoutMs', 'maxAttempts'];

  const intInput = (name) => $('[data-int="' + name + '"]');

  const fillIntegration = (settings) => {
    state.integration = settings;

    INT_FIELDS.forEach((name) => {
      const input = intInput(name);
      if (!input) return;

      if (name === 'apiKey') { input.value = ''; return; }

      if (name === 'fieldMap' || name === 'extraFields') {
        const value = settings[name] || {};
        input.value = Object.keys(value).length ? JSON.stringify(value, null, 2) : '';
        return;
      }

      input.value = settings[name] == null ? '' : settings[name];
    });

    $('[data-key-hint]').textContent = settings.apiKeySet
      ? 'Açar yazılıb (' + settings.apiKeyHint + '). Dəyişmək üçün yenisini yazın, saxlamaq üçün boş buraxın.'
      : 'Açar hələ yazılmayıb.';

    if (state.caps && state.caps.integrationWrite === false) {
      $('[data-int-source]').textContent =
        'Parametrlər Vercel-in mühit dəyişənlərindən oxunur (Settings → Environment Variables)';
    } else {
      $('[data-int-source]').textContent = settings.source === 'panel'
        ? 'Parametrlər bu paneldən idarə olunur'
        : '.env faylından oxunur — burada dəyişsəniz panel üstün olacaq';
    }
  };

  const collectIntegration = () => {
    const out = {};
    INT_FIELDS.forEach((name) => {
      const input = intInput(name);
      if (input) out[name] = input.value;
    });
    return out;
  };

  const loadIntegration = async () => {
    try {
      const data = await api('/api/admin/integration');
      fillIntegration(data.settings);
    } catch (err) {
      toast('Bağlantı parametrləri yüklənmədi: ' + err.message, 'bad');
    }
  };

  const showIntLog = (text) => {
    const box = $('[data-int-log]');
    box.hidden = false;
    box.textContent = text;
  };

  /* ================================================================ *
   *  Çatdırılma jurnalı
   * ================================================================ */

  const AREA_LABELS = () => {
    const map = {};
    (get(state.site, 'reservation.areas') || []).forEach((a) => { map[a.value] = a.label; });
    return map;
  };

  const DELIVERY = {
    sent: ['Göndərildi', 'ok'],
    pending: ['Gözləyir', 'warn'],
    failed: ['Uğursuz', 'bad'],
    skipped: ['Göndərilmədi', 'muted'],
  };

  const pill = (map, key) => {
    const entry = map[key] || [key || '—', 'muted'];
    return el('span', 'pill ' + entry[1], entry[0]);
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const p = iso.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  };

  const renderReservations = () => {
    const tbody = $('[data-res-rows]');
    const areas = AREA_LABELS();

    const search = ($('[data-filter="search"]').value || '').trim().toLowerCase();
    const delivery = $('[data-filter="delivery"]').value;
    const from = $('[data-filter="from"]').value;
    const to = $('[data-filter="to"]').value;

    const list = state.reservations.filter((r) => {
      const status = (r.delivery || {}).status;
      if (delivery && status !== delivery) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (search && (r.name + ' ' + r.phone + ' ' + r.code).toLowerCase().indexOf(search) === -1) return false;
      return true;
    });

    tbody.innerHTML = '';

    if (!list.length) {
      const tr = el('tr');
      const td = el('td', 'empty', 'Qeyd tapılmadı.');
      td.colSpan = 8;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    list.forEach((r) => {
      const d = r.delivery || {};
      const tr = el('tr', r.status === 'manual' ? 'is-cancelled' : '');

      tr.appendChild(el('td', 'code nowrap', r.code));

      const when = el('td', 'nowrap');
      when.appendChild(el('strong', null, fmtDate(r.date)));
      when.appendChild(el('br'));
      when.appendChild(el('span', 'muted', r.time));
      tr.appendChild(when);

      const guest = el('td');
      guest.appendChild(document.createTextNode(r.name));
      guest.appendChild(el('br'));
      const tel = el('a', 'muted', r.phone);
      tel.href = 'tel:' + r.phone;
      guest.appendChild(tel);
      tr.appendChild(guest);

      tr.appendChild(el('td', 'nowrap', String(r.guests)));
      tr.appendChild(el('td', 'muted nowrap', areas[r.area] || r.area || '—'));

      const note = el('td', 'note-cell', r.note || '—');
      if (r.occasion) { note.appendChild(el('br')); note.appendChild(el('span', 'muted', r.occasion)); }
      tr.appendChild(note);

      const dv = el('td');
      dv.appendChild(pill(DELIVERY, d.status));
      if (r.status === 'manual') { dv.appendChild(el('br')); dv.appendChild(el('span', 'muted', 'əl ilə həll olunub')); }
      if (d.reference) { dv.appendChild(el('br')); dv.appendChild(el('span', 'muted', '#' + d.reference)); }
      if (d.lastError) {
        dv.appendChild(el('br'));
        const err = el('span', 'muted', String(d.lastError).slice(0, 44) + '…');
        err.title = d.lastError;
        dv.appendChild(err);
      }
      tr.appendChild(dv);

      const act = el('td');
      const tools = el('div', 'row-actions');

      const action = (label, fn) => {
        const b = el('button', 'btn btn-sm', label);
        b.type = 'button';
        b.addEventListener('click', async () => {
          b.disabled = true;
          try { await fn(); await loadReservations(); } catch (err) { toast(err.message, 'bad'); b.disabled = false; }
        });
        return b;
      };

      const unresolved = d.status === 'failed' || d.status === 'pending' || d.status === 'skipped';

      if (unresolved) {
        tools.appendChild(action('Yenidən göndər', () =>
          api('/api/admin/retry', { method: 'POST', body: JSON.stringify({ id: r.id }) })));
      }

      if (unresolved && r.status !== 'manual') {
        tools.appendChild(action('Əl ilə həll olundu', () =>
          api('/api/admin/resolve', { method: 'POST', body: JSON.stringify({ id: r.id, status: 'manual' }) })));
      }

      if (r.status === 'manual') {
        tools.appendChild(action('Geri qaytar', () =>
          api('/api/admin/resolve', { method: 'POST', body: JSON.stringify({ id: r.id, status: 'new' }) })));
      }

      act.appendChild(tools);
      tr.appendChild(act);

      tbody.appendChild(tr);
    });
  };

  const renderResStats = (meta) => {
    const today = new Date().toISOString().slice(0, 10);
    const list = state.reservations;

    const failed = list.filter((r) => {
      const s = (r.delivery || {}).status;
      return (s === 'pending' || s === 'failed') && r.status !== 'manual';
    }).length;

    const sent = list.filter((r) => (r.delivery || {}).status === 'sent').length;

    const cards = [
      [list.filter((r) => r.date === today).length, 'Bu gün gələn'],
      [list.filter((r) => r.createdAt && r.createdAt.slice(0, 10) === today).length, 'Bu gün sorğu'],
      [sent, 'Tətbiqə göndərilib'],
      [failed, 'Çatdırılmayıb'],
      [list.length, 'Ümumi'],
    ];

    const host = $('[data-res-stats]');
    host.innerHTML = '';
    cards.forEach((c) => {
      const card = el('div', 'card');
      card.appendChild(el('div', 'value', String(c[0])));
      card.appendChild(el('div', 'label', c[1]));
      host.appendChild(card);
    });

    const badge = $('[data-pending-badge]');
    badge.textContent = String(failed);
    badge.hidden = failed === 0;

    const banner = $('[data-res-banner]');
    banner.innerHTML = '';

    if (meta && meta.vilka && meta.vilka.mode === 'off') {
      banner.appendChild(el('div', 'banner warn',
        'Rejim «sönülü»dür — rezervasiyalar tətbiqə göndərilmir, yalnız aşağıdakı jurnalda saxlanılır.'));
    } else if (meta && meta.vilka && !meta.vilka.configured) {
      banner.appendChild(el('div', 'banner bad', 'API ünvanı təyin olunmayıb — göndərmə işləmir.'));
    } else if (failed > 0) {
      banner.appendChild(el('div', 'banner bad',
        failed + ' rezervasiya tətbiqə çatdırılmayıb. Sistem avtomatik təkrar cəhd edir; ' +
        'təcili hallarda qonaqla əlaqə saxlayıb tətbiqə əl ilə daxil edin.'));
    }
  };

  const loadReservations = async () => {
    try {
      const data = await api('/api/admin/reservations');
      state.reservations = data.reservations || [];
      renderResStats(data);
      renderReservations();
      renderSystem(data);
    } catch (err) {
      $('[data-res-rows]').innerHTML = '';
      const tr = el('tr');
      const td = el('td', 'empty', 'Yüklənmədi: ' + err.message);
      td.colSpan = 8;
      tr.appendChild(td);
      $('[data-res-rows]').appendChild(tr);
    }
  };

  /* ================================================================ *
   *  Sistem
   * ================================================================ */

  const renderSystem = (meta) => {
    const host = $('[data-system]');
    if (!host) return;

    const rows = [
      ['Bağlantı rejimi', meta && meta.vilka ? meta.vilka.mode : '—'],
      ['Ünvan', (meta && meta.vilka && meta.vilka.endpoint) || 'təyin olunmayıb'],
      ['Telegram bildirişi', meta && meta.telegram ? 'aktiv' : 'sönülü'],
      ['Jurnaldakı qeyd', String(state.reservations.length)],
      ['Şəkil sayı', String(state.images.length)],
      ['Menyu yeməkləri', String((state.content.menu.categories || []).reduce((n, c) => n + (c.items || []).length, 0))],
    ];

    host.innerHTML = '';
    rows.forEach((row) => {
      const card = el('div', 'card');
      card.appendChild(el('div', 'label', row[0]));
      card.appendChild(el('div', 'media-name', row[1]));
      host.appendChild(card);
    });
  };

  /* ================================================================ *
   *  Quruluşa uyğunlaşma (server / Vercel+GitHub)
   * ================================================================ */

  const applyCapabilities = () => {
    const caps = state.caps || {};
    const git = caps.mode === 'git';

    /* Yayım düymələrinin yazısı */
    if (git) {
      $('[data-publish]').textContent = 'Dəyişiklikləri yayımla';
      $$('[data-save]').forEach((b) => { b.textContent = 'Yadda saxla'; });
      $('.brand-sub').textContent = 'Sayt idarəetməsi · Vercel';
    }

    /* Yazma icazəsi yoxdursa */
    if (caps.configWrite === false) {
      $$('[data-save], [data-publish], [data-upload]').forEach((b) => { b.disabled = true; });
      const warn = el('div', 'banner bad',
        caps.error || 'Dəyişikliyi yadda saxlamaq mümkün deyil: GITHUB_TOKEN və GITHUB_REPO təyin olunmayıb.');
      $('.content').prepend(warn);
    }

    /* Yığma düyməsi */
    if (!caps.build) {
      const rebuild = $('[data-rebuild]');
      if (rebuild) rebuild.hidden = true;
    }

    /* Çatdırılma jurnalı */
    if (!caps.journal) {
      const panel = $('[data-panel="rezervasiya"]');
      const journalHead = Array.prototype.find.call(panel.querySelectorAll('.sys-h'), (h) => true);
      if (journalHead) journalHead.hidden = true;
      const toolbar = panel.querySelector('.toolbar');
      if (toolbar) toolbar.hidden = true;
      const table = panel.querySelector('.table-wrap');
      if (table) {
        table.hidden = true;
        const note = el('div', 'banner warn',
          'Bu quruluşda rezervasiya jurnalı saxlanılmır. Sorğular birbaşa rezervasiya tətbiqinə göndərilir — ' +
          'ehtiyat üçün Telegram bildirişini mütləq qoşun (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).');
        table.parentNode.insertBefore(note, table);
      }
      const stats = $('[data-res-stats]');
      if (stats) stats.hidden = true;
    }

    /* Bağlantı parametrləri yalnız oxunur */
    if (caps.integrationWrite === false) {
      $$('[data-int]').forEach((input) => { input.disabled = true; });
      const save = $('[data-save-integration]');
      if (save) save.hidden = true;
      $('[data-int-source]').textContent =
        'Parametrlər Vercel-in mühit dəyişənlərindən oxunur (Settings → Environment Variables)';
    }

    /* Repo məlumatı */
    if (git && caps.repo) {
      const note = $('[data-panel="sistem"] .help');
      if (note) {
        const line = el('p', null, 'Dəyişikliklər «' + caps.repo + '» reposunun «' + caps.branch + '» budağına yazılır.');
        note.prepend(line);
      }
    }
  };

  /* ================================================================ *
   *  Tablar
   * ================================================================ */

  const initTabs = () => {
    $$('.nav-item').forEach((button) => {
      button.addEventListener('click', () => {
        $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b === button));
        const name = button.dataset.tab;
        $$('.tab').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === name));
        window.scrollTo(0, 0);
        if (name === 'dizayn') updatePreview();
      });
    });
  };

  /* ================================================================ *
   *  Başlanğıc
   * ================================================================ */

  const init = async () => {
    initTabs();

    try {
      const data = await api('/api/admin/config');
      state.site = data.site;
      state.content = data.content;
      state.theme = data.theme;
      state.images = data.images || [];
      state.fonts = data.fonts || [];
      state.siteUrl = data.site_url || '';
      if (data.capabilities) state.caps = data.capabilities;
    } catch (err) {
      toast('Konfiqurasiya yüklənmədi: ' + err.message, 'bad');
      return;
    }

    refreshBrand();
    applyCapabilities();
    renderForm('[data-form="site"]', SITE_SCHEMA, 'site');
    renderForm('[data-form="content"]', CONTENT_SCHEMA, 'content');
    renderForm('[data-form="theme"]', THEME_SCHEMA, 'theme');
    renderMenu();
    renderImages();
    updatePreview();
    await loadReservations();

    $$('[data-save]').forEach((button) => {
      button.addEventListener('click', () => saveConfig(button.dataset.save, button));
    });

    $('[data-publish]').addEventListener('click', (event) => publish(event.currentTarget));

    $('[data-rebuild]').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, 'Yığılır…', async () => {
        try {
          const result = await api('/api/admin/build', { method: 'POST' });
          $('[data-log]').textContent = result.log || '—';
          toast('Sayt yenidən yığıldı.', 'ok');
        } catch (err) {
          $('[data-log]').textContent = (err.payload && err.payload.log) || err.message;
          toast(err.message, 'bad');
        }
      });
    });

    $('[data-add-category]').addEventListener('click', () => {
      const name = prompt('Yeni kateqoriyanın adı:');
      if (!name) return;
      state.content.menu.categories.push({ id: slugify(name), name, subtitle: '', items: [] });
      markDirty('content');
      renderMenu();
    });

    $('[data-upload]').addEventListener('change', (event) => {
      const files = Array.prototype.slice.call(event.target.files || []);
      event.target.value = '';
      if (files.length) handleUpload(files);
    });

    await loadIntegration();

    $('[data-refresh-res]').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, 'Yenilənir…', async () => {
        await loadReservations();
        await loadIntegration();
      });
    });

    $('[data-save-integration]').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, 'Saxlanılır…', async () => {
        try {
          const result = await api('/api/admin/integration', {
            method: 'POST',
            body: JSON.stringify(collectIntegration()),
          });
          fillIntegration(result.settings);
          toast('Bağlantı yadda saxlanıldı.', 'ok');
          await loadReservations();
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
    });

    $('[data-int-preview]').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, 'Hazırlanır…', async () => {
        try {
          const result = await api('/api/admin/integration/preview');
          showIntLog(
            result.preview.method + ' ' + result.preview.url + '\n\n' +
            JSON.stringify(result.preview.headers, null, 2) + '\n\n' +
            JSON.stringify(result.preview.body, null, 2)
          );
        } catch (err) { toast(err.message, 'bad'); }
      });
    });

    $('[data-int-test]').addEventListener('click', async (event) => {
      if (!confirm('Sınaq rezervasiyası göndərilsin?\n\nTətbiqdə real qeyd yarana bilər — sonra silin.')) return;

      await withBusy(event.currentTarget, 'Göndərilir…', async () => {
        try {
          const result = await api('/api/admin/integration/test', { method: 'POST' });
          showIntLog('Uğurlu. Tətbiqdəki nömrə: ' + (result.reference || '(qaytarılmadı)'));
          toast('Sınaq göndərişi uğurlu oldu.', 'ok');
        } catch (err) {
          showIntLog('Uğursuz: ' + err.message);
          toast('Sınaq göndərişi alınmadı.', 'bad');
        }
      });
    });

    $$('[data-filter]').forEach((input) => {
      input.addEventListener('input', renderReservations);
      input.addEventListener('change', renderReservations);
    });

    $('[data-filter-reset]').addEventListener('click', () => {
      $$('[data-filter]').forEach((input) => { input.value = ''; });
      renderReservations();
    });

    setInterval(loadReservations, 60000);
  };

  init();

})();
