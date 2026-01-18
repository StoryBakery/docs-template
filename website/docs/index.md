---
title: 문서 템플릿 사용법
sidebar_label: 사용법
---

# 문서 템플릿 사용법

이 사이트는 StoryBakery 조직 공통 문서 템플릿을 사용하는 방법을 안내합니다.
상세한 정책은 `USAGE.md`를 기준으로 합니다.

## 빠른 시작
1. 프로젝트 레포에 `website/` 디렉터리를 만든다.
2. `@storybakery/docs-preset`을 설치한다.
3. `docusaurus.config.ts`에 preset 옵션을 지정한다.
4. reference 문서를 사용한다면 `docs/reference/`에 생성 결과를 준비한다.

## 기본 구조
```
website/
  docs/              # 사람이 작성하는 문서
    reference/       # 생성된 MD/MDX 문서
  .generated/        # 생성 산출물
  src/
    pages/           # 커스텀 페이지
  static/
    assets/          # 정적 자산
```

## Reference 표준 흐름
- reference 문서: `website/docs/reference/`
- 빌드 순서: `reference 문서 준비 -> Docusaurus 빌드`

## 커스텀 레벨 요약
- Level 0: preset 옵션 수정
- Level 1: 공통 MDX 컴포넌트 사용
- Level 2: `website/src/pages`, `website/src/css/custom.css`, 로컬 플러그인, `clientModules`
- Level 3: `website/src/theme/*` swizzle (승인 필요)

## 참고
- `website/.generated`는 Git 추적하지 않는다.
- `reference`는 생성 문서이므로 수동 편집하지 않는다.
- 템플릿 검증은 `tests/luau-module-project/website`에서 수행한다.
