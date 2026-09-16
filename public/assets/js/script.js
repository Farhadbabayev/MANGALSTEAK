'use strict';

/**
 * Mangal Steak House — ümumi skriptlər
 * (grilli şablonu əsasında, çoxsəhifəli sayt üçün uyğunlaşdırılıb)
 */


/**
 * PRELOADER
 */

const preloader = document.querySelector("[data-preaload]");

window.addEventListener("load", function () {
  if (preloader) preloader.classList.add("loaded");
  document.body.classList.add("loaded");
});


/**
 * bir neçə elementə eyni hadisəni bağlamaq
 */

const addEventOnElements = function (elements, eventType, callback) {
  for (let i = 0, len = elements.length; i < len; i++) {
    if (elements[i]) elements[i].addEventListener(eventType, callback);
  }
}


/**
 * NAVBAR
 */

const navbar = document.querySelector("[data-navbar]");
const navTogglers = document.querySelectorAll("[data-nav-toggler]");
const overlay = document.querySelector("[data-overlay]");

const toggleNavbar = function () {
  if (!navbar || !overlay) return;
  navbar.classList.toggle("active");
  overlay.classList.toggle("active");
  document.body.classList.toggle("nav-active");
}

addEventOnElements(navTogglers, "click", toggleNavbar);


/**
 * HEADER & YUXARI QAYIT DÜYMƏSİ
 */

const header = document.querySelector("[data-header]");
const backTopBtn = document.querySelector("[data-back-top-btn]");

let lastScrollPos = 0;

const hideHeader = function () {
  if (!header) return;
  const isScrollBottom = lastScrollPos < window.scrollY;
  if (isScrollBottom) {
    header.classList.add("hide");
  } else {
    header.classList.remove("hide");
  }

  lastScrollPos = window.scrollY;
}

window.addEventListener("scroll", function () {
  if (window.scrollY >= 50) {
    if (header) header.classList.add("active");
    if (backTopBtn) backTopBtn.classList.add("active");
    hideHeader();
  } else {
    if (header) header.classList.remove("active");
    if (backTopBtn) backTopBtn.classList.remove("active");
  }
});


/**
 * HERO SLAYDER (yalnız ana səhifədə)
 */

const heroSliderItems = document.querySelectorAll("[data-hero-slider-item]");
const heroSliderPrevBtn = document.querySelector("[data-prev-btn]");
const heroSliderNextBtn = document.querySelector("[data-next-btn]");

if (heroSliderItems.length && heroSliderPrevBtn && heroSliderNextBtn) {

  let currentSlidePos = 0;
  let lastActiveSliderItem = heroSliderItems[0];

  const updateSliderPos = function () {
    lastActiveSliderItem.classList.remove("active");
    heroSliderItems[currentSlidePos].classList.add("active");
    lastActiveSliderItem = heroSliderItems[currentSlidePos];
  }

  const slideNext = function () {
    currentSlidePos = currentSlidePos >= heroSliderItems.length - 1 ? 0 : currentSlidePos + 1;
    updateSliderPos();
  }

  const slidePrev = function () {
    currentSlidePos = currentSlidePos <= 0 ? heroSliderItems.length - 1 : currentSlidePos - 1;
    updateSliderPos();
  }

  heroSliderNextBtn.addEventListener("click", slideNext);
  heroSliderPrevBtn.addEventListener("click", slidePrev);

  /**
   * avtomatik slayd
   */

  let autoSlideInterval;

  const autoSlide = function () {
    autoSlideInterval = setInterval(function () {
      slideNext();
    }, 7000);
  }

  addEventOnElements([heroSliderNextBtn, heroSliderPrevBtn], "mouseover", function () {
    clearInterval(autoSlideInterval);
  });

  addEventOnElements([heroSliderNextBtn, heroSliderPrevBtn], "mouseout", autoSlide);

  window.addEventListener("load", autoSlide);

}


/**
 * PARALLAX EFFEKTİ
 */

const parallaxItems = document.querySelectorAll("[data-parallax-item]");

if (parallaxItems.length && window.matchMedia("(min-width: 992px)").matches) {

  window.addEventListener("mousemove", function (event) {

    const baseX = ((event.clientX / window.innerWidth * 10) - 5) * -1;
    const baseY = ((event.clientY / window.innerHeight * 10) - 5) * -1;

    for (let i = 0, len = parallaxItems.length; i < len; i++) {
      const speed = Number(parallaxItems[i].dataset.parallaxSpeed) || 1;
      parallaxItems[i].style.transform =
        `translate3d(${(baseX * speed).toFixed(2)}px, ${(baseY * speed).toFixed(2)}px, 0px)`;
    }

  });

}


/**
 * MENYU BÖLMƏLƏRİ — aktiv keçidin işarələnməsi
 */

const menuNavLinks = document.querySelectorAll(".menu-nav-link");

if (menuNavLinks.length) {
  const categories = document.querySelectorAll(".menu-category");

  const markActive = function (id) {
    menuNavLinks.forEach(function (link) {
      link.classList.toggle("active", link.getAttribute("href") === "#" + id);
    });
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) markActive(entry.target.id);
      });
    }, { rootMargin: "-120px 0px -70% 0px" });

    categories.forEach(function (category) { observer.observe(category); });
  }
}
