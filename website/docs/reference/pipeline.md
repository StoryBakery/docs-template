---
title: 생성 / 정리 / 빌드
sidebar_label: Pipeline
---

# 생성 / 정리 / 빌드

이 문서는 **reference 파이프라인의 실제 동작**을 단계별로 정리합니다. “어떤 파일이 언제 생성되고, 어디에 기록되며, 어떤 정리 규칙이 적용되는지”를 명확히 설명합니다.

## 1) 표준 파이프라인 흐름

```
luau-docgen (JSON 생성)
  -> docusaurus-plugin-reference (JSON -> MDX)
  -> Docusaurus build
```

### 표준 경로
- JSON 출력: `website/.generated/reference/<lang>.json`
- MDX 출력: `website/docs/reference/<lang>/`
- manifest: `website/.generated/reference/manifest.json`

## 2) 입력 설정 로딩 순서

### 설정 소스 우선순위
1. **CLI 옵션** (`bakerywave reference build` 플래그)
2. **bakerywave.toml** (`[reference]`, `[reference.languages.<lang>]`)
3. **docusaurus.config.* (preset.reference)**

> `reference.languages.<lang>`는 최종 병합에서 **해당 언어 옵션을 덮어씁니다**.

## 3) JSON 생성 (luau-docgen)

### 실행 방식
1. **네이티브 바이너리 우선**
   - `process.execPath`와 같은 디렉터리에 `luau-docgen(.exe)`가 있으면 우선 실행
2. **Node 스크립트 폴백**
   - `@storybakery/luau-docgen/bin/luau-docgen.js`

### 기본 인자
- `--root <rootDir>`
- `--src <srcDir>`
- `--out <outputJson>`
- (선택) `--types <typesDir>`
- (선택) `--fail-on-warning`
- (Node 스크립트만) `--legacy`

### 기본값
- `rootDir`
  - siteDir이 `website`면 상위 디렉터리
  - 아니면 `cwd`
- `srcDir`: 기본 `src`
- `typesDir`: 기본 `null`
- `lang`: 기본 `luau`

## 4) JSON → MDX 변환

### 기본 모드
- `renderMode = "mdx"`가 표준 모드
- `renderMode !== "mdx"`이면 **생성 스킵**으로 처리됩니다

### MDX 출력 규칙
- Overview: `reference/<lang>/index.mdx`
- Class: `reference/<lang>/classes/<categoryPath>/<ClassName>.mdx`
- `categoryPath`는 `@category`에서 생성됨

## 5) 정리(clean) 규칙

### manifest 기반 정리
- `manifest.outputs[<lang>]`에 이전 생성 파일 목록을 저장
- 빌드 시 새 목록과 비교해 **없는 파일은 삭제**
- 삭제 후 **빈 폴더는 자동 제거**

### manifest 입력 정보
- `manifest.inputs[<lang>]`에 다음 정보를 기록합니다.
  - `path`: 사용한 JSON 입력 경로
  - `hash`: 입력 JSON의 SHA1
  - `generatorVersion`: 생성기 버전 (가능한 경우)
  - `generatedAt`: ISO 타임스탬프

### clean 비활성화
- `--no-clean` 또는 `reference.clean = false`로 정리 비활성화 가능

## 6) i18n 복제

### 기본 정책
- `i18n.reference.copy = true`일 때만 동작
- `referenceLocales`가 비어 있으면 `locales - defaultLocale`로 계산

### 복제 위치
- `website/i18n/<locale>/docusaurus-plugin-content-docs/current/reference/<lang>`

### 동작 방식
- 기존 폴더는 삭제 후 복사
- 내용은 원문과 동일(번역 없음)

## 7) 코드 블록 탭 크기 적용

### 설정
- `reference.codeTabSize`가 설정되면 적용

### 적용 방식
- `website/src/css/custom.css`에 CSS 블록 삽입
- 마커:
  - `/* sb-ref-tab-size-start */`
  - `/* sb-ref-tab-size-end */`

## 8) 참고: 경로 및 파일 생성 여부

- `manifest.json`은 항상 업데이트됨
- `outDir` 내 파일은 **현재 생성 결과만 유지**
- `renderMode=mdx`가 아니면 실제 파일은 생성되지 않음

