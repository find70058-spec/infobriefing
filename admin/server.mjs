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

await loadEnvFile();

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

async function loadEnvFile() {
  const envPath = join(workspaceRoot, ".env");
  if (!existsSync(envPath)) return;
  const content = await readFile(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

function hasOpenAiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

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

function detectContentType(keyword, category) {
  const text = `${keyword} ${category}`.toLowerCase();
  if (["travel"].includes(String(category || "").toLowerCase())) {
    return "reservation";
  }
  if (/(예매|예약|승차권|버스|공항|시간표|터미널|정류장|교통|요금|가격|위치|휴양림|숙소|입장권)/.test(text)) {
    return "reservation";
  }
  return "application";
}

function buildReservationPlusHtml({ keyword, button1, button2 }) {
  return `
      <p><!--no toc--></p>
      ${paragraph(`${keyword}를 확인할 때는 일정, 위치, 요금, 예약 가능 여부를 먼저 보는 것이 좋습니다. 아래 안내에서는 빠르게 이동할 수 있도록 핵심 확인사항만 먼저 정리했습니다.`)}
      ${heading(0, `${keyword} 일정과 위치 확인`)}
      ${paragraph(`${keyword}는 이용일, 출발지, 도착지, 운영 시간에 따라 선택해야 할 항목이 달라질 수 있습니다. 방문 또는 탑승 전에 공식 안내에서 최신 시간표와 이용 가능 여부를 확인하세요.`)}
      ${heading(1, `${button1} 전 확인할 항목`)}
      ${paragraph(`${button1} 또는 ${button2}를 누르기 전에는 이용 날짜, 인원, 출발 장소, 도착 장소, 결제 또는 발권 방식을 미리 확인해 두면 현장에서 시간을 줄일 수 있습니다.`)}
      <!-- CONTENT END 1 -->
    `;
}

function buildPlusHtml({ keyword, button1, button2, contentType }) {
  if (contentType === "reservation") {
    return buildReservationPlusHtml({ keyword, button1, button2 });
  }
  return `
      <p><!--no toc--></p>
      ${paragraph(`${keyword}를 빠르게 확인하려는 분들을 위해 신청 대상, 확인 경로, 준비해야 할 내용을 핵심만 정리했습니다. 자세한 표와 FAQ는 아래 안내 페이지에서 이어서 확인할 수 있습니다.`)}
      ${heading(0, `${keyword} 바로 확인`)}
      ${paragraph(`${keyword}는 공식 안내 페이지에서 최신 기준을 확인하는 것이 가장 중요합니다. 신청 기간, 대상 조건, 제출서류, 조회 경로는 시기별로 달라질 수 있으므로 먼저 본인에게 해당되는 항목을 확인한 뒤 진행하는 것이 좋습니다.`)}
      ${heading(1, `${button1} 전 확인사항`)}
      ${paragraph(`${button1} 또는 ${button2}를 진행하기 전에는 본인 인증 수단, 신청자 정보, 제출 대상 서류를 미리 준비해 두면 처리 시간을 줄일 수 있습니다. 모바일보다 PC에서 더 안정적으로 처리되는 민원도 있으니 오류가 반복되면 PC 환경을 함께 확인하세요.`)}
      <!-- CONTENT END 1 -->
    `;
}

function buildReservationInfoHtml({ keyword, officialUrl, button1, button2 }) {
  return `
      <p><!--no toc--></p>
      ${paragraph(`${keyword}를 이용하려면 공식 안내에서 운영 시간과 예약 가능 여부를 먼저 확인해야 합니다. 이 글에서는 일정 확인, 예약 절차, 현장 준비사항을 표와 FAQ로 정리했습니다.`)}
      ${heading(0, `${keyword} 시간표와 이용정보 확인`)}
      ${paragraph(`예약형 서비스는 이용일과 장소에 따라 가능한 시간, 요금, 잔여 좌석 또는 잔여 수량이 달라질 수 있습니다. 검색 결과 요약만 보고 판단하기보다 공식 페이지의 최신 안내와 예매 화면을 함께 확인하세요.`)}
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
            <td>이용일</td>
            <td>방문일 또는 탑승일 기준으로 예약 가능 시간을 확인합니다.</td>
            <td>주말, 공휴일, 성수기에는 조기 마감될 수 있습니다.</td>
          </tr>
          <tr>
            <td>장소</td>
            <td>출발지, 도착지, 방문 위치, 매표 위치를 구분해 확인합니다.</td>
            <td>비슷한 이름의 정류장이나 시설을 잘못 선택하지 않도록 주의하세요.</td>
          </tr>
          <tr>
            <td>요금</td>
            <td>성인, 청소년, 어린이, 우대 요금과 결제 방식을 확인합니다.</td>
            <td>현장 결제와 온라인 결제 조건이 다를 수 있습니다.</td>
          </tr>
          <tr>
            <td>공식 링크</td>
            <td><a href="${escapeHtml(officialUrl)}" rel="noopener">${escapeHtml(button1)}</a> 또는 <a href="${escapeHtml(officialUrl)}" rel="noopener">${escapeHtml(button2)}</a> 메뉴를 이용합니다.</td>
            <td>예매 가능 여부는 공식 사이트의 조회 결과를 기준으로 확인하세요.</td>
          </tr>
        </tbody>
      </table>
      ${heading(1, `${keyword} 예약 방법`)}
      ${paragraph(`공식 사이트나 앱에 접속한 뒤 이용일, 출발지 또는 이용 장소, 인원, 시간대를 차례로 선택합니다. 결제 전에는 날짜와 장소가 맞는지 다시 확인하고, 결제 완료 후 예매내역이나 모바일 티켓을 저장해 두세요.`)}
      <ol style="margin: 16px 0 24px 20px; line-height: 1.9; color: #333;">
        <li>공식 사이트에서 시간표 또는 예약 메뉴로 이동합니다.</li>
        <li>이용 날짜와 출발지, 도착지 또는 방문 위치를 선택합니다.</li>
        <li>인원과 시간대를 고르고 잔여 좌석 또는 잔여 수량을 확인합니다.</li>
        <li>요금과 취소 조건을 확인한 뒤 결제를 진행합니다.</li>
        <li>예매 완료 화면, 예약번호, 모바일 티켓을 저장합니다.</li>
      </ol>
      ${heading(2, `${keyword} 이용 전 준비사항`)}
      ${paragraph(`예약 후에는 현장에서 바로 확인할 수 있도록 예매내역을 준비해 두는 것이 좋습니다. 교통 상황이나 현장 혼잡이 생길 수 있으므로 안내된 시간보다 여유 있게 도착하세요.`)}
      <table class="info-table">
        <thead>
          <tr>
            <th>준비사항</th>
            <th>확인 내용</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>예약번호</td>
            <td>예매 조회, 취소, 변경 또는 현장 확인에 사용할 수 있습니다.</td>
          </tr>
          <tr>
            <td>모바일 티켓</td>
            <td>QR, 바코드, 예매내역 화면을 미리 열어둘 수 있게 준비합니다.</td>
          </tr>
          <tr>
            <td>이용 시간</td>
            <td>예약 시간보다 여유 있게 도착해 탑승 또는 입장 절차를 진행합니다.</td>
          </tr>
          <tr>
            <td>취소 조건</td>
            <td>변경 가능 시간과 취소 수수료가 있는지 결제 전 확인합니다.</td>
          </tr>
        </tbody>
      </table>
      ${heading(3, `${keyword} FAQ`)}
      <div class="faq-list">
        <details>
          <summary>${keyword}는 미리 예약해야 하나요?</summary>
          <p>이용 시간과 잔여 좌석 또는 잔여 수량이 정해진 서비스라면 미리 예약하는 편이 안전합니다.</p>
        </details>
        <details>
          <summary>모바일로도 예매 확인이 가능한가요?</summary>
          <p>대부분 모바일 확인이 가능하지만, 현장 발권이나 별도 확인이 필요한 경우가 있으므로 예매내역의 안내를 확인하세요.</p>
        </details>
        <details>
          <summary>예약 후 변경이나 취소가 가능한가요?</summary>
          <p>예매처와 상품 조건에 따라 다릅니다. 결제 전 취소 수수료와 변경 가능 시간을 반드시 확인하는 것이 좋습니다.</p>
        </details>
        <details>
          <summary>최신 시간표는 어디서 확인하나요?</summary>
          <p>공식 사이트의 시간표 또는 예약 조회 화면을 기준으로 확인하세요. 블로그 요약보다 공식 페이지의 실시간 정보가 우선입니다.</p>
        </details>
      </div>
      ${paragraph(`정리하면 ${keyword}는 일정과 장소를 먼저 확인하고, 공식 예약 화면에서 잔여 여부와 요금을 확인한 뒤 결제하는 순서로 진행하면 됩니다. 예약 후에는 예약번호와 모바일 티켓을 저장해 두세요.`)}
      <!-- CONTENT END 1 -->
    `;
}

function buildInfoHtml({ keyword, officialUrl, button1, button2, contentType }) {
  if (contentType === "reservation") {
    return buildReservationInfoHtml({ keyword, officialUrl, button1, button2 });
  }
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

function makeTags(keyword, contentType) {
  const base = String(keyword).trim();
  if (contentType === "reservation") {
    return [
      base,
      `${base} 예약`,
      `${base} 예매`,
      `${base} 시간표`,
      `${base} 위치`
    ];
  }
  return [
    base,
    `${base} 신청방법`,
    `${base} 필요서류`,
    `${base} 바로가기`,
    `${base} 조회`
  ];
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isFetchableSourceUrl(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.hostname.includes("google.");
  } catch {
    return false;
  }
}

async function fetchSourceText(url) {
  if (!isFetchableSourceUrl(url)) return "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 LiferoomAdmin/1.0"
      }
    });
    if (!response.ok) return "";
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("text/plain")) return "";
    const text = stripHtml(await response.text());
    return text.slice(0, 12000);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function outputTextFromResponse(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function aiDraftSchema() {
  const articleSchema = {
    type: "object",
    additionalProperties: false,
    required: ["title", "description", "tags", "html"],
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      tags: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: { type: "string" }
      },
      html: { type: "string" }
    }
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["plus", "info"],
    properties: {
      plus: articleSchema,
      info: articleSchema
    }
  };
}

function validateAiDraftShape(value) {
  if (!value?.plus?.title || !value?.info?.title || !value?.plus?.html || !value?.info?.html) {
    throw new Error("AI 초안 응답 형식이 올바르지 않습니다.");
  }
}

function addOrReplaceStyle(attrs, style) {
  const cleanAttrs = String(attrs || "").replace(/\sstyle=(["']).*?\1/i, "").trim();
  return `${cleanAttrs ? ` ${cleanAttrs}` : ""} style="${style}"`;
}

function normalizeArticleHtml(html) {
  return String(html || "")
    .replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (match, attrs, inner) => {
      const id = attrs.match(/\sid=(["'])(.*?)\1/i)?.[2] || `toc-0`;
      const text = stripHtml(inner);
      return heading(String(id).replace(/^toc-/, ""), text);
    })
    .replace(/<p(?![^>]*\bstyle=)([^>]*)>/gi, (match, attrs) => {
      return `<p${addOrReplaceStyle(attrs, "margin: 16px 0; line-height: 1.9; color: #333;")}>`;
    })
    .replace(/<ol(?![^>]*\bstyle=)([^>]*)>/gi, (match, attrs) => {
      return `<ol${addOrReplaceStyle(attrs, "margin: 16px 0 24px 20px; line-height: 1.9; color: #333;")}>`;
    })
    .replace(/<table(?![^>]*\bclass=)([^>]*)>/gi, "<table class=\"info-table\"$1>")
    .replace(/<table([^>]*)class=(["'])(?![^"']*\binfo-table\b)([^"']*)\2/gi, "<table$1class=$2$3 info-table$2")
    .replace(/<details(?![^>]*\bclass=)([^>]*)>/gi, "<details$1>");
}

async function generateAiDraft({ keyword, category, contentType, officialUrl, button1, button2, sourceText }) {
  if (!hasOpenAiKey()) return null;

  const model = process.env.OPENAI_MODEL || "gpt-5.5";
  const sourceNote = sourceText
    ? `공식 링크에서 수집한 참고자료:\n${sourceText}`
    : "공식 링크 본문을 가져오지 못했습니다. 확인되지 않은 세부 수치, 일정, 금액, 자격조건은 단정하지 마세요.";

  const prompt = `
키워드: ${keyword}
카테고리: ${category}
콘텐츠 유형: ${contentType}
B 블로그 공식 링크: ${officialUrl}
버튼 1: ${button1}
버튼 2: ${button2}

${sourceNote}

작성 규칙:
- 한국어로 작성합니다.
- A 블로그 plus는 1500자 이내의 짧은 전환 글입니다.
- B 블로그 info는 A보다 더 긴 상세 글이며 표 2개 이상, FAQ 4개를 포함합니다.
- 버튼 HTML은 만들지 마세요. 버튼은 시스템 템플릿이 별도로 삽입합니다.
- 광고 코드는 만들지 마세요. 광고는 시스템 템플릿이 별도로 삽입합니다.
- h2는 키워드가 들어간 구체적인 소제목으로 작성합니다.
- 본문 HTML은 p, h2, table.info-table, ol, details/summary만 사용합니다.
- h2 id는 toc-0부터 순서대로 사용합니다.
- 날짜, 금액, 자격조건, 운행정보, 링크 성격은 참고자료 또는 공식 링크에서 확인되는 범위에서만 단정합니다.
- 정보가 불확실하면 "탑승일 기준 공식 조회 화면에서 다시 확인"처럼 확인 행동으로 안내합니다.
- 예약/예매/버스/시간표 키워드에 신청대상, 필요서류, 민원, 보완요청 같은 행정 민원 문구를 섞지 마세요.
- 지원금/장학금/민원 키워드가 아닌 경우 신청서류형 템플릿을 쓰지 마세요.
- title은 검색 유입을 고려하되 과장하지 않습니다.
- description은 80자 안팎으로 작성합니다.
- tags는 5개 작성합니다.
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "liferoom_ab_draft",
          strict: true,
          schema: aiDraftSchema()
        }
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || "OpenAI 초안 생성에 실패했습니다.";
    throw new Error(message);
  }

  const raw = outputTextFromResponse(data);
  const parsed = JSON.parse(raw);
  validateAiDraftShape(parsed);
  parsed.plus.html = normalizeArticleHtml(parsed.plus.html);
  parsed.info.html = normalizeArticleHtml(parsed.info.html);
  return parsed;
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
  const category = String(input.category || "support");
  const contentType = detectContentType(keyword, category);
  const button1Default = contentType === "reservation" ? "예약 바로가기" : "바로 신청하기";
  const button2Default = contentType === "reservation" ? "시간표 확인" : "자세히 확인하기";
  const button1 = String(input.button1 || button1Default).trim();
  const button2 = String(input.button2 || button2Default).trim();
  const useAi = input.useAi === "on" || input.useAi === "true";
  const sourceText = useAi ? await fetchSourceText(officialUrl) : "";
  const aiDraft = useAi
    ? await generateAiDraft({ keyword, category, contentType, officialUrl, button1, button2, sourceText })
    : null;
  const plusTitleDefault = contentType === "reservation" ? `${keyword} 빠른 확인 바로가기` : `${keyword} 빠른 확인 바로가기`;
  const infoTitleDefault = contentType === "reservation" ? `${keyword} 예약방법 시간표 상세안내` : `${keyword} 신청방법 필요서류 상세안내`;
  const plusDescriptionDefault = contentType === "reservation"
    ? `${keyword}를 빠르게 확인할 수 있도록 시간표, 위치, 예약 전 준비사항을 요약했습니다.`
    : `${keyword}를 빠르게 확인할 수 있도록 대상, 신청 경로, 준비사항을 요약했습니다.`;
  const infoDescriptionDefault = contentType === "reservation"
    ? `${keyword}의 예약 방법, 시간표, 위치, 이용 전 준비사항, FAQ를 표와 함께 자세히 정리했습니다.`
    : `${keyword}의 신청 대상, 온라인 신청방법, 필요서류, FAQ를 표와 함께 자세히 정리했습니다.`;
  const plusTitle = String(input.plusTitle || aiDraft?.plus?.title || plusTitleDefault).trim();
  const infoTitle = String(input.infoTitle || aiDraft?.info?.title || infoTitleDefault).trim();
  const plusDescription = String(input.plusDescription || aiDraft?.plus?.description || plusDescriptionDefault).trim();
  const infoDescription = String(input.infoDescription || aiDraft?.info?.description || infoDescriptionDefault).trim();
  const plusTags = aiDraft?.plus?.tags?.length ? aiDraft.plus.tags : makeTags(keyword, contentType);
  const infoTags = aiDraft?.info?.tags?.length ? aiDraft.info.tags : makeTags(keyword, contentType);
  const plusHtml = aiDraft?.plus?.html || buildPlusHtml({ keyword, button1, button2, contentType });
  const infoHtml = aiDraft?.info?.html || buildInfoHtml({ keyword, officialUrl, button1, button2, contentType });

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
      tags: plusTags,
      ctas: [
        { label: button1, url: infoUrl },
        { label: button2, url: infoUrl }
      ],
      html: plusHtml
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
      tags: infoTags,
      ctas: [
        { label: button1, url: officialUrl },
        { label: button2, url: officialUrl }
      ],
      html: infoHtml
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

    if (req.method === "GET" && pathname === "/api/ai-status") {
      return sendJson(res, 200, {
        enabled: hasOpenAiKey(),
        model: process.env.OPENAI_MODEL || "gpt-5.5"
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

    if (req.method === "POST" && pathname === "/api/publish-deploy") {
      const draft = await readBody(req);
      if (!draft.plus || !draft.info) throw new Error("초안 데이터가 없습니다.");
      await appendArticle("plus", draft.plus);
      await appendArticle("info", draft.info);
      const buildResult = {
        plus: await build("plus"),
        info: await build("info")
      };
      if (buildResult.plus.code || buildResult.info.code) {
        return sendJson(res, 500, {
          error: "글은 추가됐지만 빌드에 실패했습니다.",
          plusUrl: `${roots.plus.domain}/posts/${draft.plus.slug}/`,
          infoUrl: `${roots.info.domain}/posts/${draft.info.slug}/`,
          build: buildResult
        });
      }
      const deployResult = {
        plus: await deploy("plus"),
        info: await deploy("info")
      };
      if (deployResult.plus.code || deployResult.info.code) {
        return sendJson(res, 500, {
          error: "글과 빌드는 완료됐지만 배포에 실패했습니다.",
          plusUrl: `${roots.plus.domain}/posts/${draft.plus.slug}/`,
          infoUrl: `${roots.info.domain}/posts/${draft.info.slug}/`,
          build: buildResult,
          deploy: deployResult
        });
      }
      return sendJson(res, 200, {
        ok: true,
        plusUrl: `${roots.plus.domain}/posts/${draft.plus.slug}/`,
        infoUrl: `${roots.info.domain}/posts/${draft.info.slug}/`,
        build: buildResult,
        deploy: deployResult
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
