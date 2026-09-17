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
   *  Başlıq və "yuxarı qayıt"
   * ---------------------------------------------------------------- */

  const header = document.querySelector('[data-header]');
  const backTop = document.querySelector('[data-back-top-btn]');

  let lastScroll = 0;

  window.addEventListener(
    'scroll',
    function () {
      const y = window.scrollY;

      if (backTop) backTop.classList.toggle('show', y > 600);

      if (header && !document.body.classList.contains('nav-open')) {
        header.classList.toggle('hide', y > lastScroll && y > 320);
      }

      lastScroll = y;
    },
    { passive: true }
  );


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

})();
