import { mkdir, rm, writeFile, copyFile, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { articles } from "../src/content/articles.mjs";
import { categories, site } from "../src/site.config.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const publicDir = join(root, "public");

const esc = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const absoluteUrl = (path) => new URL(path, site.siteUrl).toString();
const articleUrl = (article) => `/guide/${article.slug}/`;
const categoryUrl = (slug) => `/category/${slug}/`;
const adsenseClient = "ca-pub-8637673382238209";
const adsenseSlot = "8447020827";

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function writePage(path, html) {
  const target = join(dist, path, "index.html");
  await ensureDir(dirname(target));
  await writeFile(target, html, "utf8");
}

async function copyPublic(from = publicDir, to = dist) {
  try {
    const items = await readdir(from, { withFileTypes: true });
    await ensureDir(to);
    await Promise.all(
      items.map(async (item) => {
        const src = join(from, item.name);
        const dest = join(to, item.name);
        if (item.isDirectory()) return copyPublic(src, dest);
        return copyFile(src, dest);
      })
    );
  } catch {
    // public directory is optional during early scaffolding.
  }
}

function layout({ title, description, path = "/", body, type = "website", jsonLd = "", includeAds = false }) {
  const pageTitle = title === site.name ? title : `${title} | ${site.name}`;
  const canonical = absoluteUrl(path);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/styles.css">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${absoluteUrl(site.defaultImage)}">
  <meta name="twitter:card" content="summary_large_image">
  ${includeAds ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}" crossorigin="anonymous"></script>` : ""}
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.siteUrl,
    description: site.description,
    potentialAction: {
      "@type": "SearchAction",
      target: `${site.siteUrl}/search/?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  })}</script>
  ${jsonLd}
</head>
<body>
  <a class="skip" href="#content">본문 바로가기</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="/" aria-label="${site.name} 홈">
        <span class="brand-mark">정</span>
        <span>
          <strong>${site.name}</strong>
          <small>${site.tagline}</small>
        </span>
      </a>
      <nav class="nav" aria-label="주요 메뉴">
        ${site.nav.map((item) => `<a href="${item.href}">${item.label}</a>`).join("")}
      </nav>
    </div>
  </header>
  <main id="content">
    ${body}
  </main>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <strong>${site.name}</strong>
        <p>정부 민원 절차를 쉽게 이해할 수 있도록 정리하는 비공식 정보 안내 사이트입니다.</p>
      </div>
      <div class="footer-links">
        <a href="/about/">사이트 소개</a>
        <a href="/privacy/">개인정보처리방침</a>
        <a href="/terms/">이용약관</a>
        <a href="/disclaimer/">면책고지</a>
        <a href="/contact/">문의하기</a>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

function renderAd(label = "디스플레이 광고") {
  return `<div class="ad-wrap" aria-label="${label}">
    <ins class="adsbygoogle"
      style="display:block"
      data-ad-client="${adsenseClient}"
      data-ad-slot="${adsenseSlot}"
      data-ad-format="auto"
      data-full-width-responsive="true"></ins>
    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
  </div>`;
}

function articleCard(article) {
  const category = categories[article.category];
  return `<article class="card">
    <a class="card-link" href="${articleUrl(article)}">
      <span class="eyebrow">${esc(category.name)}</span>
      <h3>${esc(article.title)}</h3>
      <p>${esc(article.description)}</p>
      <dl class="mini-facts">
        <div><dt>신청</dt><dd>${esc(article.summary.availability)}</dd></div>
        <div><dt>처리</dt><dd>${esc(article.summary.time)}</dd></div>
      </dl>
    </a>
  </article>`;
}

function renderHome() {
  const featured = articles.slice(0, 6);
  const latest = [...articles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  const body = `<section class="hero">
    <div class="container hero-grid">
      <div>
        <p class="eyebrow">정부 민원 안내</p>
        <h1>필요한 서류, 어디서 어떻게 발급할지 빠르게 확인하세요.</h1>
        <p class="hero-copy">여권, 인감증명서, 소득금액증명원, 주민등록등본처럼 자주 찾는 민원 정보를 준비물·수수료·신청방법 기준으로 정리합니다.</p>
        <div class="hero-actions">
          <a class="button primary" href="/category/documents/">민원서류 보기</a>
          <a class="button secondary" href="/category/life-guide/">생활가이드 보기</a>
        </div>
      </div>
      <div class="quick-panel" aria-label="빠른 확인">
        <h2>빠른 민원 체크</h2>
        <ul>
          <li><strong>온라인 가능</strong><span>등본, 가족관계, 소득증명 등</span></li>
          <li><strong>방문 필요</strong><span>인감증명서, 일부 여권 업무</span></li>
          <li><strong>먼저 확인</strong><span>제출처 요구 서류 종류와 공개 범위</span></li>
        </ul>
      </div>
    </div>
  </section>
  <section class="container section">
    <div class="section-head">
      <p class="eyebrow">카테고리</p>
      <h2>상황별로 찾기</h2>
    </div>
    <div class="category-grid">
      ${Object.entries(categories)
        .map(([slug, category]) => `<a class="category-tile" href="${categoryUrl(slug)}"><h3>${category.name}</h3><p>${category.description}</p></a>`)
        .join("")}
    </div>
  </section>
  <section class="container section">
    <div class="section-head">
      <p class="eyebrow">추천 안내</p>
      <h2>많이 찾는 민원</h2>
    </div>
    <div class="card-grid">${featured.map(articleCard).join("")}</div>
  </section>
  <section class="container section split">
    <div>
      <p class="eyebrow">업데이트</p>
      <h2>최근 정리한 글</h2>
    </div>
    <div class="list-panel">
      ${latest
        .map((article) => `<a href="${articleUrl(article)}"><span>${esc(article.title)}</span><time datetime="${article.updatedAt}">${article.updatedAt}</time></a>`)
        .join("")}
    </div>
  </section>`;
  return layout({ title: site.name, description: site.description, body });
}

function renderCategory(slug, category) {
  const items = articles.filter((article) => article.category === slug);
  const body = `<section class="page-hero">
    <div class="container">
      <p class="eyebrow">카테고리</p>
      <h1>${esc(category.name)}</h1>
      <p>${esc(category.description)}</p>
    </div>
  </section>
  <section class="container section">
    <div class="card-grid">${items.map(articleCard).join("")}</div>
  </section>`;
  return layout({
    title: `${category.name} 안내`,
    description: category.description,
    path: categoryUrl(slug),
    body
  });
}

function renderArticle(article) {
  const category = categories[article.category];
  const related = articles
    .filter((item) => item.category === article.category && item.slug !== article.slug)
    .slice(0, 3);
  const actionLinks = getActionLinks(article);
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    dateModified: article.updatedAt,
    datePublished: article.updatedAt,
    author: { "@type": "Organization", name: site.name },
    publisher: { "@type": "Organization", name: site.name },
    mainEntityOfPage: absoluteUrl(articleUrl(article))
  })}</script>
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a }
    }))
  })}</script>`;

  const body = `<article class="article-shell">
    <header class="article-hero">
      <div class="container article-head">
        ${renderAd("상단 디스플레이 광고")}
        <a class="breadcrumb" href="${categoryUrl(article.category)}">${esc(category.name)}</a>
        <h1>${esc(article.title)}</h1>
        <p class="article-description">${esc(article.description)}</p>
        <div class="article-actions">
          ${actionLinks.map((link) => `<a class="button ${link.primary ? "primary" : "secondary"}" href="${link.url}" rel="nofollow noopener" target="_blank">${esc(link.label)}</a>`).join("")}
        </div>
        ${renderInlineSummary(article)}
        <div class="meta-row">
          <span>최종 업데이트 ${article.updatedAt}</span>
          <span>읽는 시간 ${article.readingMinutes}분</span>
        </div>
      </div>
    </header>
    <div class="container article-layout article-layout-clean">
      <div class="article-content">
        <p class="notice">정보브리핑은 공식 정부기관이 아닌 민원 정보 안내 사이트입니다. 실제 신청 조건과 수수료는 기관 고시에 따라 달라질 수 있으니 제출 전 공식 발급처를 확인하세요.</p>
        ${article.sections.map((section, index) => renderSection(section, { adAfterHeading: index === 0 })).join("")}
        <section>
          <h2>공식 확인 링크</h2>
          <div class="official-links">${actionLinks.map((link) => `<a href="${link.url}" rel="nofollow noopener" target="_blank">${esc(link.label)}</a>`).join("")}</div>
        </section>
        <section>
          <h2>자주 묻는 질문</h2>
          <div class="faq-list">${article.faqs.map((faq) => `<details><summary>${esc(faq.q)}</summary><p>${esc(faq.a)}</p></details>`).join("")}</div>
        </section>
      </div>
    </div>
  </article>
  <section class="container section">
    <div class="section-head">
      <p class="eyebrow">같이 보면 좋은 글</p>
      <h2>${esc(category.name)} 관련 안내</h2>
    </div>
    <div class="card-grid">${related.map(articleCard).join("")}</div>
  </section>`;

  return layout({
    title: article.title,
    description: article.description,
    path: articleUrl(article),
    body,
    type: "article",
    jsonLd,
    includeAds: true
  });
}

function renderInlineSummary(article) {
  return `<div class="inline-summary" aria-label="한눈에 보기">
    <dl>
      <div><dt>신청 가능</dt><dd>${esc(article.summary.availability)}</dd></div>
      <div><dt>발급처</dt><dd>${esc(article.summary.place)}</dd></div>
      <div><dt>수수료</dt><dd>${esc(article.summary.fee)}</dd></div>
      <div><dt>처리 시간</dt><dd>${esc(article.summary.time)}</dd></div>
      <div><dt>준비물</dt><dd>${esc(article.summary.documents)}</dd></div>
    </dl>
  </div>`;
}

function getActionLinks(article) {
  const seen = new Set();
  const links = [];
  for (const link of article.officialLinks || []) {
    if (!link?.url || seen.has(link.url)) continue;
    seen.add(link.url);
    links.push({ ...link, primary: links.length === 0 });
    if (links.length === 2) return links;
  }
  const fallbacks = [
    { label: "정부24에서 확인하기", url: "https://www.gov.kr/" },
    { label: "공식 발급처 검색하기", url: "https://www.gov.kr/search" }
  ];
  for (const link of fallbacks) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    links.push({ ...link, primary: links.length === 0 });
    if (links.length === 2) break;
  }
  return links;
}

function renderSection(section, options = {}) {
  return `<section>
    <h2>${esc(section.heading)}</h2>
    ${options.adAfterHeading ? renderAd("본문 디스플레이 광고") : ""}
    ${(section.body || []).map((p) => `<p>${esc(p)}</p>`).join("")}
    ${section.list ? `<ul>${section.list.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
    ${section.steps ? `<ol>${section.steps.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>` : ""}
    ${section.table ? renderTable(section.table) : ""}
  </section>`;
}

function renderTable(table) {
  return `<div class="table-wrap"><table>
    <thead><tr>${table.headers.map((head) => `<th>${esc(head)}</th>`).join("")}</tr></thead>
    <tbody>${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function renderStaticPage({ title, description, path, content }) {
  return layout({
    title,
    description,
    path,
    body: `<section class="page-hero"><div class="container"><h1>${esc(title)}</h1><p>${esc(description)}</p></div></section><section class="container prose">${content}</section>`
  });
}

function renderSitemap() {
  const urls = [
    "/",
    "/search/",
    "/about/",
    "/contact/",
    "/privacy/",
    "/terms/",
    "/disclaimer/",
    ...Object.keys(categories).map(categoryUrl),
    ...articles.map(articleUrl)
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((path) => `  <url><loc>${absoluteUrl(path)}</loc><lastmod>2026-05-20</lastmod></url>`)
  .join("\n")}
</urlset>`;
}

async function build() {
  await rm(dist, { recursive: true, force: true });
  await ensureDir(dist);
  await copyPublic();

  await writePage("", renderHome());
  await writePage(
    "search",
    layout({
      title: "민원 안내 검색",
      description: "정보브리핑의 여권, 증명서, 세금, 보험 민원 안내 글을 검색합니다.",
      path: "/search/",
      body: `<section class="page-hero"><div class="container"><h1>민원 안내 검색</h1><p>찾고 싶은 서류명이나 신청 상황을 입력하세요.</p></div></section>
      <section class="container section">
        <div class="search-box">
          <label for="q">검색어</label>
          <input id="q" type="search" placeholder="예: 인감증명서, 여권 재발급, 소득금액증명원">
        </div>
        <div id="results" class="card-grid" aria-live="polite"></div>
      </section>
      <script type="application/json" id="search-data">${JSON.stringify(
        articles.map((article) => ({
          title: article.title,
          description: article.description,
          url: articleUrl(article),
          category: categories[article.category].name,
          tags: article.tags
        }))
      ).replaceAll("<", "\\u003c")}</script>
      <script src="/assets/search.js" defer></script>`
    })
  );
  await Promise.all(Object.entries(categories).map(([slug, category]) => writePage(`category/${slug}`, renderCategory(slug, category))));
  await Promise.all(articles.map((article) => writePage(`guide/${article.slug}`, renderArticle(article))));

  const staticPages = [
    {
      path: "/about/",
      title: "사이트 소개",
      description: "정보브리핑이 제공하는 민원 안내 정보의 목적과 운영 원칙입니다.",
      content: `<p>정보브리핑은 여권, 증명서, 세금, 건강보험 등 생활 행정 절차를 쉽게 이해할 수 있도록 정리하는 비공식 정보 안내 사이트입니다.</p><p>각 글은 신청 대상, 준비물, 발급처, 수수료, 처리 시간을 중심으로 구성하며 공식 신청은 정부기관 또는 공공기관 사이트에서 진행해야 합니다.</p>`
    },
    {
      path: "/contact/",
      title: "문의하기",
      description: "정보 수정 요청, 제휴, 사이트 운영 문의 안내입니다.",
      content: `<p>정보 수정 요청이나 문의가 있으면 도메인 연결 후 운영 이메일을 이 페이지에 게시할 예정입니다.</p><p>민원 처리 결과, 발급 가능 여부, 개인별 자격 판단은 각 공식 기관에 문의해 주세요.</p>`
    },
    {
      path: "/privacy/",
      title: "개인정보처리방침",
      description: "정보브리핑의 개인정보 처리 기준입니다.",
      content: `<p>정보브리핑은 회원가입 기능을 운영하지 않으며, 방문자가 글을 읽기 위해 이름, 주민등록번호, 연락처를 입력하도록 요구하지 않습니다.</p><p>향후 Google AdSense 등 광고 서비스가 적용되면 쿠키 또는 광고 식별자가 사용될 수 있으며, 관련 내용은 광고 적용 시점에 맞춰 갱신합니다.</p>`
    },
    {
      path: "/terms/",
      title: "이용약관",
      description: "정보브리핑 사이트 이용 조건입니다.",
      content: `<p>본 사이트의 콘텐츠는 일반적인 정보 제공 목적이며, 법률·세무·행정 대리 서비스를 제공하지 않습니다.</p><p>사용자는 실제 신청 전 공식 기관의 최신 안내를 확인해야 하며, 본 사이트의 정보를 무단 복제하거나 상업적으로 재배포할 수 없습니다.</p>`
    },
    {
      path: "/disclaimer/",
      title: "면책고지",
      description: "정부기관 비공식 안내 사이트임을 알리는 고지입니다.",
      content: `<p>정보브리핑은 정부기관, 지방자치단체, 공공기관이 직접 운영하는 공식 사이트가 아닙니다.</p><p>민원 제도, 수수료, 신청 조건은 변경될 수 있으므로 최종 신청 전 정부24, 홈택스, 국민건강보험, 외교부 등 공식 발급처에서 최신 정보를 확인하세요.</p>`
    }
  ];
  await Promise.all(staticPages.map((page) => writePage(page.path.slice(1, -1), renderStaticPage(page))));
  await writeFile(
    join(dist, "404.html"),
    renderStaticPage({
      path: "/404.html",
      title: "페이지를 찾을 수 없습니다",
      description: "요청한 주소의 페이지가 없거나 이동되었습니다.",
      content: `<p>주소를 다시 확인하거나 홈에서 필요한 민원 안내를 찾아보세요.</p><p><a class="button primary" href="/">홈으로 이동</a></p>`
    }),
    "utf8"
  );
  await writeFile(join(dist, "sitemap.xml"), renderSitemap(), "utf8");
  await writeFile(join(dist, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`, "utf8");
}

await build();
console.log(`Built ${articles.length} articles into ${dist}`);
