import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const adminRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = dirname(adminRoot);
const liferoomRoot = dirname(workspaceRoot);
const plusRoot = join(liferoomRoot, "liferoom-plus");
const infoRoot = join(liferoomRoot, "liferoom-info-pages");
const nodeBin = join(workspaceRoot, ".tools", "node", "node.exe");
const wranglerBin = join(workspaceRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const port = Number(process.env.PORT || 5177);

const roots = {
  plus: {
    root: plusRoot,
    domain: "https://plus.liferoom-j.com",
    project: "liferoom-plus",
    articles: join(plusRoot, "src", "articles.mjs")
  },
  info: {
    root: infoRoot,
    domain: "https://info.liferoom-j.com",
    project: "liferoom-info",
    articles: join(infoRoot, "src", "articles.mjs")
  }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

function todayKorea() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function slugify(input) {
  const roman = String(input || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return roman || `post-${Date.now()}`;
}

const slugDictionary = [
  ["국가장학금", "national-scholarship"],
  ["지방선거", "local-election"],
  ["사전투표소", "early-voting-place"],
  ["투표소", "polling-place"],
  ["공익직불금", "public-direct-payment"],
  ["생활지원금", "living-support-payment"],
  ["지원금", "support-payment"],
  ["장학금", "scholarship"],
  ["이음카드", "eum-card"],
  ["잔액조회", "balance-check"],
  ["배당금", "dividend"],
  ["삼성전자", "samsung-electronics"],
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
  ["온라인", "online"],
  ["신청기간", "application-period"],
  ["신청방법", "application-method"],
  ["신청대상", "eligibility"],
  ["제출서류", "required-documents"],
  ["필요서류", "required-documents"],
  ["준비물", "preparation"],
  ["지급일", "payment-date"],
  ["지급대상", "payment-eligibility"],
  ["지급내역", "payment-history"],
  ["조회방법", "lookup-method"],
  ["위치안내", "location-guide"],
  ["바로가기", "shortcut"],
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
  return slug.replace(/-(quick-)?guide$/, "");
}

async function uniqueBaseSlug(baseSlug) {
  const [plus, info] = await Promise.all([importArticles("plus"), importArticles("info")]);
  const used = new Set([
    ...plus.map((article) => article.slug),
    ...info.map((article) => article.slug),
    ...plus.map((article) => stripKnownSuffix(article.slug)),
    ...info.map((article) => stripKnownSuffix(article.slug))
  ]);
  let candidate = baseSlug;
  let index = 2;
  while (
    used.has(candidate) ||
    used.has(`${candidate}-quick-guide`) ||
    used.has(`${candidate}-guide`)
  ) {
    candidate = `${baseSlug}-${index}`;
    index += 1;
  }
  return candidate;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paragraph(text) {
  return `<p style="margin: 16px 0; line-height: 1.9; color: #333;">${escapeHtml(text)}</p>`;
}

function heading(id, text) {
  return `<h2 id="toc-${id}" style="border-left: 5px solid #2563eb; padding: 14px 0 14px 18px; margin: 40px 0 20px 0; font-size: 22px; font-weight: 700; color: #1a1a1a; line-height: 1.4; letter-spacing: -0.02em;">${escapeHtml(text)}</h2>`;
}

function buildPlusHtml({ keyword, infoTitle, button1, button2 }) {
  return `
      <p><!--no toc--></p>
      ${paragraph(`${keyword}를 빠르게 확인하려는 분들을 위해 신청 대상, 확인 경로, 준비해야 할 내용을 핵심만 정리했습니다. 자세한 표와 FAQ는 아래 안내 페이지에서 이어서 확인할 수 있습니다.`)}
      ${heading(0, `${keyword} 바로 확인`)}
      ${paragraph(`${keyword}는 공식 안내 페이지에서 최신 기준을 확인하는 것이 가장 중요합니다. 신청 기간, 대상 조건, 제출서류, 조회 경로는 시기별로 달라질 수 있으므로 먼저 본인에게 해당되는 항목을 확인한 뒤 진행하는 것이 좋습니다.`)}
      ${paragraph(`아래 버튼을 누르면 ${infoTitle} 상세 안내 페이지로 이동합니다. 상세 페이지에서는 준비서류, 신청 절차, 자주 묻는 질문을 더 길게 정리해 두었습니다.`)}
      ${heading(1, `${button1} 전 확인사항`)}
      ${paragraph(`${button1} 또는 ${button2}를 진행하기 전에는 본인 인증 수단, 신청자 정보, 제출 대상 서류를 미리 준비해 두면 처리 시간을 줄일 수 있습니다. 모바일보다 PC에서 더 안정적으로 처리되는 민원도 있으니 오류가 반복되면 PC 환경을 함께 확인하세요.`)}
      <!-- CONTENT END 1 -->
    `;
}

function buildInfoHtml({ keyword, officialUrl, button1, button2 }) {
  return `
      <p><!--no toc--></p>
      ${paragraph(`${keyword}를 찾는 분들이 가장 먼저 확인해야 할 내용은 대상 조건, 신청 또는 조회 경로, 제출서류, 처리 일정입니다. 이 글에서는 공식 사이트에서 확인해야 할 핵심 항목과 진행 전 준비사항을 표와 FAQ로 정리했습니다.`)}
      ${heading(0, `${keyword} 신청 대상과 확인 기준`)}
      ${paragraph(`${keyword}는 안내 기관, 접수 기간, 신청자 상황에 따라 필요한 정보가 달라질 수 있습니다. 따라서 검색 결과의 요약 정보만 보고 판단하기보다 공식 사이트에서 공지사항과 신청 화면을 함께 확인하는 것이 안전합니다.`)}
      <table class="info-table">
        <thead>
          <tr>
            <th>확인 항목</th>
            <th>체크 내용</th>
            <th>주의사항</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>신청 대상</td>
            <td>연령, 거주지, 소득, 자격요건 등 본인에게 해당되는 기준을 확인합니다.</td>
            <td>대상 기준은 공고 시점에 따라 바뀔 수 있습니다.</td>
          </tr>
          <tr>
            <td>신청 기간</td>
            <td>접수 시작일과 마감일, 온라인 접수 가능 시간을 확인합니다.</td>
            <td>마감일에는 접속 지연이 생길 수 있어 미리 처리하는 것이 좋습니다.</td>
          </tr>
          <tr>
            <td>필요서류</td>
            <td>신분 확인, 자격 확인, 소득 또는 거주 확인 서류를 준비합니다.</td>
            <td>공동인증서, 간편인증, PDF 저장 가능 여부를 함께 확인하세요.</td>
          </tr>
          <tr>
            <td>공식 링크</td>
            <td><a href="${escapeHtml(officialUrl)}" rel="noopener">${escapeHtml(button1)}</a> 또는 <a href="${escapeHtml(officialUrl)}" rel="noopener">${escapeHtml(button2)}</a> 메뉴를 이용합니다.</td>
            <td>유사 사이트가 아닌 공식 기관 주소인지 확인해야 합니다.</td>
          </tr>
        </tbody>
      </table>
      ${heading(1, `${keyword} 온라인 신청방법`)}
      ${paragraph(`온라인으로 진행할 때는 공식 사이트 접속 후 본인 인증을 먼저 완료하고, 신청 또는 조회 메뉴에서 안내에 따라 정보를 입력합니다. 신청서 작성 중 임시저장 기능이 없는 경우가 있으므로 제출 전 입력 정보를 한 번 더 확인하는 것이 좋습니다.`)}
      <ol style="margin: 16px 0 24px 20px; line-height: 1.9; color: #333;">
        <li>공식 사이트에 접속해 신청 또는 조회 메뉴를 선택합니다.</li>
        <li>간편인증, 공동인증서, 휴대폰 인증 등 가능한 방식으로 본인 인증을 진행합니다.</li>
        <li>신청자 정보와 대상 조건을 확인하고 필요한 항목을 입력합니다.</li>
        <li>제출서류가 필요한 경우 PDF 또는 이미지 파일을 첨부합니다.</li>
        <li>접수 완료 화면, 접수번호, 처리상태를 저장하거나 캡처합니다.</li>
      </ol>
      ${heading(2, `${keyword} 필요서류와 준비물`)}
      ${paragraph(`필요서류는 제도나 서비스 성격에 따라 다르지만, 일반적으로 신분 확인 자료, 자격 확인 자료, 소득 또는 거주 확인 자료가 요구될 수 있습니다. 서류 발급일 기준이 정해져 있는 경우 오래된 서류는 반려될 수 있으므로 제출 직전에 다시 확인하는 편이 안전합니다.`)}
      <table class="info-table">
        <thead>
          <tr>
            <th>준비물</th>
            <th>용도</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>본인 인증 수단</td>
            <td>신청자 본인 확인 및 온라인 접수 진행에 필요합니다.</td>
          </tr>
          <tr>
            <td>기본 인적사항</td>
            <td>이름, 생년월일, 연락처, 주소 등 신청서 작성에 사용됩니다.</td>
          </tr>
          <tr>
            <td>증빙서류</td>
            <td>대상 여부를 확인하기 위한 서류로 PDF 또는 이미지 제출이 필요할 수 있습니다.</td>
          </tr>
          <tr>
            <td>접수번호</td>
            <td>신청 완료 후 진행상태 조회와 보완 요청 확인에 필요합니다.</td>
          </tr>
        </tbody>
      </table>
      ${heading(3, `${keyword} FAQ`)}
      <div class="faq-list">
        <details>
          <summary>${keyword}는 어디에서 확인하나요?</summary>
          <p>아래 버튼으로 연결되는 공식 사이트에서 신청, 조회, 서류 안내를 확인하는 것이 가장 안전합니다.</p>
        </details>
        <details>
          <summary>모바일에서도 신청할 수 있나요?</summary>
          <p>대부분의 서비스는 모바일 접속이 가능하지만, 파일 첨부나 인증 오류가 반복되면 PC 환경에서 다시 시도하는 것이 좋습니다.</p>
        </details>
        <details>
          <summary>서류는 꼭 PDF로 준비해야 하나요?</summary>
          <p>기관별로 PDF, JPG, PNG 등 허용 형식이 다를 수 있습니다. 제출 화면의 파일 형식 안내를 먼저 확인하세요.</p>
        </details>
        <details>
          <summary>신청 후 처리상태는 어떻게 확인하나요?</summary>
          <p>접수번호 또는 본인 인증을 통해 공식 사이트의 조회 메뉴에서 처리상태를 확인할 수 있습니다.</p>
        </details>
      </div>
      ${paragraph(`정리하면 ${keyword}는 공식 사이트에서 대상 여부와 제출서류를 확인한 뒤 진행하는 것이 핵심입니다. 신청 완료 후에는 접수번호와 처리상태를 저장해 두고, 보완 요청이 있는지 주기적으로 확인하세요.`)}
      <!-- CONTENT END 1 -->
    `;
}

function makeTags(keyword) {
  const base = String(keyword).trim();
  return [
    base,
    `${base} 신청방법`,
    `${base} 필요서류`,
    `${base} 바로가기`,
    `${base} 조회`
  ];
}

async function makeDraft(input) {
  const keyword = String(input.keyword || "").trim();
  if (!keyword) throw new Error("키워드를 입력하세요.");
  const rawSlug = String(input.slug || "").trim();
  if (rawSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawSlug)) {
    throw new Error("영문 slug는 소문자, 숫자, 하이픈만 사용할 수 있습니다. 예: local-election-2026-polling-place");
  }
  const date = input.publishedAt || todayKorea();
  const baseSlug = await uniqueBaseSlug(stripKnownSuffix(slugify(rawSlug || suggestBaseSlug(keyword))));
  const plusSlug = `${baseSlug}-quick-guide`;
  const infoSlug = `${baseSlug}-guide`;
  const infoUrl = `${roots.info.domain}/posts/${infoSlug}/`;
  const officialUrl = String(input.officialUrl || "").trim() || "https://www.google.com/search?q=" + encodeURIComponent(keyword);
  const button1 = String(input.button1 || "바로 신청하기").trim();
  const button2 = String(input.button2 || "자세히 확인하기").trim();
  const category = String(input.category || "support");
  const plusTitle = String(input.plusTitle || `${keyword} 빠른 확인 바로가기`).trim();
  const infoTitle = String(input.infoTitle || `${keyword} 신청방법 필요서류 상세안내`).trim();
  const plusDescription = String(input.plusDescription || `${keyword}를 빠르게 확인할 수 있도록 대상, 신청 경로, 준비사항을 요약했습니다.`).trim();
  const infoDescription = String(input.infoDescription || `${keyword}의 신청 대상, 온라인 신청방법, 필요서류, FAQ를 표와 함께 자세히 정리했습니다.`).trim();

  return {
    plus: {
      slug: plusSlug,
      category,
      title: plusTitle,
      description: plusDescription,
      author: "Lsejin",
      publishedAt: date,
      modifiedAt: date,
      readingTime: "1분 미만",
      tags: makeTags(keyword),
      ctas: [
        { label: button1, url: infoUrl },
        { label: button2, url: infoUrl }
      ],
      html: buildPlusHtml({ keyword, infoTitle, button1, button2 })
    },
    info: {
      slug: infoSlug,
      category,
      title: infoTitle,
      description: infoDescription,
      author: "Lsejin",
      publishedAt: date,
      modifiedAt: date,
      readingTime: "3분",
      tags: makeTags(keyword),
      ctas: [
        { label: button1, url: officialUrl },
        { label: button2, url: officialUrl }
      ],
      html: buildInfoHtml({ keyword, officialUrl, button1, button2 })
    }
  };
}

function escapeTemplate(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${");
}

function jsString(value) {
  return JSON.stringify(value);
}

function articleToModuleBlock(article) {
  const tags = article.tags.map((tag) => `      ${jsString(tag)}`).join(",\n");
  const ctas = article.ctas
    .map((cta) => `      {\n        label: ${jsString(cta.label)},\n        url: ${jsString(cta.url)}\n      }`)
    .join(",\n");
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

async function importArticles(kind) {
  const fileUrl = pathToFileURL(roots[kind].articles);
  fileUrl.search = `v=${Date.now()}`;
  const module = await import(fileUrl.href);
  return module.articles;
}

async function appendArticle(kind, article) {
  const config = roots[kind];
  const existing = await importArticles(kind);
  if (existing.some((item) => item.slug === article.slug)) {
    throw new Error(`${kind} slug already exists: ${article.slug}`);
  }

  const source = await readFile(config.articles, "utf8");
  const insert = articleToModuleBlock(article);
  const trimmed = source.trimEnd();
  if (!trimmed.endsWith("];")) {
    throw new Error(`${kind} articles.mjs format is not supported.`);
  }
  const withoutEnd = trimmed.slice(0, -2);
  const separator = existing.length ? ",\n" : "\n";
  await writeFile(config.articles, `${withoutEnd}${separator}${insert}\n];\n`, "utf8");
}

function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("close", (code) => resolve({ code, output }));
  });
}

async function build(kind) {
  const config = roots[kind];
  const command = existsSync(nodeBin) ? nodeBin : "node";
  return runCommand(command, ["scripts/build.mjs"], config.root);
}

async function deploy(kind) {
  const config = roots[kind];
  const command = existsSync(nodeBin) ? nodeBin : "node";
  return runCommand(command, [wranglerBin, "pages", "deploy", "dist", "--project-name", config.project], config.root);
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "GET" && pathname === "/api/articles") {
      const [plus, info] = await Promise.all([importArticles("plus"), importArticles("info")]);
      return sendJson(res, 200, {
        plus: plus.map(({ slug, title, description, publishedAt, ctas }) => ({ slug, title, description, publishedAt, ctas })),
        info: info.map(({ slug, title, description, publishedAt, ctas }) => ({ slug, title, description, publishedAt, ctas }))
      });
    }

    if (req.method === "POST" && pathname === "/api/draft") {
      return sendJson(res, 200, await makeDraft(await readBody(req)));
    }

    if (req.method === "POST" && pathname === "/api/suggest-slug") {
      const body = await readBody(req);
      const keyword = String(body.keyword || "").trim();
      if (!keyword) return sendJson(res, 200, { slug: "" });
      const baseSlug = await uniqueBaseSlug(stripKnownSuffix(suggestBaseSlug(keyword)));
      return sendJson(res, 200, {
        slug: baseSlug,
        plusSlug: `${baseSlug}-quick-guide`,
        infoSlug: `${baseSlug}-guide`
      });
    }

    if (req.method === "POST" && pathname === "/api/publish") {
      const draft = await readBody(req);
      if (!draft.plus || !draft.info) throw new Error("초안 데이터가 없습니다.");
      await appendArticle("plus", draft.plus);
      await appendArticle("info", draft.info);
      return sendJson(res, 200, {
        ok: true,
        plusUrl: `${roots.plus.domain}/posts/${draft.plus.slug}/`,
        infoUrl: `${roots.info.domain}/posts/${draft.info.slug}/`
      });
    }

    if (req.method === "POST" && pathname === "/api/build") {
      const [plus, info] = await Promise.all([build("plus"), build("info")]);
      return sendJson(res, plus.code || info.code ? 500 : 200, { plus, info });
    }

    if (req.method === "POST" && pathname === "/api/deploy") {
      const [plus, info] = await Promise.all([deploy("plus"), deploy("info")]);
      return sendJson(res, plus.code || info.code ? 500 : 200, { plus, info });
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}

async function handleStatic(req, res, pathname) {
  const path = pathname === "/" ? "/index.html" : pathname;
  const fullPath = join(adminRoot, "public", path);
  if (!fullPath.startsWith(join(adminRoot, "public"))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(fullPath);
    res.writeHead(200, { "content-type": mimeTypes[extname(fullPath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url.pathname);
    return;
  }
  await handleStatic(req, res, url.pathname);
}).listen(port, () => {
  console.log(`Liferoom admin UI running at http://localhost:${port}`);
});
