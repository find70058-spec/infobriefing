const owner = "find70058-spec";
const repos = {
  plus: {
    repo: "liferoom-plus",
    domain: "https://plus.liferoom-j.com"
  },
  info: {
    repo: "liferoom-info",
    domain: "https://info.liferoom-j.com"
  }
};

const articlesPath = "src/articles.mjs";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(input) {
  const slug = String(input || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return slug || `post-${Date.now()}`;
}

function stripKnownSuffix(slug) {
  return String(slug || "").replace(/-(quick-)?guide$/, "");
}

function todayKorea() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function articleUrl(kind, slug) {
  return `${repos[kind].domain}/posts/${slug}/`;
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function github(env, path, options = {}) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN secret is not set.");
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "user-agent": "liferoom-cloud-admin",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `GitHub API failed: ${response.status}`);
  }
  return data;
}

async function readArticlesFile(env, kind) {
  const config = repos[kind];
  const data = await github(env, `/repos/${owner}/${config.repo}/contents/${articlesPath}?ref=main`);
  return {
    sha: data.sha,
    content: fromBase64(data.content)
  };
}

function extractString(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*(["'\`])([\\s\\S]*?)\\1`));
  return match ? match[2] : "";
}

function extractCtas(block) {
  return [...block.matchAll(/label:\s*(["'])(.*?)\1,\s*url:\s*(["'])(.*?)\3/g)].map((match) => ({
    label: match[2],
    url: match[4]
  }));
}

function splitArticleBlocks(source) {
  const start = source.indexOf("[");
  const end = source.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  const body = source.slice(start + 1, end);
  const blocks = [];
  let depth = 0;
  let inString = "";
  let escaped = false;
  let blockStart = -1;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = "";
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      continue;
    }
    if (char === "{") {
      if (depth === 0) blockStart = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && blockStart !== -1) {
        blocks.push(body.slice(blockStart, index + 1));
        blockStart = -1;
      }
    }
  }
  return blocks;
}

function parseArticles(source) {
  return splitArticleBlocks(source).map((block) => ({
    slug: extractString(block, "slug"),
    title: extractString(block, "title"),
    description: extractString(block, "description"),
    publishedAt: extractString(block, "publishedAt"),
    category: extractString(block, "category"),
    html: extractString(block, "html"),
    ctas: extractCtas(block)
  })).filter((article) => article.slug);
}

function jsString(value) {
  return JSON.stringify(value);
}

function escapeTemplate(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${");
}

function articleToBlock(article) {
  const tags = article.tags.map((tag) => `      ${jsString(tag)}`).join(",\n");
  const ctas = article.ctas.map((cta) => `      {\n        label: ${jsString(cta.label)},\n        url: ${jsString(cta.url)}\n      }`).join(",\n");
  return `  {
    slug: ${jsString(article.slug)},
    category: ${jsString(article.category)},
    title: ${jsString(article.title)},
    description: ${jsString(article.description)},
    author: ${jsString(article.author)},
    publishedAt: ${jsString(article.publishedAt)},
    modifiedAt: ${jsString(article.modifiedAt)},
    readingTime: ${jsString(article.readingTime)},
    tags: [
${tags}
    ],
    ctas: [
${ctas}
    ],
    html: \`${escapeTemplate(article.html)}\`
  }`;
}

async function appendArticle(env, kind, article) {
  const config = repos[kind];
  const file = await readArticlesFile(env, kind);
  const existing = parseArticles(file.content);
  if (existing.some((item) => item.slug === article.slug)) {
    throw new Error(`${kind} slug already exists: ${article.slug}`);
  }
  const trimmed = file.content.trimEnd();
  if (!trimmed.endsWith("];")) throw new Error(`${kind} articles.mjs format is not supported.`);
  const nextContent = `${trimmed.slice(0, -2)}${existing.length ? ",\n" : "\n"}${articleToBlock(article)}\n];\n`;
  await github(env, `/repos/${owner}/${config.repo}/contents/${articlesPath}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: `Add article ${article.slug}`,
      content: toBase64(nextContent),
      sha: file.sha,
      branch: "main"
    })
  });
}

function paragraph(text) {
  return `<p style="margin: 16px 0; line-height: 1.9; color: #333;">${esc(text)}</p>`;
}

function heading(index, text) {
  return `<h2 id="toc-${index}" style="border-left: 5px solid #2563eb; padding: 14px 0 14px 18px; margin: 40px 0 20px 0; font-size: 22px; font-weight: 700; color: #1a1a1a; line-height: 1.4; letter-spacing: -0.02em;">${esc(text)}</h2>`;
}

function fallbackTags(keyword) {
  const base = String(keyword || "").replace(/\s+/g, " ").trim();
  return [base, `${base} 방법`, `${base} 안내`, `${base} 확인`, `${base} 바로가기`].slice(0, 5);
}

function fallbackPlusHtml(keyword) {
  return `
      <p><!--no toc--></p>
      ${paragraph(`${keyword}를 빠르게 확인하려는 분들을 위해 핵심 내용만 먼저 정리했습니다.`)}
      ${heading(0, `${keyword} 먼저 확인할 점`)}
      ${paragraph(`상세 조건이나 최신 일정은 변동될 수 있으므로 연결된 상세 안내에서 다시 확인하는 것이 좋습니다.`)}
      ${heading(1, `${keyword} 바로가기 전 체크사항`)}
      ${paragraph(`대상, 일정, 준비사항을 확인한 뒤 공식 화면으로 이동하면 처리 시간을 줄일 수 있습니다.`)}
      <!-- CONTENT END 1 -->
    `;
}

function fallbackInfoHtml(keyword) {
  return `
      <p><!--no toc--></p>
      ${paragraph(`${keyword}와 관련해 확인해야 할 대상, 절차, 준비사항을 정리했습니다.`)}
      ${heading(0, `${keyword} 대상과 기준`)}
      ${paragraph(`세부 기준은 기관 안내에 따라 달라질 수 있으므로 신청 또는 조회 전 공식 화면에서 최신 공지를 확인하세요.`)}
      ${heading(1, `${keyword} 진행 방법`)}
      ${paragraph(`본인 확인 수단과 필요한 정보를 미리 준비한 뒤 절차를 진행하면 오류를 줄일 수 있습니다.`)}
      ${heading(2, `${keyword} 자주 묻는 질문`)}
      <details><summary>어디서 확인하나요?</summary><p>연결된 공식 안내 화면에서 최신 정보를 확인하세요.</p></details>
      <!-- CONTENT END 1 -->
    `;
}

function detectContentType(keyword, category) {
  const text = `${keyword} ${category}`;
  return /(예매|예약|승차권|버스|공항|시간표|터미널|정류장|교통|요금|가격|위치|휴양림|숙소|입장권)/.test(text)
    ? "reservation"
    : "application";
}

function aiSchema() {
  const article = {
    type: "object",
    additionalProperties: false,
    required: ["title", "description", "tags", "html"],
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", minItems: 5, maxItems: 5, items: { type: "string" } },
      html: { type: "string" }
    }
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["plus", "info"],
    properties: { plus: article, info: article }
  };
}

function naverSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["titles", "body", "hashtags"],
    properties: {
      titles: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
      body: { type: "string" },
      hashtags: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" } }
    }
  };
}

function outputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  return (data?.output || []).flatMap((item) => item?.content || []).map((content) => content?.text || "").join("\n").trim();
}

async function openAiJson(env, prompt, schema, name) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY secret is not set.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.5",
      input: prompt,
      text: { format: { type: "json_schema", name, strict: true, schema } }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed.");
  return JSON.parse(outputText(data));
}

async function makeDraft(env, input) {
  const keyword = String(input.keyword || "").trim();
  if (!keyword) throw new Error("키워드를 입력하세요.");
  const category = String(input.category || "support");
  const baseSlug = stripKnownSuffix(slugify(input.slug || keyword));
  const plusSlug = `${baseSlug}-quick-guide`;
  const infoSlug = `${baseSlug}-guide`;
  const date = todayKorea();
  const officialUrl = String(input.officialUrl || "").trim() || `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;
  const contentType = detectContentType(keyword, category);
  const button1 = String(input.button1 || (contentType === "reservation" ? "예약 바로가기" : "바로 신청하기")).trim();
  const button2 = String(input.button2 || (contentType === "reservation" ? "시간표 확인" : "자세히 확인하기")).trim();
  const infoUrl = articleUrl("info", infoSlug);

  let aiDraft = null;
  if (input.useAi === "on" || input.useAi === "true") {
    aiDraft = await openAiJson(env, `
키워드: ${keyword}
카테고리: ${category}
공식 링크: ${officialUrl}
버튼 1: ${button1}
버튼 2: ${button2}

작성 규칙:
- 한국어로 작성합니다.
- A 블로그 plus는 1500자 이내의 짧은 전환 글입니다.
- B 블로그 info는 A보다 긴 상세 글이며 표 2개 이상, FAQ 4개를 포함합니다.
- 버튼 HTML과 광고 코드는 만들지 마세요.
- 본문 HTML은 p, h2, table.info-table, ol, details/summary만 사용합니다.
- h2 id는 toc-0부터 순서대로 사용합니다.
- 예약/예매/버스/시간표 키워드에 신청대상, 필요서류 같은 행정 민원 문구를 섞지 마세요.
- description은 200자 이내 자연스러운 1~2문장으로 씁니다.
- tags는 5개 작성합니다.
`, aiSchema(), "liferoom_cloud_draft");
  }

  return {
    plus: {
      slug: plusSlug,
      category,
      title: String(input.plusTitle || aiDraft?.plus?.title || `${keyword} 빠른 확인 바로가기`).trim(),
      description: String(input.plusDescription || aiDraft?.plus?.description || `${keyword}를 확인하는 분들을 위해 먼저 봐야 할 내용을 자연스럽게 정리했습니다.`).trim(),
      author: "Lsejin",
      publishedAt: date,
      modifiedAt: date,
      readingTime: "1분 미만",
      tags: aiDraft?.plus?.tags || fallbackTags(keyword),
      ctas: [{ label: button1, url: infoUrl }, { label: button2, url: infoUrl }],
      html: aiDraft?.plus?.html || fallbackPlusHtml(keyword)
    },
    info: {
      slug: infoSlug,
      category,
      title: String(input.infoTitle || aiDraft?.info?.title || `${keyword} 상세안내`).trim(),
      description: String(input.infoDescription || aiDraft?.info?.description || `${keyword}와 관련해 확인해야 할 기준, 절차, 준비사항을 한 번에 살펴볼 수 있게 정리했습니다.`).trim(),
      author: "Lsejin",
      publishedAt: date,
      modifiedAt: date,
      readingTime: "3분",
      tags: aiDraft?.info?.tags || fallbackTags(keyword),
      ctas: [{ label: button1, url: officialUrl }, { label: button2, url: officialUrl }],
      html: aiDraft?.info?.html || fallbackInfoHtml(keyword)
    }
  };
}

function normalizeNaverBody(text, plusUrl, linkText) {
  let clean = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  clean = clean.replaceAll(plusUrl, "").replace(/\n{3,}/g, "\n\n").trim();
  const linkBlock = `${linkText}\n${plusUrl}`;
  const maxBodyLength = 2000 - linkBlock.length - 4;
  if (clean.length > maxBodyLength) clean = clean.slice(0, Math.max(1200, maxBodyLength)).replace(/\s+\S*$/, "").trim();
  return `${clean}\n\n${linkBlock}`.trim();
}

async function makeNaverDraft(env, input) {
  const infoSlug = String(input.infoSlug || "").trim();
  if (!infoSlug) throw new Error("B 블로그 글을 선택해 주세요.");
  const [plusFile, infoFile] = await Promise.all([readArticlesFile(env, "plus"), readArticlesFile(env, "info")]);
  const plusArticles = parseArticles(plusFile.content);
  const infoArticles = parseArticles(infoFile.content);
  const infoArticle = infoArticles.find((article) => article.slug === infoSlug);
  if (!infoArticle) throw new Error(`B 블로그 글을 찾을 수 없습니다: ${infoSlug}`);
  const baseSlug = stripKnownSuffix(infoSlug);
  const matchedPlus = plusArticles.find((article) => article.slug === `${baseSlug}-quick-guide`) || plusArticles.find((article) => stripKnownSuffix(article.slug) === baseSlug);
  const plusUrl = String(input.plusUrl || "").trim() || (matchedPlus ? articleUrl("plus", matchedPlus.slug) : "");
  if (!plusUrl) throw new Error("연결할 A 블로그 링크를 입력해 주세요.");
  const channel = String(input.channel || "blog") === "cafe" ? "네이버 카페" : "네이버 블로그";
  const linkText = String(input.linkText || "자세히 정리한 글 보기").trim();
  const targetLength = Math.min(2000, Math.max(1500, Number(input.targetLength || 1800)));
  const bodyText = infoArticle.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 10000);
  const draft = await openAiJson(env, `
아래 B 블로그 글 내용을 바탕으로 ${channel}에 올릴 발행문을 작성합니다.
목표 분량: 공백 포함 ${targetLength}자 내외, 반드시 1500~2000자 사이
A 블로그 링크: ${plusUrl}
A 링크 문구: ${linkText}

B 제목: ${infoArticle.title}
B 설명: ${infoArticle.description}
B 본문 참고자료: ${bodyText}

작성 규칙:
- 관공서 안내문이나 AI 요약문처럼 딱딱하게 쓰지 않습니다.
- 실제 블로그 운영자가 정보를 찾아보고 정리한 글처럼 씁니다. 단, 하지 않은 경험을 꾸며내지는 않습니다.
- 첫 문단은 검색자가 헷갈리는 지점부터 시작합니다.
- 3~4개의 소제목, 체크리스트, 요약 정리 블록을 넣습니다.
- 요약 정리는 파이프 문자(|)를 쓰지 말고 "출발지: ..."처럼 한 줄씩 씁니다.
- A 블로그 링크는 본문 하단에 1회만 안내합니다.
- 공식 사이트 링크나 B 블로그 링크는 넣지 않습니다.
- 해시태그는 #을 포함해서 작성합니다.
`, naverSchema(), "liferoom_cloud_naver_draft");

  return {
    infoSlug: infoArticle.slug,
    infoTitle: infoArticle.title,
    plusSlug: matchedPlus?.slug || "",
    plusUrl,
    channel,
    targetLength,
    titles: draft.titles,
    body: normalizeNaverBody(draft.body, plusUrl, linkText),
    hashtags: draft.hashtags,
    createdAt: new Date().toISOString()
  };
}

async function handleApi(request, env, pathname) {
  if (env.ADMIN_PASSWORD) {
    const password = request.headers.get("x-admin-password") || "";
    if (password !== env.ADMIN_PASSWORD) return json({ error: "관리자 비밀번호가 필요합니다." }, 401);
  }

  if (request.method === "GET" && pathname === "/api/ai-status") {
    return json({ enabled: Boolean(env.OPENAI_API_KEY), model: env.OPENAI_MODEL || "gpt-5.5", cloud: true });
  }

  if (request.method === "GET" && pathname === "/api/articles") {
    const [plusFile, infoFile] = await Promise.all([readArticlesFile(env, "plus"), readArticlesFile(env, "info")]);
    const summarize = ({ slug, title, description, publishedAt, ctas }) => ({ slug, title, description, publishedAt, ctas });
    return json({ plus: parseArticles(plusFile.content).map(summarize), info: parseArticles(infoFile.content).map(summarize) });
  }

  if (request.method === "POST" && pathname === "/api/suggest-slug") {
    const body = await request.json();
    const baseSlug = stripKnownSuffix(slugify(body.keyword || ""));
    return json({ slug: baseSlug, plusSlug: `${baseSlug}-quick-guide`, infoSlug: `${baseSlug}-guide` });
  }

  if (request.method === "POST" && pathname === "/api/draft") {
    return json(await makeDraft(env, await request.json()));
  }

  if (request.method === "POST" && pathname === "/api/naver-draft") {
    return json(await makeNaverDraft(env, await request.json()));
  }

  if (request.method === "POST" && pathname === "/api/publish-deploy") {
    const draft = await request.json();
    if (!draft.plus || !draft.info) throw new Error("초안 데이터가 없습니다.");
    await appendArticle(env, "plus", draft.plus);
    await appendArticle(env, "info", draft.info);
    const output = "GitHub에 글을 커밋했습니다. Cloudflare Pages Git 연동 배포가 곧 진행됩니다.";
    return json({
      ok: true,
      plusUrl: articleUrl("plus", draft.plus.slug),
      infoUrl: articleUrl("info", draft.info.slug),
      build: { plus: { code: 0, output }, info: { code: 0, output } },
      deploy: { plus: { code: 0, output }, info: { code: 0, output } }
    });
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url.pathname);
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  }
};
