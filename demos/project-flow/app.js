(() => {
  "use strict";

  const STORAGE_KEY = "workflow-desk-projects-v1";
  const DAY = 24 * 60 * 60 * 1000;
  const statuses = [
    { id: "inquiry", label: "相談・問い合わせ" },
    { id: "proposal", label: "提案・見積もり" },
    { id: "contracted", label: "契約済み" },
    { id: "production", label: "制作・対応中" },
    { id: "done", label: "完了" },
  ];
  const priorityLabels = { high: "優先度 高", medium: "優先度 中", low: "優先度 低" };

  const elements = {
    pageTitle: document.querySelector("#page-title"),
    views: [...document.querySelectorAll("[data-view]")],
    navItems: [...document.querySelectorAll("[data-view-target]")],
    switchToBoard: document.querySelector("[data-switch-to-board]"),
    search: document.querySelector("#search-input"),
    priority: document.querySelector("#priority-filter"),
    board: document.querySelector("#project-board"),
    pipeline: document.querySelector("#pipeline-bars"),
    actions: document.querySelector("#action-list"),
    metricActive: document.querySelector("#metric-active"),
    metricActiveNote: document.querySelector("#metric-active-note"),
    metricDue: document.querySelector("#metric-due"),
    metricValue: document.querySelector("#metric-value"),
    metricCompletion: document.querySelector("#metric-completion"),
    sidebarDue: document.querySelector("#sidebar-due-count"),
    newButton: document.querySelector("#new-project-button"),
    exportButton: document.querySelector("#export-button"),
    resetButton: document.querySelector("#reset-button"),
    modal: document.querySelector("#project-modal"),
    modalTitle: document.querySelector("#modal-title"),
    form: document.querySelector("#project-form"),
    formError: document.querySelector("#form-error"),
    deleteButton: document.querySelector("#delete-project-button"),
    id: document.querySelector("#project-id"),
    name: document.querySelector("#project-name"),
    client: document.querySelector("#client-name"),
    status: document.querySelector("#project-status"),
    priorityInput: document.querySelector("#project-priority"),
    value: document.querySelector("#project-value"),
    due: document.querySelector("#project-due"),
    nextDate: document.querySelector("#project-next-date"),
    nextAction: document.querySelector("#project-next-action"),
    notes: document.querySelector("#project-notes"),
    toast: document.querySelector("#toast"),
  };

  let projects = loadProjects();
  let toastTimer;

  function dateFromToday(offset) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return toInputDate(date);
  }

  function getDemoProjects() {
    return [
      {
        id: "demo-1",
        name: "店舗予約フォームの改善",
        client: "みどり整骨院",
        status: "production",
        priority: "high",
        value: 88000,
        due: dateFromToday(5),
        nextDate: dateFromToday(1),
        nextAction: "入力項目の最終確認を依頼する",
        notes: "スマートフォンでの入力負荷を下げ、受付後の転記も減らす。",
      },
      {
        id: "demo-2",
        name: "問い合わせ管理の試作",
        client: "株式会社ノース",
        status: "proposal",
        priority: "medium",
        value: 55000,
        due: dateFromToday(12),
        nextDate: dateFromToday(3),
        nextAction: "画面構成と見積もりを送付する",
        notes: "表計算からの移行を想定。まず3名で使う最小構成。",
      },
      {
        id: "demo-3",
        name: "月次レポート自動集計",
        client: "西町サービス",
        status: "contracted",
        priority: "high",
        value: 72000,
        due: dateFromToday(9),
        nextDate: dateFromToday(2),
        nextAction: "サンプルCSVの列定義を確認する",
        notes: "毎月4ファイルを統合している作業を短縮する。",
      },
      {
        id: "demo-4",
        name: "採用ページの軽微改修",
        client: "大川電機",
        status: "inquiry",
        priority: "low",
        value: 30000,
        due: dateFromToday(18),
        nextDate: dateFromToday(-1),
        nextAction: "修正箇所のURLと画像を確認する",
        notes: "既存WordPressサイト。テーマへの影響を先に調査。",
      },
      {
        id: "demo-5",
        name: "シフト不足時間の可視化",
        client: "ベーカリー事業者",
        status: "done",
        priority: "medium",
        value: 44000,
        due: dateFromToday(-12),
        nextDate: "",
        nextAction: "",
        notes: "従業員・シフト入力、ギャップ分析、CSV出力を実装。",
      },
      {
        id: "demo-6",
        name: "商品画像の一括リサイズ",
        client: "アトリエ花音",
        status: "production",
        priority: "medium",
        value: 48000,
        due: dateFromToday(7),
        nextDate: dateFromToday(4),
        nextAction: "テスト画像10点で出力を確認する",
        notes: "縦横比を保持し、EC掲載用の規格へ揃える。",
      },
      {
        id: "demo-7",
        name: "イベント申込一覧の整理",
        client: "地域交流センター",
        status: "proposal",
        priority: "low",
        value: 35000,
        due: dateFromToday(20),
        nextDate: dateFromToday(6),
        nextAction: "重複判定の条件をヒアリングする",
        notes: "氏名・メール・電話番号の表記ゆれに配慮する。",
      },
    ];
  }

  function loadProjects() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (error) {
      console.warn("保存データを読み込めませんでした。", error);
    }
    return getDemoProjects();
  }

  function saveProjects() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }

  function toInputDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  function dayDifference(value) {
    const date = parseDate(value);
    if (!date) return Number.POSITIVE_INFINITY;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Math.round((date - today) / DAY);
  }

  function formatDate(value, compact = false) {
    const date = parseDate(value);
    if (!date) return "未設定";
    if (compact) return `${date.getMonth() + 1}/${date.getDate()}`;
    return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", weekday: "short" }).format(date);
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function filteredProjects() {
    const query = elements.search.value.trim().toLocaleLowerCase("ja");
    const priority = elements.priority.value;
    return projects.filter((project) => {
      const matchesQuery = !query || `${project.name} ${project.client}`.toLocaleLowerCase("ja").includes(query);
      const matchesPriority = priority === "all" || project.priority === priority;
      return matchesQuery && matchesPriority;
    });
  }

  function render() {
    const visible = filteredProjects();
    renderMetrics(visible);
    renderPipeline(visible);
    renderActions(visible);
    renderBoard(visible);
  }

  function renderMetrics(visible) {
    const active = visible.filter((project) => project.status !== "done");
    const dueSoon = active.filter((project) => {
      const days = dayDifference(project.nextDate || project.due);
      return days >= 0 && days <= 7;
    });
    const overdue = active.filter((project) => dayDifference(project.nextDate || project.due) < 0);
    const contractedValue = visible
      .filter((project) => ["contracted", "production"].includes(project.status))
      .reduce((sum, project) => sum + (Number(project.value) || 0), 0);
    const completed = visible.filter((project) => project.status === "done").length;
    const completion = visible.length ? Math.round((completed / visible.length) * 100) : 0;

    elements.metricActive.textContent = active.length;
    elements.metricActiveNote.textContent = visible.length === projects.length ? `全${projects.length}件を集計` : `絞り込み中：${visible.length}件`;
    elements.metricDue.textContent = dueSoon.length;
    elements.metricValue.textContent = formatCurrency(contractedValue);
    elements.metricCompletion.textContent = `${completion}%`;
    elements.sidebarDue.textContent = `${dueSoon.length + overdue.length}件`;
  }

  function renderPipeline(visible) {
    const max = Math.max(1, ...statuses.map((status) => visible.filter((project) => project.status === status.id).length));
    elements.pipeline.innerHTML = statuses
      .map((status) => {
        const count = visible.filter((project) => project.status === status.id).length;
        return `
          <div class="pipeline-row">
            <span>${status.label}</span>
            <div class="pipeline-track" aria-hidden="true"><i style="width:${(count / max) * 100}%"></i></div>
            <strong>${count}</strong>
          </div>`;
      })
      .join("");
  }

  function renderActions(visible) {
    const actions = visible
      .filter((project) => project.status !== "done" && (project.nextDate || project.due))
      .sort((a, b) => dayDifference(a.nextDate || a.due) - dayDifference(b.nextDate || b.due))
      .slice(0, 5);

    if (!actions.length) {
      elements.actions.innerHTML = '<div class="empty-state">該当する次の行動はありません。</div>';
      return;
    }

    elements.actions.innerHTML = actions
      .map((project) => {
        const date = project.nextDate || project.due;
        const days = dayDifference(date);
        const timing = days < 0 ? `${Math.abs(days)}日超過` : days === 0 ? "今日" : `${days}日後`;
        return `
          <button class="action-item" type="button" data-project-id="${escapeHtml(project.id)}">
            <span class="action-date ${days < 0 ? "is-overdue" : ""}">${formatDate(date, true)}<br>${timing}</span>
            <span>
              <strong>${escapeHtml(project.nextAction || project.name)}</strong>
              <small>${escapeHtml(project.client)} / ${escapeHtml(project.name)}</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>`;
      })
      .join("");
  }

  function renderBoard(visible) {
    elements.board.innerHTML = statuses
      .map((status) => {
        const items = visible.filter((project) => project.status === status.id);
        const cards = items.length
          ? items.map(projectCardTemplate).join("")
          : '<div class="empty-state">案件をここへ<br>ドラッグできます</div>';
        return `
          <section class="board-column" data-status="${status.id}">
            <header class="board-column__header">
              <h2>${status.label}</h2>
              <span>${items.length}</span>
            </header>
            <div class="board-column__cards">${cards}</div>
          </section>`;
      })
      .join("");
    bindBoardEvents();
  }

  function projectCardTemplate(project) {
    const days = dayDifference(project.due);
    const dueClass = days < 0 && project.status !== "done" ? "is-overdue" : "";
    const dueText = project.due ? `期限 ${formatDate(project.due, true)}` : "期限 未設定";
    return `
      <article class="project-card" draggable="true" tabindex="0" role="button"
        aria-label="${escapeHtml(project.name)}の詳細を開く" data-project-id="${escapeHtml(project.id)}">
        <div class="project-card__top">
          <span class="priority-badge" data-priority="${project.priority}">${priorityLabels[project.priority]}</span>
          <span class="project-value">${formatCurrency(project.value)}</span>
        </div>
        <h3>${escapeHtml(project.name)}</h3>
        <p class="project-client">${escapeHtml(project.client)}</p>
        <p class="project-next">${escapeHtml(project.nextAction || "次の行動は未設定です")}</p>
        <div class="project-card__footer">
          <span class="due-label ${dueClass}">${dueText}</span>
          <span>詳細 ›</span>
        </div>
      </article>`;
  }

  function bindBoardEvents() {
    document.querySelectorAll(".project-card").forEach((card) => {
      card.addEventListener("click", () => openProject(card.dataset.projectId));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openProject(card.dataset.projectId);
        }
      });
      card.addEventListener("dragstart", (event) => {
        card.classList.add("is-dragging");
        event.dataTransfer.setData("text/plain", card.dataset.projectId);
        event.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
    });

    document.querySelectorAll(".board-column").forEach((column) => {
      column.addEventListener("dragover", (event) => {
        event.preventDefault();
        column.classList.add("is-drag-over");
        event.dataTransfer.dropEffect = "move";
      });
      column.addEventListener("dragleave", () => column.classList.remove("is-drag-over"));
      column.addEventListener("drop", (event) => {
        event.preventDefault();
        column.classList.remove("is-drag-over");
        const id = event.dataTransfer.getData("text/plain");
        const project = projects.find((item) => item.id === id);
        if (!project || project.status === column.dataset.status) return;
        project.status = column.dataset.status;
        saveProjects();
        render();
        showToast(`「${project.name}」を${statusLabel(project.status)}へ移動しました。`);
      });
    });
  }

  function statusLabel(id) {
    return statuses.find((status) => status.id === id)?.label ?? id;
  }

  function switchView(view) {
    elements.views.forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
    elements.navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.viewTarget === view));
    elements.pageTitle.textContent = view === "board" ? "案件ボード" : "業務状況";
  }

  function resetForm() {
    elements.form.reset();
    elements.id.value = "";
    elements.status.value = "inquiry";
    elements.priorityInput.value = "medium";
    elements.formError.textContent = "";
    elements.deleteButton.classList.add("is-hidden");
  }

  function openNewProject() {
    resetForm();
    elements.modalTitle.textContent = "案件を追加";
    elements.modal.showModal();
    elements.name.focus();
  }

  function openProject(id) {
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    resetForm();
    elements.modalTitle.textContent = "案件を編集";
    elements.id.value = project.id;
    elements.name.value = project.name;
    elements.client.value = project.client;
    elements.status.value = project.status;
    elements.priorityInput.value = project.priority;
    elements.value.value = project.value || "";
    elements.due.value = project.due || "";
    elements.nextDate.value = project.nextDate || "";
    elements.nextAction.value = project.nextAction || "";
    elements.notes.value = project.notes || "";
    elements.deleteButton.classList.remove("is-hidden");
    elements.modal.showModal();
  }

  function closeModal() {
    elements.modal.close();
    elements.formError.textContent = "";
  }

  function saveForm(event) {
    event.preventDefault();
    const name = elements.name.value.trim();
    const client = elements.client.value.trim();
    if (!name || !client) {
      elements.formError.textContent = "案件名と顧客名を入力してください。";
      return;
    }

    const project = {
      id: elements.id.value || (crypto.randomUUID ? crypto.randomUUID() : `project-${Date.now()}`),
      name,
      client,
      status: elements.status.value,
      priority: elements.priorityInput.value,
      value: Number(elements.value.value) || 0,
      due: elements.due.value,
      nextDate: elements.nextDate.value,
      nextAction: elements.nextAction.value.trim(),
      notes: elements.notes.value.trim(),
    };
    const index = projects.findIndex((item) => item.id === project.id);
    if (index >= 0) projects[index] = project;
    else projects.unshift(project);

    saveProjects();
    closeModal();
    render();
    showToast(index >= 0 ? "案件を更新しました。" : "案件を追加しました。");
  }

  function deleteProject() {
    const project = projects.find((item) => item.id === elements.id.value);
    if (!project) return;
    if (!window.confirm(`「${project.name}」を削除しますか？`)) return;
    projects = projects.filter((item) => item.id !== project.id);
    saveProjects();
    closeModal();
    render();
    showToast("案件を削除しました。");
  }

  function exportCsv() {
    const headers = ["案件名", "顧客名", "ステータス", "優先度", "見込金額", "期限", "次の行動日", "次の行動", "メモ"];
    const rows = filteredProjects().map((project) => [
      project.name,
      project.client,
      statusLabel(project.status),
      priorityLabels[project.priority],
      project.value,
      project.due,
      project.nextDate,
      project.nextAction,
      project.notes,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `案件一覧_${toInputDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`${rows.length}件をCSVで出力しました。`);
  }

  function resetDemo() {
    if (!window.confirm("追加・編集した内容を消して、デモデータへ戻しますか？")) return;
    projects = getDemoProjects();
    saveProjects();
    elements.search.value = "";
    elements.priority.value = "all";
    render();
    showToast("デモを初期状態に戻しました。");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
  }

  function initialize() {
    elements.status.innerHTML = statuses.map((status) => `<option value="${status.id}">${status.label}</option>`).join("");
    elements.navItems.forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewTarget)));
    elements.switchToBoard.addEventListener("click", () => switchView("board"));
    elements.newButton.addEventListener("click", openNewProject);
    elements.exportButton.addEventListener("click", exportCsv);
    elements.resetButton.addEventListener("click", resetDemo);
    elements.search.addEventListener("input", render);
    elements.priority.addEventListener("change", render);
    elements.form.addEventListener("submit", saveForm);
    elements.deleteButton.addEventListener("click", deleteProject);
    document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));
    elements.modal.addEventListener("click", (event) => {
      if (event.target === elements.modal) closeModal();
    });
    elements.actions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-project-id]");
      if (button) openProject(button.dataset.projectId);
    });
    render();
  }

  initialize();
})();
