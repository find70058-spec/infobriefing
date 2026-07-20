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

const slugDictionary = [
  ["국가장학금", "national-scholarship"],
  ["지방선거", "local-election"],
  ["사전투표소", "early-voting-place"],
  ["투표소", "polling-place"],
  ["공익직불금", "public-direct-payment"],
  ["생활지원금", "living-support-payment"],
  ["삼성전자", "samsung-electronics"],
  ["삼성카드", "samsung-card"],
  ["신용카드", "credit-card"],
  ["고객센터", "customer-service"],
  ["분실신고", "lost-card-report"],
  ["해지방법", "cancellation-method"],
  ["전화번호", "phone-number"],
  ["지원금", "support-payment"],
  ["장학금", "scholarship"],
  ["이음카드", "eum-card"],
  ["잔액조회", "balance-check"],
  ["배당금", "dividend"],
  ["환율", "exchange-rate"],
  ["계산기", "calculator"],
  ["라오스", "laos"],
  ["개인택시", "private-taxi"],
  ["양수교육", "transfer-training"],
  ["의무교육", "required-training"],
  ["코히", "kohi"],
  ["수강신청", "course-registration"],
  ["주택임대차", "housing-lease"],
  ["계약신고필증", "contract-report-certificate"],
  ["자연휴양림", "recreation-forest"],
  ["사전예약", "reservation"],
  ["온라인신청", "online-application"],
  ["신청기간", "application-period"],
  ["신청방법", "application-method"],
  ["신청대상", "eligibility"],
  ["제출서류", "required-documents"],
  ["필요서류", "required-documents"],
  ["조회방법", "lookup-method"],
  ["위치안내", "location-guide"],
  ["온라인", "online"],
  ["준비물", "preparation"],
  ["지급일", "payment-date"],
  ["지급대상", "payment-eligibility"],
  ["지급내역", "payment-history"],
  ["바로가기", "shortcut"],
  ["카드", "card"],
  ["해지", "cancellation"],
  ["상담", "consultation"],
  ["조회", "lookup"],
  ["위치", "location"],
  ["안내", "guide"],
  ["방법", "method"],
  ["대상", "eligibility"],
  ["서류", "documents"],
  ["발급", "issue"],
  ["재발급", "reissue"],
  ["예약", "reservation"],
  ["가격", "price"],
  ["일정", "schedule"],
  ["교육", "training"],
  ["신청", "application"],
  ["조건", "conditions"],
  ["한도", "limit"],
  ["투자", "investment"],
  ["소득", "income"],
  ["가입", "join"]
].sort((a, b) => b[0].length - a[0].length);

function suggestBaseSlug(keyword) {
  let text = String(keyword || "").toLowerCase();
  for (const [ko, en] of slugDictionary) {
    text = text.replaceAll(ko, ` ${en} `);
  }
  return slugify(text.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g, " "));
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

const accountId = "a4f59aa5f757baf5c4f2b20bbb9201bc";

const pageProjects = {
  plus: "liferoom-plus",
  info: "liferoom-info"
};

const siteDefaults = {
  plus: {
    name: "라이프룸 플러스",
    description: "세금, 지원금, 생활 행정 정보를 빠르게 확인하는 정보 안내 사이트입니다.",
    defaultImage: "/assets/og-image.jpg",
    adsenseClient: "ca-pub-3935732085325115",
    adsenseSlot: "7602926919",
    assetVersion: "20260707-plus-og-image"
  },
  info: {
    name: "라이프룸 인포",
    description: "세금, 지원금, 생활 행정 정보를 자세히 확인하는 상세 안내 사이트입니다.",
    defaultImage: "",
    adsenseClient: "ca-pub-3935732085325115",
    adsenseSlot: "7602926919",
    assetVersion: "20260707-ai-html-style-fix"
  }
};

const categoryDefaults = {
  tax: { name: "세금·소득", description: "종합소득세, 경정청구 등 세금 관련 정보를 정리합니다." },
  support: { name: "정부지원금", description: "지역 지원금, 생활 지원금, 신청 대상과 절차를 안내합니다." },
  life: { name: "생활정보", description: "일상에서 바로 확인해야 하는 생활 행정 정보를 다룹니다." },
  finance: { name: "금융·투자", description: "정책금융, 투자상품, 금융 서류 발급 안내를 정리합니다." },
  education: { name: "교육·자격", description: "온라인 교육, 의무교육, 직무별 필수교육 신청 정보를 정리합니다." },
  travel: { name: "여행·예약", description: "예약, 요금, 위치, 이용방법 정보를 정리합니다." }
};

function bytesFromBase64(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function textBytes(text) {
  return new TextEncoder().encode(text);
}

function mimeType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (path.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function hashFile(path, bytes) {
  const extension = path.includes(".") ? path.split(".").pop() : "";
  const base64 = bytesToBase64(bytes);
  const digest = await crypto.subtle.digest("SHA-256", textBytes(`${base64}${extension}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function addFile(files, path, body, contentType = mimeType(path)) {
  const bytes = typeof body === "string" ? textBytes(body) : body;
  files.set(path.replace(/^\/+/, ""), { bytes, contentType });
}

function renderSiteAd(site, comment = "[plus-liferoom-middle]") {
  return `<div class="ad-block">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${site.adsenseClient}"
     crossorigin="anonymous"></script>
<!-- ${comment} -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="${site.adsenseClient}"
     data-ad-slot="${site.adsenseSlot}"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>
     (adsbygoogle = window.adsbygoogle || []).push({});
</script></div>`;
}

function renderSiteCtas(article) {
  return `<div class="cta-stack">${(article.ctas || [])
    .map((cta) => `<a href="${esc(cta.url)}" rel="noopener">${esc(cta.label)}</a>`)
    .join("")}</div>`;
}

function renderQuickCheck(article) {
  const target = article.ctas?.[0]?.url;
  return target ? `<div class="cta-stack cta-stack-bottom"><a href="${esc(target)}" rel="noopener">바로확인하기</a></div>` : "";
}

function prepareSiteArticleHtml(site, article) {
  const cleaned = String(article.html || "")
    .replaceAll("{{CTA_BUTTONS}}", "")
    .replaceAll("{{MIDDLE_AD}}", "");
  return cleaned.replace(/(<h2\b[\s\S]*?<\/h2>)/i, `$1${renderSiteAd(site, "[plus-liferoom-middle]")}`);
}

function absoluteSiteUrl(site, path) {
  return new URL(path, site.domain).toString();
}

function articlePath(article) {
  return `/posts/${article.slug}/`;
}

function categoryPath(slug) {
  return `/category/${slug}/`;
}

function pageLayout(site, { title, description, path, body, type = "website", jsonLd = "" }) {
  const url = absoluteSiteUrl(site, path);
  const pageTitle = title === site.name ? title : `${title} | ${site.name}`;
  const socialTitle = type === "article" ? title : pageTitle;
  const imageUrl = site.defaultImage ? absoluteSiteUrl(site, site.defaultImage) : "";
  const imageTags = imageUrl ? `
<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:secure_url" content="${esc(imageUrl)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1024">
<meta property="og:image:height" content="645">
<meta name="twitter:image" content="${esc(imageUrl)}">` : "";
  return `<!DOCTYPE html>
<html lang="ko-KR" prefix="og: https://ogp.me/ns#">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="follow, index, max-snippet:-1, max-video-preview:-1, max-image-preview:large">
<link rel="canonical" href="${esc(url)}">
<meta property="og:locale" content="ko_KR">
<meta property="og:type" content="${type === "article" ? "article" : "website"}">
<meta property="og:title" content="${esc(socialTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${esc(site.name)}">${imageTags}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(socialTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:url" content="${esc(url)}">
<link rel="preconnect" href="https://pagead2.googlesyndication.com">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Inter:500,400,700&display=fallback">
<link rel="stylesheet" href="/assets/styles.css?v=${site.assetVersion}">
<script async crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${site.adsenseClient}"></script>
${jsonLd}
</head>
<body>
<div class="site">
  <main class="site-content">
    ${body}
  </main>
  <footer class="site-footer">
    <div class="footer-inner">
      <p>저작권 &copy; 2026<br>※ 해당 웹사이트는 정보 전달을 목적으로 운영하고 있으며, 금융 상품 판매 및 중개의 목적이 아닌 정보만 전달합니다. 조회, 신청 및 다운로드와 같은 편의 서비스에 관한 내용은 관련 처리기관 홈페이지를 참고하시기 바랍니다.</p>
    </div>
  </footer>
</div>
</body>
</html>`;
}

function renderSiteArticle(kind, site, articles, article) {
  const category = categoryDefaults[article.category] || categoryDefaults.life;
  const url = absoluteSiteUrl(site, articlePath(article));
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": ["Person", "Organization"], "@id": `${site.domain}/#person`, name: site.name },
      { "@type": "WebSite", "@id": `${site.domain}/#website`, url: site.domain, name: site.name, publisher: { "@id": `${site.domain}/#person` }, inLanguage: "ko-KR" },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, item: { "@id": site.domain, name: "Home" } },
          { "@type": "ListItem", position: 2, item: { "@id": absoluteSiteUrl(site, categoryPath(article.category)), name: category.name } },
          { "@type": "ListItem", position: 3, item: { "@id": url, name: article.title } }
        ]
      },
      {
        "@type": "BlogPosting",
        headline: article.title,
        datePublished: `${article.publishedAt}T00:00:00+09:00`,
        dateModified: `${article.modifiedAt || article.publishedAt}T00:00:00+09:00`,
        articleSection: category.name,
        author: { "@type": "Person", name: article.author || "Lsejin" },
        publisher: { "@id": `${site.domain}/#person` },
        image: site.defaultImage ? absoluteSiteUrl(site, site.defaultImage) : undefined,
        description: article.description,
        name: article.title,
        "@id": `${url}#richSnippet`,
        isPartOf: { "@id": `${url}#webpage` },
        inLanguage: "ko-KR",
        mainEntityOfPage: { "@id": `${url}#webpage` }
      }
    ]
  })}</script>`;
  const bodyHtml = prepareSiteArticleHtml(site, article);
  const quickCheck = kind === "plus" ? renderQuickCheck(article) : "";
  const body = `<div class="container">
  <article class="article-card">
    ${renderSiteAd(site, "[plus-liferoom-middle]")}
    <header class="entry-header">
      <h1 class="entry-title">${esc(article.title)}</h1>
      <div class="entry-meta">
        <img class="avatar" alt="" src="https://secure.gravatar.com/avatar/869f0011c6e5c60b2508ca40df2e025a6628a35be167620280cc13225fe8506d?s=40&amp;d=mm&amp;r=g" width="40" height="40">
        <span>글쓴이 ${esc(article.author || "Lsejin")} / ${esc(article.publishedAt || "")}</span>
      </div>
      <p class="entry-description">${esc(article.description)}</p>
      ${renderSiteCtas(article)}
    </header>
    <div class="entry-content">${bodyHtml}${quickCheck}</div>
  </article>
</div>
<nav class="post-navigation" aria-label="게시물">
  <div class="nav-links">
    <div class="nav-previous"><a href="/"><span>이전</span><p>${esc(site.name)} 최신 정보 보기</p></a></div>
  </div>
</nav>`;
  return pageLayout(site, { title: article.title, description: article.description, path: articlePath(article), body, type: "article", jsonLd });
}

function renderSiteHome(site, articles) {
  const body = `<section class="home-hero">
  <div class="container">
    <h1>${esc(site.name)}</h1>
    <p>${esc(site.description)}</p>
  </div>
</section>
<section class="container post-list">
  ${articles.map((article) => `<a class="post-item" href="${articlePath(article)}"><strong>${esc(article.title)}</strong><span>${esc(article.description)}</span></a>`).join("")}
</section>`;
  return pageLayout(site, { title: site.name, description: site.description, path: "/", body });
}

function renderSiteCategory(site, articles, slug) {
  const category = categoryDefaults[slug] || { name: slug, description: `${slug} 정보입니다.` };
  const items = articles.filter((article) => article.category === slug);
  const body = `<section class="home-hero">
  <div class="container">
    <h1>${esc(category.name)}</h1>
    <p>${esc(category.description)}</p>
  </div>
</section>
<section class="container post-list">
  ${items.map((article) => `<a class="post-item" href="${articlePath(article)}"><strong>${esc(article.title)}</strong><span>${esc(article.description)}</span></a>`).join("")}
</section>`;
  return pageLayout(site, { title: `${category.name} 정보`, description: category.description, path: categoryPath(slug), body });
}

function renderSitemap(site, articles) {
  const categorySlugs = [...new Set(articles.map((article) => article.category).filter(Boolean))];
  const urls = ["/", ...categorySlugs.map(categoryPath), ...articles.map(articlePath)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${absoluteSiteUrl(site, url)}</loc></url>`).join("\n")}
</urlset>`;
}

async function fetchPublicFiles(env, kind) {
  const config = repos[kind];
  const tree = await github(env, `/repos/${owner}/${config.repo}/git/trees/main?recursive=1`);
  const files = new Map();
  const publicItems = (tree.tree || []).filter((item) => item.type === "blob" && item.path.startsWith("public/"));
  for (const item of publicItems) {
    const data = await github(env, `/repos/${owner}/${config.repo}/contents/${encodeURIComponent(item.path).replaceAll("%2F", "/")}?ref=main`);
    files.set(item.path.replace(/^public\//, ""), bytesFromBase64(data.content));
  }
  return files;
}

async function buildStaticFiles(env, kind) {
  const file = await readArticlesFile(env, kind);
  const articles = parseArticles(file.content);
  const site = { ...siteDefaults[kind], domain: repos[kind].domain };
  const files = new Map();

  for (const [path, bytes] of await fetchPublicFiles(env, kind)) {
    addFile(files, path, bytes);
  }

  addFile(files, "index.html", renderSiteHome(site, articles));
  for (const slug of [...new Set(articles.map((article) => article.category).filter(Boolean))]) {
    addFile(files, `category/${slug}/index.html`, renderSiteCategory(site, articles, slug));
  }
  for (const article of articles) {
    addFile(files, `posts/${article.slug}/index.html`, renderSiteArticle(kind, site, articles, article));
  }
  addFile(files, "sitemap.xml", renderSitemap(site, articles));
  addFile(files, "robots.txt", `User-agent: *\nAllow: /\nSitemap: ${absoluteSiteUrl(site, "/sitemap.xml")}\n`);
  addFile(files, "ads.txt", "google.com, pub-3935732085325115, DIRECT, f08c47fec0942fa0\n");
  addFile(files, "_headers", "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n");
  return files;
}

async function cloudflare(env, path, options = {}) {
  const token = env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CF_API_TOKEN secret is not set. Cloudflare Pages direct deploy needs a Pages Write API token.");
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      "authorization": `Bearer ${token}`,
      ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const message = data?.errors?.[0]?.message || data?.message || `Cloudflare API failed: ${response.status}`;
    throw new Error(message);
  }
  return data.result ?? data;
}

async function deployPages(env, kind) {
  const files = await buildStaticFiles(env, kind);
  const projectName = pageProjects[kind];
  const tokenData = await cloudflare(env, `/accounts/${accountId}/pages/projects/${projectName}/upload-token`);
  const jwt = tokenData.jwt;
  const prepared = [];
  const manifest = {};

  for (const [path, file] of files) {
    const hash = await hashFile(path, file.bytes);
    prepared.push({ path, hash, ...file });
    manifest[`/${path}`] = hash;
  }

  const chunks = [];
  for (let index = 0; index < prepared.length; index += 20) {
    chunks.push(prepared.slice(index, index + 20));
  }
  for (const chunk of chunks) {
    await fetch("https://api.cloudflare.com/client/v4/pages/assets/upload", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${jwt}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(chunk.map((file) => ({
        key: file.hash,
        value: bytesToBase64(file.bytes),
        metadata: { contentType: file.contentType },
        base64: true
      })))
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data?.errors?.[0]?.message || `Cloudflare asset upload failed: ${response.status}`);
      }
    });
  }

  await fetch("https://api.cloudflare.com/client/v4/pages/assets/upsert-hashes", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${jwt}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ hashes: prepared.map((file) => file.hash) })
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data?.errors?.[0]?.message || `Cloudflare hash upsert failed: ${response.status}`);
    }
  });

  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("branch", "main");
  form.append("commit_message", `Deploy articles to ${projectName}`);
  form.append("commit_dirty", "false");
  if (files.has("_headers")) {
    form.append("_headers", new File([files.get("_headers").bytes], "_headers", { type: "text/plain" }));
  }
  const deployment = await cloudflare(env, `/accounts/${accountId}/pages/projects/${projectName}/deployments`, {
    method: "POST",
    body: form
  });

  return {
    code: 0,
    output: `Cloudflare Pages direct deployment complete: ${deployment.url || `${projectName}.pages.dev`}`,
    files: prepared.length,
    url: deployment.url || ""
  };
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

function removeExternalUrlsFromPlusHtml(html) {
  return String(html || "")
    .replace(/<a\b[^>]*href=(["'])https?:\/\/(?!plus\.liferoom-j\.com|info\.liferoom-j\.com)[^"']+\1[^>]*>([\s\S]*?)<\/a>/gi, "$2")
    .replace(/(?:공식\s*(?:링크|홈페이지|확인처|안내\s*주소|주소)\s*(?:는|:)?\s*)?https?:\/\/[^\s<)"']+/gi, "공식 안내 화면")
    .replace(/공식\s+링크\s*:\s*/gi, "")
    .replace(/홈페이지\s+주소\s*는\s*공식 안내 화면\s*입니다/gi, "공식 안내 화면에서 확인할 수 있습니다")
    .replace(/\s{2,}/g, " ");
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

function paxnetSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["label", "title", "intro", "paragraph1", "paragraph2", "boxTitle", "boxParagraph1", "boxParagraph2", "afterBoxParagraph1", "afterBoxParagraph2", "steps"],
    properties: {
      label: { type: "string" },
      title: { type: "string" },
      intro: { type: "string" },
      paragraph1: { type: "string" },
      paragraph2: { type: "string" },
      boxTitle: { type: "string" },
      boxParagraph1: { type: "string" },
      boxParagraph2: { type: "string" },
      afterBoxParagraph1: { type: "string" },
      afterBoxParagraph2: { type: "string" },
      steps: { type: "array", minItems: 5, maxItems: 5, items: { type: "string" } }
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
  const baseSlug = stripKnownSuffix(slugify(input.slug || suggestBaseSlug(keyword)));
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
      html: removeExternalUrlsFromPlusHtml(aiDraft?.plus?.html || fallbackPlusHtml(keyword))
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
      html: removeExternalUrlsFromPlusHtml(aiDraft?.info?.html || fallbackInfoHtml(keyword))
    }
  };
}

function normalizeNaverBody(text, plusUrl, linkText) {
  let clean = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  clean = clean
    .replaceAll(plusUrl, "")
    .split("\n")
    .filter((line) => line.trim() !== linkText)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const linkBlock = `${linkText}\n${plusUrl}`;
  const paragraphs = clean.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length === 0) return linkBlock;
  return [paragraphs[0], linkBlock, ...paragraphs.slice(1)].join("\n\n").trim();
}

function normalizePaxnetHtml(html, plusUrl, linkText) {
  let clean = String(html || "").trim();
  clean = clean.replace(/```html|```/gi, "").trim();
  const outerStyle = `padding:20px 0; margin:16px 0; background:#ffffff; font-family:'Apple SD Gothic Neo','Pretendard','Noto Sans KR',sans-serif; line-height:1.7; color:#111;`;
  const labelStyle = `display:inline-block; background:#e9faf5; color:#008b72; font-size:13px; font-weight:700; padding:7px 12px; border-radius:999px; margin-bottom:14px;`;
  const buttonStyle = `display:block; margin-top:20px; background:#e53935; color:#fff; padding:18px 20px; font-size:18px; font-weight:700; border-radius:50px; text-align:center; text-decoration:none; box-shadow:0 6px 12px rgba(229,57,53,0.25);`;
  const cta = `<a href="${plusUrl}" target="_blank" style="${buttonStyle}">${linkText}</a><br>`;
  const escapedUrl = plusUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ctaRegex = new RegExp(`<a\\b[^>]*href=["']${escapedUrl}["'][^>]*>[\\s\\S]*?<\\/a>\\s*(?:<br\\s*\\/?>)?`, "i");

  clean = clean.replace(/<div\s+style="[^"]*padding\s*:\s*20px\s+0[^"]*"[^>]*>/i, `<div style="${outerStyle}">`);
  clean = clean.replace(/<(?:div|span)\s+style="[^"]*display\s*:\s*inline-block[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i, `<span style="${labelStyle}">$1</span>`);

  if (ctaRegex.test(clean)) {
    clean = clean.replace(ctaRegex, cta);
  } else {
    clean = clean.replaceAll(plusUrl, "");
    clean = clean.replace(/(<\/p>)/i, `$1\n\n  ${cta}`);
    if (!clean.includes(plusUrl)) clean += `\n${cta}`;
  }
  if (!clean.startsWith("<p><br></p>")) {
    clean = `<p><br></p>${clean.replace(/^<p><br><\/p>/i, "")}`;
  }
  return clean;
}

function escapeHtmlValue(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildPaxnetHtml(draft, plusUrl, linkText) {
  const steps = Array.isArray(draft.steps) ? draft.steps.slice(0, 5) : [];
  while (steps.length < 5) steps.push("공식 안내에서 최신 내용을 다시 확인합니다.");
  const stepHtml = steps
    .map((step, index) => {
      const style = index === 4 ? "margin:0; font-size:16px;" : "margin:0 0 8px; font-size:16px;";
      return `<div style="${style}"><strong>${index + 1}.</strong> ${escapeHtmlValue(step)}</div>`;
    })
    .join("");

  return `<p><br></p><div style="padding:20px 0; margin:16px 0; background:#ffffff; font-family:'Apple SD Gothic Neo','Pretendard','Noto Sans KR',sans-serif; line-height:1.7; color:#111;"><span style="display:inline-block; background:#e9faf5; color:#008b72; font-size:13px; font-weight:700; padding:7px 12px; border-radius:999px; margin-bottom:14px;">${escapeHtmlValue(draft.label)}</span><h2 style="font-size:24px; margin:0 0 12px; line-height:1.4; color:#111;">${escapeHtmlValue(draft.title)}</h2><p style="margin:0 0 12px; font-size:16px;">${escapeHtmlValue(draft.intro)}</p><a href="${escapeHtmlValue(plusUrl)}" target="_blank" style="display:block; margin-top:20px; background:#e53935; color:#fff; padding:18px 20px; font-size:18px; font-weight:700; border-radius:50px; text-align:center; text-decoration:none; box-shadow:0 6px 12px rgba(229,57,53,0.25);">${escapeHtmlValue(linkText)}</a><br><p style="margin:0 0 12px; font-size:16px;">${escapeHtmlValue(draft.paragraph1)}</p><p style="margin:0 0 12px; font-size:16px;">${escapeHtmlValue(draft.paragraph2)}</p><div style="border-top:1px solid #e5e7eb; margin:20px 0; padding-top:16px;"><p style="margin:0 0 10px; font-size:16px; font-weight:700;">${escapeHtmlValue(draft.boxTitle)}</p><p style="margin:0 0 10px; font-size:16px;">${escapeHtmlValue(draft.boxParagraph1)}</p><p style="margin:0; font-size:16px;">${escapeHtmlValue(draft.boxParagraph2)}</p></div><p style="margin:0 0 12px; font-size:16px;">${escapeHtmlValue(draft.afterBoxParagraph1)}</p><p style="margin:0 0 12px; font-size:16px;">${escapeHtmlValue(draft.afterBoxParagraph2)}</p><div style="background:#f8f9fb; border-radius:12px; padding:15px; margin:18px 0 0;">${stepHtml}</div></div>`;
}

function paxnetExternalStyleGuide() {
  return `
팍스넷 발행문 내용 작성 기준:
- HTML 태그는 만들지 말고, JSON 필드에 들어갈 순수 한국어 텍스트만 작성합니다.
- label은 8~18자 정도의 짧은 안내 라벨로 작성합니다. 예: 부가가치세 신고 안내
- title은 핵심 키워드가 앞쪽에 오는 검색형 제목으로 작성합니다.
- intro, paragraph1, paragraph2, boxParagraph1, boxParagraph2, afterBoxParagraph1, afterBoxParagraph2는 각각 1~3문장으로 작성합니다.
- boxTitle은 중간 설명 박스 제목으로 작성합니다.
- steps는 확인 절차 5개를 순서대로 작성합니다. 각 항목 앞에 숫자는 붙이지 않습니다.
- 과장 광고 문구보다 실제 정보 안내처럼 씁니다.
`;
}

function naverExternalStyleGuide() {
  return `
네이버 외부유입 글 스타일 기준:
- 샘플 글처럼 "제목 → 자연스러운 디스크립션 → 텍스트 링크 → 키워드형 소제목 → 본문 → 정보박스/리스트 → 주의사항 → FAQ → 해시태그" 흐름으로 작성합니다.
- 상단 디스크립션은 250자 내외의 한 문단으로 씁니다. 검색자가 지금 왜 확인해야 하는지, 신청 대상이나 준비사항을 미리 확인하면 어떤 불편을 줄일 수 있는지 자연스럽게 설명합니다.
- 상단 디스크립션의 마지막 문장은 반드시 "바로 확인해보세요."로 끝냅니다.
- 상단 디스크립션에는 "헷갈릴 때가 많습니다", "많이 헷갈립니다", "혼란스러울 수 있습니다" 같은 표현을 쓰지 않습니다.
- 상단 디스크립션에는 "어디서 켜야 하는지", "설치만 하면 바로 참여되는지", "먼저 확인하게 됩니다", "미리 봐두면", "시간을 줄일 수 있습니다"처럼 설명을 길게 늘이는 표현도 쓰지 않습니다.
- 상단 디스크립션은 "상황 제시 → 확인하면 좋은 항목 2~3개 → 바로 확인해보세요." 흐름으로 씁니다.
- 상단 디스크립션은 아래 공식에 맞춰 작성합니다.
  공식 1: "{키워드/서비스} 이용 중 {상황}이 생겼다면 {핵심 안내}를 먼저 확인하는 것이 좋습니다. {확인 항목 2개}을 바로 확인해보세요."
  공식 2: "{키워드/서비스} 이용 방법을 찾고 있다면 {확인 항목 3개}까지 한 번에 알아두면 편리합니다. 필요한 {문의/신청/조회} 방법을 지금 바로 확인해보세요."
- 상단 디스크립션 예시: "선풍기, 난방기, 제습기 등 신일전자 생활가전 이용 중 문제가 생겼다면 고객센터 안내를 먼저 확인하는 것이 좋습니다. AS 접수 방법과 서비스센터 찾는 법을 바로 확인해보세요."
- 상단 디스크립션 예시: "신일전자 고객센터 이용 방법을 찾고 있다면 전화 상담, AS 신청, 서비스센터 위치 확인까지 한 번에 알아두면 편리합니다. 필요한 문의 방법을 지금 바로 확인해보세요."
- 디스크립션은 광고 문구처럼 쓰지 않습니다. "지금 바로", "놓치지 마세요", "완벽 정리" 같은 과장 표현보다 "미리 확인해두면", "접수 전에 살펴보면", "헷갈리기 쉬운 부분을 정리했습니다"처럼 사람이 쓴 안내문 톤을 사용합니다.
- 첫 문단은 B블로그 설명을 그대로 복사하지 말고, 실제 검색자가 궁금해할 상황을 짧게 짚어 시작합니다.
- A 블로그 링크는 본문 초반 디스크립션 바로 아래에 텍스트 링크 형태로 한 번 넣고, 본문 마지막에도 같은 링크를 반복하지 않습니다.
- A 블로그 링크를 글 마지막 CTA처럼 쓰지 않습니다. 디스크립션 다음 줄에만 자연스럽게 배치하고, 마지막 문단은 정보 확인이나 주의사항으로 마무리합니다.
- 링크 문구는 지나치게 광고처럼 쓰지 말고, "자세한 신청 기준 확인하기", "공식 안내 기준 확인하기", "예약 가능 여부 확인하기"처럼 키워드와 행동이 함께 보이게 씁니다.
- 소제목은 "핵심 정보" 같은 추상어를 피하고, 반드시 키워드가 들어간 문장형으로 씁니다. 예: "삼성전자 온누리상품권 환급신청 대상", "공항버스 승차권 예약 전 확인할 점".
- 본문은 짧은 문단 2~3개마다 소제목을 넣어 모바일에서 읽기 쉽게 나눕니다.
- 표 대신 네이버에 붙여넣기 쉬운 줄형 요약을 사용합니다. 형식은 아래처럼 씁니다.
  대상: 신청 가능한 사람 또는 조건
  기간: 접수 또는 조회 기준
  준비물: 필요한 서류나 정보
  확인처: 공식 안내 또는 조회 화면
- 중간에 정보박스처럼 보이는 "확인할 내용" 목록을 넣습니다. 각 줄은 "- "로 시작합니다.
- FAQ는 2~4개를 넣되, 질문은 실제 검색자가 물을 법한 말투로 작성합니다.
- FAQ 답변은 절대 비워두지 않습니다. 각 답변은 1~2문장으로 완성하고, "A."만 남기거나 중간에 끊긴 상태로 끝내지 않습니다.
- 글 전체는 1500~2000자 안팎으로 유지하고, 문장 끝 패턴을 반복하지 않습니다.
- 네이버 블로그와 네이버 카페 글은 같은 B블로그를 참고하더라도 중복문서처럼 보이면 안 됩니다. 제목, 첫 문단, 소제목 순서, 요약 항목명, FAQ 질문을 서로 다르게 구성합니다.
- 네이버 블로그 글은 "검색자가 저장해두고 보는 정리글"처럼 작성합니다. 대상, 신청방법, 준비물, 주의사항, FAQ 순서로 차분하게 설명하고 문장은 공식 안내를 풀어쓴 느낌으로 씁니다.
- 네이버 카페 글은 "카페 회원에게 필요한 정보를 빠르게 정리해주는 게시글"처럼 작성합니다. 첫 문단은 서비스 이용 상황과 확인 항목을 바로 안내하고, 주의사항과 체크리스트를 앞쪽에 배치한 뒤 신청방법을 설명합니다.
- 카페 글에서는 블로그 글과 같은 소제목을 재사용하지 않습니다. 예를 들어 블로그가 "삼성카드 해지방법 신청 경로"라면 카페는 "삼성카드 해지 전에 먼저 봐야 할 부분"처럼 관점을 바꿉니다.
- 카페 글 소제목은 10~20자 안팎으로 간결하게 쓰되, SEO에 필요한 핵심 키워드를 포함합니다. 예: "삼성카드 해지 전 확인", "삼성카드 앱 해지", "고객센터 상담 필요", "자동납부 해지 주의".
- 카페 글 제목 후보는 검색 상위노출을 노리고 작성합니다. 핵심 키워드를 제목 앞쪽에 넣고, 사용자가 많이 찾는 보조 키워드(방법, 신청, 조회, 고객센터, 준비물, 주의사항 등)를 자연스럽게 결합합니다.
- 카페 글 제목은 26~42자 안팎으로 만들고, 낚시성 표현보다 "삼성카드 해지방법 고객센터 상담 전 확인사항"처럼 검색어와 해결 포인트가 바로 보이게 씁니다.
- 블로그 글 제목 후보는 정보형으로, 카페 글 제목 후보는 질문 해결형 또는 경험 공유형으로 만듭니다. 단, 과장된 낚시성 표현은 쓰지 않습니다.
- 본문 어디에도 "카페글로 생성했습니다", "블로그 글로 생성했습니다", "아래는 작성한 글입니다", "요청하신 글입니다" 같은 생성 안내 문구를 넣지 않습니다. 독자가 바로 읽는 완성 게시글만 작성합니다.
`;
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
${naverExternalStyleGuide()}

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
- 첫 문단은 상단 디스크립션 역할을 합니다. 서비스 이용 상황을 바로 제시하고, 확인할 항목을 자연스럽게 연결한 뒤 "바로 확인해보세요."로 끝냅니다.
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

async function makePaxnetDraft(env, input) {
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

  const targetLength = Math.min(2500, Math.max(1600, Number(input.targetLength || 2200)));
  const linkText = String(input.linkText || "자세한 내용 확인하기").trim();
  const bodyText = infoArticle.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 10000);

  const draft = await openAiJson(env, `
${paxnetExternalStyleGuide()}

아래 B 블로그 글을 참고해 팍스넷 발행용 글 내용을 작성합니다. HTML은 만들지 말고 JSON 필드별 텍스트만 작성합니다.

B 블로그 제목:
${infoArticle.title}

B 블로그 설명:
${infoArticle.description}

B 블로그 본문 참고자료:
${bodyText}

A 블로그 링크:
${plusUrl}

A 링크 버튼 문구:
${linkText}

목표 분량:
HTML 태그 제외 한국어 본문 기준 ${targetLength}자 내외

작성 규칙:
- 제목은 검색 상위 노출을 고려해 핵심 키워드가 앞쪽에 오도록 작성합니다.
- 본문은 레퍼런스 파일처럼 간결한 안내문 스타일로 작성합니다.
- 첫 문단은 이용자가 왜 확인해야 하는지 바로 이해되는 자연스러운 설명으로 씁니다.
- CTA 버튼 href는 반드시 A 블로그 링크를 사용합니다.
- 버튼 문구는 입력된 A 링크 버튼 문구를 그대로 사용합니다.
- 절차 박스에는 1~5번 확인 순서를 넣습니다.
- B 블로그 본문을 그대로 복사하지 말고 팍스넷 외부유입용 안내문으로 재구성합니다.
- 반환 JSON에는 label, title, intro, paragraph1, paragraph2, boxTitle, boxParagraph1, boxParagraph2, afterBoxParagraph1, afterBoxParagraph2, steps만 넣습니다.
`, paxnetSchema(), "liferoom_cloud_paxnet_draft");

  if (!draft.title || !draft.intro || !Array.isArray(draft.steps)) throw new Error("팍스넷 발행문 응답 형식이 올바르지 않습니다.");
  return {
    infoSlug: infoArticle.slug,
    infoTitle: infoArticle.title,
    plusSlug: matchedPlus?.slug || "",
    plusUrl,
    title: draft.title,
    html: buildPaxnetHtml(draft, plusUrl, linkText),
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
    const baseSlug = stripKnownSuffix(suggestBaseSlug(body.keyword || ""));
    return json({ slug: baseSlug, plusSlug: `${baseSlug}-quick-guide`, infoSlug: `${baseSlug}-guide` });
  }

  if (request.method === "POST" && pathname === "/api/draft") {
    return json(await makeDraft(env, await request.json()));
  }

  if (request.method === "POST" && pathname === "/api/naver-draft") {
    return json(await makeNaverDraft(env, await request.json()));
  }

  if (request.method === "POST" && pathname === "/api/paxnet-draft") {
    return json(await makePaxnetDraft(env, await request.json()));
  }

  if (request.method === "POST" && pathname === "/api/publish-deploy") {
    const draft = await request.json();
    if (!draft.plus || !draft.info) throw new Error("초안 데이터가 없습니다.");
    await appendArticle(env, "plus", draft.plus);
    await appendArticle(env, "info", draft.info);
    const deploy = {
      plus: await deployPages(env, "plus"),
      info: await deployPages(env, "info")
    };
    const output = "GitHub commit and Cloudflare Pages direct deployment completed.";
    return json({
      ok: true,
      plusUrl: articleUrl("plus", draft.plus.slug),
      infoUrl: articleUrl("info", draft.info.slug),
      build: { plus: { code: 0, output }, info: { code: 0, output } },
      deploy
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
