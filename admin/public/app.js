let currentDraft = null;
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

function stripDraftSuffix(slug) {
  return String(slug || "").replace(/-(quick-)?guide$/, "");
}

function debounceSlugSuggestion(form) {
  window.clearTimeout(slugTimer);
  slugTimer = window.setTimeout(async () => {
    const keyword = form.keyword.value.trim();
    if (!keyword || slugEditedManually) return;
    try {
      const result = await api("/api/suggest-slug", {
        method: "POST",
        body: JSON.stringify({ keyword })
      });
      form.slug.value = result.slug;
    } catch (error) {
      toast(error.message);
    }
  }, 450);
}

function domain(kind) {
  return kind === "plus" ? "https://plus.liferoom-j.com" : "https://info.liferoom-j.com";
}

function articleUrl(kind, article) {
  return `${domain(kind)}/posts/${article.slug}/`;
}

function renderDraftArticle(kind, article) {
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

async function loadPosts() {
  posts = await api("/api/articles");
  renderPosts("plus", posts.plus);
  renderPosts("info", posts.info);
  toast("글 목록을 불러왔습니다.");
}

function setLog(data) {
  $("#jobLog").textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

async function runJob(path, label) {
  setLog(`${label} 실행 중...`);
  const data = await api(path, { method: "POST", body: "{}" });
  setLog([
    `[PLUS] exit ${data.plus.code}`,
    data.plus.output,
    "",
    `[INFO] exit ${data.info.code}`,
    data.info.output
  ].join("\n"));
  toast(`${label} 완료`);
  return data;
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
    $("#publishDraft").disabled = true;
    try {
      currentDraft = await api("/api/draft", {
        method: "POST",
        body: JSON.stringify(formData(event.currentTarget))
      });
      event.currentTarget.slug.value = stripDraftSuffix(currentDraft.plus.slug);
      renderDraft(currentDraft);
      toast("A/B 글 초안을 생성했습니다.");
    } catch (error) {
      toast(error.message);
    }
  });

  $("#publishDraft").addEventListener("click", async () => {
    if (!currentDraft) return;
    if (!confirm("현재 초안을 plus와 info 저장소에 추가할까요?")) return;
    try {
      const result = await api("/api/publish", {
        method: "POST",
        body: JSON.stringify(currentDraft)
      });
      toast("글 데이터가 추가됐습니다. 이제 빌드/배포를 실행하세요.");
      await loadPosts();
      setLog(`글 추가 완료\nA: ${result.plusUrl}\nB: ${result.infoUrl}`);
    } catch (error) {
      toast(error.message);
    }
  });
}

function bindJobs() {
  $("#refreshPosts").addEventListener("click", () => loadPosts().catch((error) => toast(error.message)));
  $("#buildBoth").addEventListener("click", () => runJob("/api/build", "빌드").catch((error) => toast(error.message)));
  $("#deployBoth").addEventListener("click", () => {
    if (!confirm("Cloudflare Pages에 Plus와 Info를 모두 배포할까요?")) return;
    runJob("/api/deploy", "배포").catch((error) => toast(error.message));
  });
}

function bindSlugSuggestion() {
  const form = $("#draftForm");
  form.keyword.addEventListener("input", () => debounceSlugSuggestion(form));
  form.slug.addEventListener("input", () => {
    slugEditedManually = Boolean(form.slug.value.trim());
  });
}

bindNavigation();
bindForm();
bindJobs();
bindSlugSuggestion();
loadPosts().catch((error) => toast(error.message));
