---
title: 테스트 가이드
sidebar_label: 테스트
---

# 테스트 가이드

이 문서는 StoryBakery 문서 시스템의 **로컬 테스트 / CI 테스트** 절차를 정리합니다.

## 빠른 시작 (로컬)
```
# 레포 루트 의존성 설치
npm install

# 테스트 사이트 의존성 설치
npm --prefix tests/luau-module-project/website install

# reference 생성
npm --prefix tests/luau-module-project/website run reference:build

# dev 서버 실행
npm --prefix tests/luau-module-project/website run dev
```

## 테스트 범위
- 문서 추출: Luau doc comment -> JSON
- 변환: JSON -> MDX
- 렌더링: Docusaurus 빌드/개발 서버
- 진단: 링크/태그/파라미터 경고

## CI에서 권장 순서
```
# 1) reference 생성
npm --prefix tests/luau-module-project/website run reference:build

# 2) 문서 빌드
npm --prefix tests/luau-module-project/website run build
```

## 추가 문서
- 테스트 시나리오: ./scenarios
- 테스트 픽스처 설명: ./fixture
