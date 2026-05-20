export const site = {
  name: "정보브리핑",
  tagline: "정부 민원서류와 생활 행정 절차를 쉽게 정리합니다.",
  description:
    "여권발급, 인감증명서, 소득금액증명원, 주민등록등본 등 자주 찾는 정부 민원 정보를 준비물, 수수료, 신청방법 중심으로 안내합니다.",
  siteUrl: "https://info.example.com",
  defaultImage: "/assets/og-default.svg",
  adsensePublisherId: "pub-0000000000000000",
  nav: [
    { label: "민원서류", href: "/category/documents/" },
    { label: "여권·출입국", href: "/category/passport/" },
    { label: "세금·소득", href: "/category/tax-income/" },
    { label: "건강·보험", href: "/category/health-insurance/" },
    { label: "생활가이드", href: "/category/life-guide/" }
  ]
};

export const categories = {
  documents: {
    name: "민원서류",
    description: "주민센터, 정부24, 무인민원발급기에서 자주 발급하는 기본 서류를 정리했습니다."
  },
  passport: {
    name: "여권·출입국",
    description: "여권 신규 발급, 재발급, 미성년자 여권 등 출국 전 필요한 절차를 안내합니다."
  },
  "tax-income": {
    name: "세금·소득",
    description: "소득, 납세, 사업자 관련 증명서 발급 절차를 한눈에 볼 수 있습니다."
  },
  "health-insurance": {
    name: "건강·보험",
    description: "건강보험과 국민연금 관련 증명서 발급 방법을 정리합니다."
  },
  "life-guide": {
    name: "생활가이드",
    description: "온라인 발급, 대리발급, 무인민원발급기처럼 여러 민원에 공통으로 필요한 정보를 다룹니다."
  }
};
