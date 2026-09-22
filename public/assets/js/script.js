'use strict';

/**
 * Mangal Steak House — ümumi skriptlər
 * Xarici kitabxana yoxdur.
 */

(function () {

  /* ---------------------------------------------------------------- *
   *  Mobil menyu
   * ---------------------------------------------------------------- */

  const navToggler = document.querySelector('[data-nav-toggler]');
  const navbar = document.querySelector('[data-navbar]');

  const setNav = function (open) {
    document.body.classList.toggle('nav-open', open);
    if (navToggler) {
      navToggler.setAttribute('aria-expanded', String(open));
      navToggler.setAttribute('aria-label', open ? 'Menyunu bağla' : 'Menyunu aç');
    }
  };

  if (navToggler && navbar) {
    navToggler.addEventListener('click', function () {
      setNav(!document.body.classList.contains('nav-open'));
    });

    navbar.addEventListener('click', function (event) {
      if (event.target.closest('a')) setNav(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && document.body.classList.contains('nav-open')) setNav(false);
    });
  }


  /* ---------------------------------------------------------------- *
   *  Başlıq fonu, "yuxarı qayıt" və üzən rezervasiya düyməsi
   *
   *  Scroll hadisəsi əvəzinə səhifənin başındakı iki görünməz
   *  "gözətçi" izlənir: biri çıxanda başlıq bərkiyir, digəri çıxanda
   *  (hero keçildikdə) üzən düymələr görünür.
   * ---------------------------------------------------------------- */

  const sentinels = document.querySelectorAll('[data-sentinel]');

  if (sentinels.length && 'IntersectionObserver' in window) {
    const stateFor = { header: 'is-scrolled', top: 'is-past-hero' };

    const sentinelObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        const cls = stateFor[entry.target.getAttribute('data-sentinel')];
        if (cls) document.body.classList.toggle(cls, !entry.isIntersecting);
      });
    });

    sentinels.forEach(function (el) { sentinelObserver.observe(el); });
  } else {
    document.body.classList.add('is-scrolled', 'is-past-hero');
  }


  /* ---------------------------------------------------------------- *
   *  Şəbəkə pəncərələri: şüşə görünəndə bir dəfə işıqlanır
   * ---------------------------------------------------------------- */

  const windows = document.querySelectorAll('.window');

  if (windows.length) {
    if (!('IntersectionObserver' in window)) {
      windows.forEach(function (el) { el.classList.add('is-lit'); });
    } else {
      const windowObserver = new IntersectionObserver(
        function (entries, obs) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            /* Tağ açılışı ilə üst-üstə düşməsin deyə bir az gözləyirik */
            const el = entry.target;
            window.setTimeout(function () { el.classList.add('is-lit'); }, 420);
            obs.unobserve(el);
          });
        },
        { threshold: 0.35 }
      );

      windows.forEach(function (el) { windowObserver.observe(el); });
    }
  }


  /* ---------------------------------------------------------------- *
   *  Hero slayder (yalnız ana səhifədə)
   * ---------------------------------------------------------------- */

  const slides = document.querySelectorAll('[data-hero-slide]');
  const dots = document.querySelectorAll('[data-hero-dot]');

  if (slides.length > 1) {
    const labelEl = document.querySelector('[data-hero-label]');
    const titleEl = document.querySelector('[data-hero-title]');
    const textEl = document.querySelector('[data-hero-text]');

    let current = 0;
    let timer = null;

    const show = function (index) {
      current = (index + slides.length) % slides.length;

      slides.forEach(function (slide, i) {
        slide.classList.toggle('active', i === current);
      });

      dots.forEach(function (dot, i) {
        dot.classList.toggle('active', i === current);
      });

      const data = slides[current].dataset;
      if (labelEl) labelEl.textContent = data.label || '';
      if (titleEl) titleEl.innerHTML = data.title || '';
      if (textEl) textEl.textContent = data.text || '';
    };

    const start = function () {
      stop();
      timer = setInterval(function () { show(current + 1); }, 7000);
    };

    const stop = function () {
      if (timer) clearInterval(timer);
      timer = null;
    };

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        show(i);
        start();
      });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    start();
  }


  /* ---------------------------------------------------------------- *
   *  Menyu bölmələri — aktiv keçid
   * ---------------------------------------------------------------- */

  const menuLinks = document.querySelectorAll('.menu-nav a');

  if (menuLinks.length && 'IntersectionObserver' in window) {
    const categories = document.querySelectorAll('.menu-category');

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          menuLinks.forEach(function (link) {
            link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id);
          });
        });
      },
      { rootMargin: '-130px 0px -68% 0px' }
    );

    categories.forEach(function (category) { observer.observe(category); });
  }


  /* ---------------------------------------------------------------- *
   *  Sürüşdürdükcə üzə çıxma
   * ---------------------------------------------------------------- */

  const revealItems = document.querySelectorAll('.reveal');

  if (revealItems.length) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || !('IntersectionObserver' in window)) {
      revealItems.forEach(function (el) { el.classList.add('in'); });
    } else {
      const observer = new IntersectionObserver(
        function (entries, obs) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('in');
            obs.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
      );

      revealItems.forEach(function (el) { observer.observe(el); });
    }
  }


  /* ---------------------------------------------------------------- *
   *  Rezervasiya pəncərəsi (sağ aşağıdakı üzən düymə)
   * ---------------------------------------------------------------- */

  const rezModal = document.querySelector('[data-rez-modal]');
  const rezPanel = rezModal && rezModal.querySelector('[data-rez-panel]');
  const rezOpeners = document.querySelectorAll('[data-rez-open]');

  if (rezModal && rezPanel && rezOpeners.length) {

    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled])';

    /* Görünən və klaviatura ilə gəzilə bilən elementlər */
    const focusables = function () {
      return Array.prototype.filter.call(
        rezPanel.querySelectorAll(FOCUSABLE),
        function (el) { return el.tabIndex !== -1 && el.offsetWidth + el.offsetHeight > 0; }
      );
    };

    const isOpen = function () { return document.body.classList.contains('rez-open'); };

    let lastFocused = null;

    const openRez = function () {
      if (isOpen()) return;

      lastFocused = document.activeElement;
      setNav(false);
      document.body.classList.add('rez-open');

      rezOpeners.forEach(function (btn) { btn.setAttribute('aria-expanded', 'true'); });

      /* Saat siyahısı yenidən hesablansın — keçmiş saatlar təklif olunmasın */
      rezPanel.dispatchEvent(new CustomEvent('reservation:refresh'));

      /* Toxunma ekranlarında klaviatura özbaşına açılmasın deyə bağlama düyməsi seçilir */
      const pointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const nameInput = rezPanel.querySelector('[data-field="name"]');
      const items = focusables();

      window.setTimeout(function () {
        if (pointer && nameInput && nameInput.offsetParent !== null) nameInput.focus();
        else if (items.length) items[0].focus();
      }, 80);
    };

    const closeRez = function () {
      if (!isOpen()) return;

      document.body.classList.remove('rez-open');
      rezOpeners.forEach(function (btn) { btn.setAttribute('aria-expanded', 'false'); });

      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
      lastFocused = null;
    };

    rezOpeners.forEach(function (btn) {
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-expanded', 'false');

      btn.addEventListener('click', function (event) {
        event.preventDefault();
        openRez();
      });
    });

    /* Bağlama düyməsi və arxa fon */
    rezModal.addEventListener('click', function (event) {
      if (event.target.closest('[data-rez-close]')) closeRez();
    });

    document.addEventListener('keydown', function (event) {
      if (!isOpen()) return;

      if (event.key === 'Escape') {
        closeRez();
        return;
      }

      if (event.key !== 'Tab') return;

      /* Fokus pəncərənin içində qalsın */
      const items = focusables();
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];
      const inside = rezPanel.contains(document.activeElement);

      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    });
  }

})();
