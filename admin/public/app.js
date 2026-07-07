let currentDraft = null;
let currentNaverDraft = null;
let posts = { plus: [], info: [] };
let slugEditedManually = false;
let slugTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 2800);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "요청 처리 중 오류가 발생했습니다.");
  return data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function formField(form, name) {
  const field = form.querySelector(`[name="${name}"]`);
  if (!field) throw new Error(`${name} 입력칸을 찾을 수 없습니다.`);
  return field;
}

function stripDraftSuffix(slug) {
  return String(slug || "").replace(/-(quick-)?guide$/, "");
}

function domain(kind) {
  return kind === "plus" ? "https://plus.liferoom-j.com" : "https://info.liferoom-j.com";
}

function articleUrl(kind, article) {
  return `${domain(kind)}/posts/${article.slug}/`;
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function findMatchingPlusArticle(infoSlug) {
  const baseSlug = stripDraftSuffix(infoSlug);
  return (
    posts.plus.find((article) => article.slug === `${baseSlug}-quick-guide`) ||
    posts.plus.find((article) => stripDraftSuffix(article.slug) === baseSlug) ||
    null
  );
}

function setLog(data) {
  const log = $("#jobLog");
  if (!log) return;
  log.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function appendLog(data) {
  const log = $("#jobLog");
  if (!log) return;
  const current = log.textContent;
  log.textContent = current && current !== "대기 중입니다." ? `${current}\n\n${data}` : data;
}

async function runJob(path, label, { append = false } = {}) {
  const startMessage = `${label} 실행 중...`;
  if (append) appendLog(startMessage);
  else setLog(startMessage);

  const data = await api(path, { method: "POST", body: "{}" });
  const output = [
    `[${label}]`,
    `[PLUS] exit ${data.plus.code}`,
    data.plus.output,
    "",
    `[INFO] exit ${data.info.code}`,
    data.info.output
  ].join("\n");

  if (append) appendLog(output);
  else setLog(output);
  toast(`${label} 완료`);
  return data;
}

function debounceSlugSuggestion(form) {
  window.clearTimeout(slugTimer);
  slugTimer = window.setTimeout(async () => {
    const keyword = formField(form, "keyword").value.trim();
    if (!keyword || slugEditedManually) return;
    try {
      const result = await api("/api/suggest-slug", {
        method: "POST",
        body: JSON.stringify({ keyword })
      });
      formField(form, "slug").value = result.slug;
    } catch (error) {
      toast(error.message);
    }
  }, 450);
}

function renderDraftArticle(kind, article) {
  if (!article) return `<div class="draft-box"><h3>${kind}</h3><p>초안 데이터가 없습니다.</p></div>`;
  const url = articleUrl(kind, article);
  const ctas = article.ctas.map((cta) => `<span class="pill">${cta.label}</span>`).join("");
  return `<div class="draft-box">
    <h3>${kind === "plus" ? "A Plus" : "B Info"} · ${article.title}</h3>
    <p>${article.description}</p>
    <p><strong>slug</strong> ${article.slug}</p>
    <p><strong>URL</strong> <a href="${url}" target="_blank" rel="noopener">${url}</a></p>
    <div class="pill-row">${ctas}</div>
  </div>`;
}

function renderDraft(draft) {
  if (!draft?.plus || !draft?.info) {
    throw new Error("초안 생성 결과가 올바르지 않습니다.");
  }
  $("#draftPreview").className = "draft-grid";
  $("#draftPreview").innerHTML = `
    ${renderDraftArticle("plus", draft.plus)}
    ${renderDraftArticle("info", draft.info)}
  `;
  $("#publishDraft").disabled = false;
}

function renderPosts(kind, items) {
  const target = kind === "plus" ? $("#plusList") : $("#infoList");
  target.innerHTML = items
    .slice()
    .reverse()
    .map((article) => `<article class="post-item">
      <a href="${articleUrl(kind, article)}" target="_blank" rel="noopener">${article.title}</a>
      <p>${article.description}</p>
      <div class="post-meta">
        <span>${article.publishedAt || ""}</span>
        <span>${article.slug}</span>
      </div>
    </article>`)
    .join("");
}

function renderNaverArticleOptions() {
  const select = $("#naverInfoSlug");
  if (!select) return;
  const current = select.value;
  select.innerHTML = [
    `<option value="">B 블로그 글을 선택하세요.</option>`,
    ...posts.info
      .slice()
      .reverse()
      .map((article) => `<option value="${escapeText(article.slug)}">${escapeText(article.title)} (${escapeText(article.slug)})</option>`)
  ].join("");
  if (current && posts.info.some((article) => article.slug === current)) select.value = current;
  updateNaverMatchedPlus();
}

function updateNaverMatchedPlus() {
  const select = $("#naverInfoSlug");
  const input = $("#naverPlusUrl");
  if (!select || !input) return;
  const matched = findMatchingPlusArticle(select.value);
  input.value = matched ? articleUrl("plus", matched) : "";
  input.placeholder = matched ? "" : "매칭되는 A 글이 없으면 직접 입력하세요.";
}

function naverHistory() {
  try {
    return JSON.parse(localStorage.getItem("liferoomNaverHistory") || "[]");
  } catch {
    return [];
  }
}

function saveNaverHistory(item) {
  const history = [item, ...naverHistory()].slice(0, 30);
  localStorage.setItem("liferoomNaverHistory", JSON.stringify(history));
  renderNaverHistory();
}

function renderNaverHistory() {
  const target = $("#naverHistory");
  if (!target) return;
  const history = naverHistory();
  if (!history.length) {
    target.innerHTML = `<div class="empty-mini">생성 기록이 없습니다.</div>`;
    return;
  }
  target.innerHTML = history
    .map((item, index) => `<article class="history-item">
      <div>
        <strong>${escapeText(item.title || item.titles?.[0] || "제목 없음")}</strong>
        <p>${escapeText(item.channel || "")} · ${escapeText(item.infoTitle || item.infoSlug || "")}</p>
      </div>
      <div class="history-actions">
        <button type="button" class="ghost-button mini-button" data-history-copy="${index}">복사</button>
      </div>
    </article>`)
    .join("");
}

function naverCopyText(draft, title = draft.titles?.[0] || "") {
  return `${title}\n\n${draft.body}\n\n${(draft.hashtags || []).join(" ")}`.trim();
}

async function copyText(text, message = "복사했습니다.") {
  await navigator.clipboard.writeText(text);
  toast(message);
}

function renderNaverResult(draft) {
  currentNaverDraft = draft;
  const titleButtons = draft.titles
    .map((title, index) => `<button type="button" class="title-option" data-copy-title="${index}">${escapeText(title)}</button>`)
    .join("");
  $("#naverResult").className = "naver-result";
  $("#naverResult").innerHTML = `
    <div class="result-box">
      <div class="result-meta">
        <span>${escapeText(draft.channel)}</span>
        <span>${draft.body.length}자</span>
      </div>
      <h3>제목 후보</h3>
      <div class="title-options">${titleButtons}</div>
    </div>
    <div class="result-box">
      <div class="copy-row">
        <h3>본문</h3>
        <button type="button" class="ghost-button mini-button" id="copyNaverBody">본문 복사</button>
      </div>
      <textarea class="generated-body" readonly>${escapeText(draft.body)}</textarea>
    </div>
    <div class="result-box">
      <div class="copy-row">
        <h3>해시태그</h3>
        <button type="button" class="ghost-button mini-button" id="copyNaverAll">전체 복사</button>
      </div>
      <p class="hashtag-line">${escapeText((draft.hashtags || []).join(" "))}</p>
      <p class="field-help">A 링크: <a href="${escapeText(draft.plusUrl)}" target="_blank" rel="noopener">${escapeText(draft.plusUrl)}</a></p>
    </div>
  `;
  saveNaverHistory({
    title: draft.titles[0],
    titles: draft.titles,
    body: draft.body,
    hashtags: draft.hashtags,
    channel: draft.channel,
    infoSlug: draft.infoSlug,
    infoTitle: draft.infoTitle,
    plusUrl: draft.plusUrl,
    createdAt: draft.createdAt
  });
}

async function loadPosts({ quiet = false } = {}) {
  posts = await api("/api/articles");
  renderPosts("plus", posts.plus);
  renderPosts("info", posts.info);
  renderNaverArticleOptions();
  if (!quiet) toast("글 목록을 불러왔습니다.");
}

async function loadAiStatus() {
  const statusNode = $("#aiStatus");
  if (!statusNode) return;
  try {
    const status = await api("/api/ai-status");
    statusNode.textContent = status.enabled
      ? `사용 가능 · ${status.model}`
      : "키 없음 · .env에 OPENAI_API_KEY를 넣으면 사용";
    const checkbox = document.querySelector('[name="useAi"]');
    if (checkbox && !status.enabled) checkbox.checked = false;
  } catch (error) {
    statusNode.textContent = "AI 상태 확인 실패";
  }
}

function bindNavigation() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".nav-item").forEach((item) => item.classList.remove("active"));
      $$(".panel").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.panel}`).classList.add("active");
    });
  });
}

function bindForm() {
  $("#draftForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;
    $("#publishDraft").disabled = true;

    try {
      currentDraft = await api("/api/draft", {
        method: "POST",
        body: JSON.stringify(formData(form))
      });
      formField(form, "slug").value = stripDraftSuffix(currentDraft.plus.slug);
      renderDraft(currentDraft);
      toast("A/B 글 초안을 생성했습니다. 빌드를 시작합니다.");
      await runJob("/api/build", "초안 생성 후 빌드");
    } catch (error) {
      toast(error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  $("#publishDraft").addEventListener("click", async () => {
    if (!currentDraft) return;
    const publishButton = $("#publishDraft");
    publishButton.disabled = true;

    try {
      setLog("글 추가, 빌드, 배포를 한 번에 실행 중...");
      const result = await api("/api/publish-deploy", {
        method: "POST",
        body: JSON.stringify(currentDraft)
      });
      await loadPosts({ quiet: true });
      setLog([
        `글 추가/빌드/배포 완료`,
        `A: ${result.plusUrl}`,
        `B: ${result.infoUrl}`,
        "",
        `[BUILD PLUS] exit ${result.build.plus.code}`,
        result.build.plus.output,
        "",
        `[BUILD INFO] exit ${result.build.info.code}`,
        result.build.info.output,
        "",
        `[DEPLOY PLUS] exit ${result.deploy.plus.code}`,
        result.deploy.plus.output,
        "",
        `[DEPLOY INFO] exit ${result.deploy.info.code}`,
        result.deploy.info.output
      ].join("\n"));
      toast("글 추가, 빌드, 배포를 모두 완료했습니다.");
    } catch (error) {
      toast(error.message);
      publishButton.disabled = false;
    }
  });
}

function bindNaver() {
  const form = $("#naverForm");
  if (!form) return;

  $("#naverInfoSlug").addEventListener("change", updateNaverMatchedPlus);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;

    try {
      $("#naverResult").className = "empty-state";
      $("#naverResult").textContent = "네이버 발행문을 생성하는 중입니다.";
      const draft = await api("/api/naver-draft", {
        method: "POST",
        body: JSON.stringify(formData(form))
      });
      renderNaverResult(draft);
      toast("네이버 발행문을 생성했습니다.");
    } catch (error) {
      toast(error.message);
      $("#naverResult").className = "empty-state";
      $("#naverResult").textContent = error.message;
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  $("#naverResult").addEventListener("click", async (event) => {
    const titleButton = event.target.closest("[data-copy-title]");
    if (titleButton && currentNaverDraft) {
      const title = currentNaverDraft.titles[Number(titleButton.dataset.copyTitle)];
      await copyText(title, "제목을 복사했습니다.");
      return;
    }

    if (event.target.closest("#copyNaverBody") && currentNaverDraft) {
      await copyText(currentNaverDraft.body, "본문을 복사했습니다.");
      return;
    }

    if (event.target.closest("#copyNaverAll") && currentNaverDraft) {
      await copyText(naverCopyText(currentNaverDraft), "제목/본문/해시태그를 복사했습니다.");
    }
  });

  $("#naverHistory").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-history-copy]");
    if (!button) return;
    const item = naverHistory()[Number(button.dataset.historyCopy)];
    if (!item) return;
    await copyText(naverCopyText(item, item.title || item.titles?.[0] || ""), "기록의 발행문을 복사했습니다.");
  });

  $("#clearNaverHistory").addEventListener("click", () => {
    if (!confirm("네이버 발행문 생성 기록을 비울까요?")) return;
    localStorage.removeItem("liferoomNaverHistory");
    renderNaverHistory();
    toast("기록을 비웠습니다.");
  });

  renderNaverHistory();
}

function bindJobs() {
  $("#refreshPosts").addEventListener("click", () => loadPosts().catch((error) => toast(error.message)));
}

function bindSlugSuggestion() {
  const form = $("#draftForm");
  formField(form, "keyword").addEventListener("input", () => debounceSlugSuggestion(form));
  formField(form, "slug").addEventListener("input", () => {
    slugEditedManually = Boolean(formField(form, "slug").value.trim());
  });
}

bindNavigation();
bindForm();
bindNaver();
bindJobs();
bindSlugSuggestion();
loadAiStatus();
loadPosts({ quiet: true }).catch((error) => toast(error.message));
