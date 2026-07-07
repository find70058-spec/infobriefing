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

function setLog(data) {
  $("#jobLog").textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function appendLog(data) {
  const current = $("#jobLog").textContent;
  $("#jobLog").textContent = current && current !== "대기 중입니다." ? `${current}\n\n${data}` : data;
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

async function loadPosts({ quiet = false } = {}) {
  posts = await api("/api/articles");
  renderPosts("plus", posts.plus);
  renderPosts("info", posts.info);
  if (!quiet) toast("글 목록을 불러왔습니다.");
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
      const result = await api("/api/publish", {
        method: "POST",
        body: JSON.stringify(currentDraft)
      });
      await loadPosts({ quiet: true });
      setLog(`글 추가 완료\nA: ${result.plusUrl}\nB: ${result.infoUrl}`);
      toast("글을 추가했습니다. 빌드 후 바로 배포합니다.");
      await runJob("/api/build", "글 추가 후 빌드", { append: true });
      await runJob("/api/deploy", "글 추가 후 배포", { append: true });
      toast("글 추가, 빌드, 배포를 모두 완료했습니다.");
    } catch (error) {
      toast(error.message);
      publishButton.disabled = false;
    }
  });
}

function bindJobs() {
  $("#refreshPosts").addEventListener("click", () => loadPosts().catch((error) => toast(error.message)));
  $("#buildBoth").addEventListener("click", () => runJob("/api/build", "수동 빌드").catch((error) => toast(error.message)));
  $("#deployBoth").addEventListener("click", () => {
    if (!confirm("Cloudflare Pages에 Plus와 Info를 모두 배포할까요?")) return;
    runJob("/api/deploy", "수동 배포").catch((error) => toast(error.message));
  });
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
bindJobs();
bindSlugSuggestion();
loadPosts({ quiet: true }).catch((error) => toast(error.message));
