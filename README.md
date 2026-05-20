# 정보브리핑 Cloudflare Pages 사이트

정부 민원 안내 콘텐츠를 검색 유입과 애드센스 승인에 맞게 구성한 정적 사이트입니다.

현재 포함된 주요 구성:

- 민원 안내 상세 글 32개
- 카테고리 5개
- 검색 페이지
- 소개, 문의, 개인정보처리방침, 이용약관, 면책고지
- `sitemap.xml`, `robots.txt`, `ads.txt`
- Article, FAQ, WebSite 구조화 데이터

## 배포 설정

- Build command: `node scripts/build.mjs`
- Build output directory: `dist`
- Framework preset: `None`

Wrangler CLI로 배포할 경우:

```bash
npx wrangler pages deploy dist
```

## 도메인 연결 전 수정할 곳

`src/site.config.mjs`에서 아래 값을 실제 하위도메인으로 바꾸세요.

```js
siteUrl: "https://info.example.com"
```

애드센스 승인 계정의 publisher id가 나오면 `src/site.config.mjs`의 `adsensePublisherId`와 `public/ads.txt`를 같이 수정하세요.

## 콘텐츠 추가

`src/content/articles.mjs`에 article 객체를 추가하면 상세 페이지, 카테고리 페이지, 홈, 사이트맵에 자동 반영됩니다.
