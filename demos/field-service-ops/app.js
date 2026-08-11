(() => {
  'use strict';

  const STORAGE_KEY = 'kh-field-service-demo-v1';
  const initialJobs = [
    { id: 'FS-2601', client: '青葉管理株式会社', site: '守口中央マンション', work: '共用灯・タイマー交換', date: '2026-08-12', owner: '田中', status: '日程確定', photo: false, billing: '未請求' },
    { id: 'FS-2602', client: '北浜不動産', site: '北浜第2ビル', work: '給水ポンプ点検', date: '2026-08-08', owner: '佐藤', status: '完了', photo: true, billing: '請求準備' },
    { id: 'FS-2603', client: 'なにわ住宅サービス', site: '大東ハイツ', work: '漏水一次調査', date: '2026-08-11', owner: '田中', status: '作業中', photo: false, billing: '未請求' },
    { id: 'FS-2604', client: '山城プロパティ', site: '門真倉庫A棟', work: '分電盤ラベル更新', date: '2026-08-16', owner: '鈴木', status: '受付', photo: false, billing: '未請求' },
    { id: 'FS-2605', client: '青葉管理株式会社', site: '寝屋川コーポ', work: '非常灯交換', date: '2026-08-05', owner: '佐藤', status: '完了', photo: true, billing: '請求済' },
    { id: 'FS-2606', client: '大阪設備パートナーズ', site: '東大阪営業所', work: '空調ドレン清掃', date: '2026-08-14', owner: '鈴木', status: '日程確定', photo: false, billing: '未請求' },
    { id: 'FS-2607', client: '北浜不動産', site: '天満橋オフィス', work: 'コンセント増設', date: '2026-08-03', owner: '田中', status: '完了', photo: false, billing: '未請求' },
    { id: 'FS-2608', client: 'なにわ住宅サービス', site: '住道レジデンス', work: '受水槽まわり確認', date: '2026-08-20', owner: '佐藤', status: '受付', photo: false, billing: '未請求' },
  ];

  const els = {
    rows: document.querySelector('[data-job-rows]'),
    template: document.querySelector('[data-row-template]'),
    search: document.querySelector('[data-search]'),
    statusFilter: document.querySelector('[data-status-filter]'),
    billingFilter: document.querySelector('[data-billing-filter]'),
    empty: document.querySelector('[data-empty]'),
    dialog: document.querySelector('[data-job-dialog]'),
    form: document.querySelector('[data-job-form]'),
  };

  const loadJobs = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(saved) ? saved : structuredClone(initialJobs);
    } catch {
      return structuredClone(initialJobs);
    }
  };

  let jobs = loadJobs();
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  const today = new Date('2026-08-11T00:00:00');
  const dateLabel = (value) => new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T00:00:00`));

  const updateMetrics = () => {
    const active = jobs.filter((job) => job.status !== '完了').length;
    const due = jobs.filter((job) => {
      if (job.status === '完了') return false;
      const diff = (new Date(`${job.date}T00:00:00`) - today) / 86400000;
      return diff >= 0 && diff <= 7;
    }).length;
    const unbilled = jobs.filter((job) => job.status === '完了' && job.billing !== '請求済').length;
    const photos = jobs.filter((job) => job.status === '完了' && !job.photo).length;
    document.querySelector('[data-metric="active"]').textContent = active;
    document.querySelector('[data-metric="due"]').textContent = due;
    document.querySelector('[data-metric="unbilled"]').textContent = unbilled;
    document.querySelector('[data-metric="photos"]').textContent = photos;
  };

  const filteredJobs = () => {
    const query = els.search.value.trim().toLowerCase();
    return jobs.filter((job) => {
      const text = [job.id, job.client, job.site, job.work, job.owner].join(' ').toLowerCase();
      return (!query || text.includes(query))
        && (els.statusFilter.value === 'all' || job.status === els.statusFilter.value)
        && (els.billingFilter.value === 'all' || job.billing === els.billingFilter.value);
    });
  };

  const render = () => {
    els.rows.replaceChildren();
    const visible = filteredJobs();
    els.empty.hidden = visible.length > 0;

    visible.forEach((job) => {
      const row = els.template.content.firstElementChild.cloneNode(true);
      row.dataset.id = job.id;
      row.querySelector('[data-cell="id"]').textContent = job.id;
      row.querySelector('[data-cell="owner"]').textContent = `担当：${job.owner}`;
      row.querySelector('[data-cell="client"]').textContent = job.client;
      row.querySelector('[data-cell="site"]').textContent = job.site;
      row.querySelector('[data-cell="work"]').textContent = job.work;
      const time = row.querySelector('[data-cell="date"]');
      time.dateTime = job.date;
      time.textContent = dateLabel(job.date);

      const status = row.querySelector('[data-cell="status"]');
      status.value = job.status;
      status.dataset.value = job.status;
      status.addEventListener('change', () => updateJob(job.id, { status: status.value }));

      const photo = row.querySelector('[data-cell="photo"]');
      photo.textContent = job.photo ? '確認済' : '未確認';
      photo.classList.toggle('is-complete', job.photo);
      photo.setAttribute('aria-label', `${job.id}の写真を${job.photo ? '未確認' : '確認済'}へ変更`);
      photo.addEventListener('click', () => updateJob(job.id, { photo: !job.photo }));

      const billing = row.querySelector('[data-cell="billing"]');
      billing.value = job.billing;
      billing.dataset.value = job.billing;
      billing.addEventListener('change', () => updateJob(job.id, { billing: billing.value }));

      row.querySelector('.row-delete').addEventListener('click', () => {
        jobs = jobs.filter((item) => item.id !== job.id);
        save();
        render();
      });
      els.rows.append(row);
    });
    updateMetrics();
  };

  const updateJob = (id, patch) => {
    jobs = jobs.map((job) => job.id === id ? { ...job, ...patch } : job);
    save();
    render();
  };

  [els.search, els.statusFilter, els.billingFilter].forEach((element) => element.addEventListener('input', render));

  document.querySelector('[data-reset]').addEventListener('click', () => {
    jobs = structuredClone(initialJobs);
    save();
    els.search.value = '';
    els.statusFilter.value = 'all';
    els.billingFilter.value = 'all';
    render();
  });

  document.querySelector('[data-export]').addEventListener('click', () => {
    const headings = ['案件番号', '顧客', '現場', '作業内容', '作業日', '担当者', '進捗', '写真確認', '請求状況'];
    const rows = jobs.map((job) => [job.id, job.client, job.site, job.work, job.date, job.owner, job.status, job.photo ? '確認済' : '未確認', job.billing]);
    const csv = [headings, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = '現場案件台帳_デモ.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  document.querySelector('[data-open-form]').addEventListener('click', () => els.dialog.showModal());
  document.querySelectorAll('[data-close-form]').forEach((button) => button.addEventListener('click', () => els.dialog.close()));
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(els.form);
    const id = String(data.get('id')).trim();
    if (jobs.some((job) => job.id === id)) {
      els.form.elements.id.setCustomValidity('同じ案件番号が登録されています。');
      els.form.elements.id.reportValidity();
      return;
    }
    els.form.elements.id.setCustomValidity('');
    jobs.unshift({
      id,
      client: String(data.get('client')).trim(),
      site: String(data.get('site')).trim(),
      work: String(data.get('work')).trim(),
      date: String(data.get('date')),
      owner: String(data.get('owner')).trim(),
      status: '受付',
      photo: false,
      billing: '未請求',
    });
    save();
    els.form.reset();
    els.dialog.close();
    render();
  });

  render();
})();
