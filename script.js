import { calculateRoi, sanitiseCampaignValue } from './business-tools.js';

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

(() => {
  'use strict';

  const roiForm = document.querySelector('[data-roi-form]');
  const roiReset = document.querySelector('[data-roi-reset]');
  const numberValue = (name) => Math.max(0, Number(roiForm?.elements[name]?.value) || 0);
  const formatNumber = (value, digits = 1) => new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: digits,
  }).format(value);

  const updateRoi = () => {
    if (!roiForm) return;
    const { currentHours, savedHours, savedAmount, paybackMonths } = calculateRoi({
      monthlyCount: numberValue('monthlyCount'),
      minutesPerItem: numberValue('minutesPerItem'),
      monthlyReviewHours: numberValue('monthlyReviewHours'),
      reworkCount: numberValue('reworkCount'),
      reworkMinutes: numberValue('reworkMinutes'),
      hourlyRate: numberValue('hourlyRate'),
      reductionRate: numberValue('reductionRate'),
      implementationCost: numberValue('implementationCost'),
    });

    document.querySelector('[data-roi-result="currentHours"]').textContent = formatNumber(currentHours);
    document.querySelector('[data-roi-result="savedHours"]').textContent = formatNumber(savedHours);
    document.querySelector('[data-roi-result="savedAmount"]').textContent = formatNumber(Math.round(savedAmount), 0);
    document.querySelector('[data-roi-result="paybackMonths"]').textContent = paybackMonths === null ? '—' : formatNumber(paybackMonths);
  };

  roiForm?.addEventListener('input', updateRoi);
  roiReset?.addEventListener('click', () => {
    roiForm.reset();
    updateRoi();
  });
  updateRoi();

  const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  const params = new URLSearchParams(window.location.search);
  const campaignFromUrl = Object.fromEntries(campaignKeys
    .map((key) => [key, sanitiseCampaignValue(params.get(key))])
    .filter(([, value]) => value));

  let campaign = campaignFromUrl;
  try {
    if (Object.keys(campaignFromUrl).length) {
      sessionStorage.setItem('kh-portfolio-campaign-v1', JSON.stringify(campaignFromUrl));
    } else {
      campaign = JSON.parse(sessionStorage.getItem('kh-portfolio-campaign-v1')) || {};
    }
  } catch {
    campaign = campaignFromUrl;
  }

  const campaignLabel = campaign.utm_content || campaign.utm_campaign || campaign.utm_source || 'portfolio';
  const directEmail = document.querySelector('[data-direct-email]');
  if (directEmail) {
    const subject = `[${campaignLabel}] 7日間試作の相談`;
    const body = [
      '細井 京介 様',
      '',
      '7日間試作について相談します。分かる範囲で以下を記載します。',
      '',
      '会社名：',
      '現在使っているもの（Excel・メール・紙など）：',
      '整理したい業務：',
      '最も困っている確認・転記：',
      '月間件数・利用人数：',
      '希望時期：',
      '',
      '※個人情報、取引先の秘密情報、パスワードは記載しません。',
    ].join('\n');
    directEmail.href = `mailto:kyoduke98@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  document.querySelectorAll('[data-conversion]').forEach((link) => {
    link.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('portfolio:conversion', {
        detail: {
          event: link.dataset.conversion,
          campaign,
        },
      }));
    });
  });
})();
