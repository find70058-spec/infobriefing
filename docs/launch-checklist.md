# 정보브리핑 런칭 체크리스트

## 완료

- Cloudflare Pages 프로젝트 생성: `infobriefing`
- 운영 도메인 연결: `https://briefing.jiwon24.co.kr`
- HTTPS 인증서 활성화
- `sitemap.xml` 생성
- `robots.txt` 생성
- 민원 안내 글 32개 배포
- Article, FAQ, WebSite 구조화 데이터 적용

## 검색엔진 등록

### Google Search Console

1. `https://search.google.com/search-console` 접속
2. URL prefix 방식으로 `https://briefing.jiwon24.co.kr` 등록
3. HTML meta tag 방식의 verification code를 발급
4. `src/site.config.mjs` 또는 빌드 템플릿에 verification meta 추가
5. 배포 후 `https://briefing.jiwon24.co.kr/sitemap.xml` 제출

### Naver Search Advisor

1. `https://searchadvisor.naver.com` 접속
2. 사이트 `https://briefing.jiwon24.co.kr` 등록
3. HTML meta tag 방식의 소유확인 코드 발급
4. verification meta 추가 후 배포
5. `https://briefing.jiwon24.co.kr/sitemap.xml` 제출
6. `robots.txt` 수집 요청

## 애드센스 신청 전 확인

- 실제 publisher ID로 `public/ads.txt` 교체
- 문의 이메일을 `/contact/` 페이지에 반영
- 개인정보처리방침에 광고 쿠키 문구 보강
- 깨진 링크 없는지 확인
- 빈 카테고리 없는지 확인
- 모바일 화면 확인

## 현재 주의사항

- Cloudflare GitHub 자동연동은 대시보드 UI가 반복적으로 GitHub 연결 화면에 머물러 Wrangler 직접 배포로 우회했습니다.
- 사이트 자체는 운영 도메인에서 정상 응답합니다.
