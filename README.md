# 정보브리핑 Cloudflare Pages 사이트

정부 민원 안내 콘텐츠를 검색 유입과 애드센스 승인에 맞게 구성한 정적 사이트입니다.

## 운영 주소

- Production: https://briefing.jiwon24.co.kr
- Cloudflare Pages: https://infobriefing.pages.dev
- Sitemap: https://briefing.jiwon24.co.kr/sitemap.xml
- Robots: https://briefing.jiwon24.co.kr/robots.txt

## 현재 구성

- 민원 안내 상세 글 32개
- 카테고리 5개
- 검색 페이지
- 소개, 문의, 개인정보처리방침, 이용약관, 면책고지
- `sitemap.xml`, `robots.txt`, `ads.txt`
- Article, FAQ, WebSite 구조화 데이터

## Cloudflare Pages 설정

- Project name: `infobriefing`
- Build command: `node scripts/build.mjs`
- Build output directory: `dist`
- Framework preset: `None`
- Production branch: `main`

## 배포

현재 Cloudflare 대시보드의 GitHub 연결 UI가 불안정해 Wrangler로 직접 배포했습니다.

```bash
node scripts/build.mjs
wrangler pages deploy dist --project-name infobriefing --branch main
```

## 도메인

`src/site.config.mjs`의 `siteUrl`은 현재 운영 도메인으로 설정되어 있습니다.

```js
siteUrl: "https://briefing.jiwon24.co.kr"
```

## 애드센스

`public/ads.txt`에는 현재 애드센스 publisher ID가 반영되어 있습니다.

```txt
pub-8637673382238209
```

광고 슬롯이나 publisher ID가 바뀌면 `scripts/build.mjs`와 `public/ads.txt`를 함께 수정한 뒤 다시 빌드/배포하세요.

## 콘텐츠 추가

`src/content/articles.more.mjs`에 article 객체를 추가하면 상세 페이지, 카테고리 페이지, 홈, 검색 데이터, 사이트맵에 자동 반영됩니다.
