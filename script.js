/*
  Design philosophy: Quiet Systems / 静謐なシステム設計
  JavaScriptは情報閲覧を妨げない段階的拡張とし、動きは短く控えめにする。
  JavaScript無効時も本文が読める構成を維持する。
*/

(() => {
  'use strict';

  const revealElements = document.querySelectorAll('[data-reveal]');
  const header = document.querySelector('[data-header]');
  const year = document.querySelector('[data-year]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  const updateHeader = () => {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 20);
  };

  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealElements.forEach((element) => element.classList.add('is-visible'));
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    {
      root: null,
      rootMargin: '0px 0px -10% 0px',
      threshold: 0.08,
    },
  );

  revealElements.forEach((element) => revealObserver.observe(element));
})();
