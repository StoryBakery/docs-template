---
title: 테스트 픽스처
sidebar_label: 픽스처
---

# 테스트 픽스처

테스트는 `tests/luau-module-project`를 기준으로 수행합니다.

## 구조
- `tests/luau-module-project/src/`: Luau 소스
- `tests/luau-module-project/website/`: Docusaurus 사이트
- `tests/luau-module-project/bakerywave.toml`: bakerywave 설정

## 의도
- 실제 프로젝트와 유사한 구조를 유지합니다.
- 문서 생성 및 렌더링을 끝까지 통과시키는 통합 테스트 역할을 합니다.

## 기본 커맨드
```
# reference 생성
npm --prefix tests/luau-module-project/website run reference:build

# dev 서버 실행
npm --prefix tests/luau-module-project/website run dev

# 정적 빌드
npm --prefix tests/luau-module-project/website run build
```

## 변경 시 주의
- src 파일을 수정했으면 reference 재생성을 먼저 수행합니다.
- reference 생성 폴더(`website/docs/reference/`)는 직접 수정하지 않습니다.
