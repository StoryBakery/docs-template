---
title: 개발 가이드
sidebar_label: 개발
---

# 개발 가이드

이 문서는 StoryBakery 문서 시스템을 **로컬에서 개발/테스트**하는 절차를 정리합니다.

## 요구 사항
- Node.js (Docusaurus/bakerywave 실행)
- Rust (luau-docgen 네이티브 빌드)
- CMake + C/C++ 툴체인 (Luau 소스 빌드)

## 레포 구조 요약
- `packages/luau-docgen/`: Luau 추출기(네이티브 + JS 래퍼)
- `packages/bakerywave/`: 단일 CLI
- `packages/docusaurus-plugin-reference/`: JSON -> MDX 변환
- `tests/luau-module-project/website/`: 테스트 문서 사이트

## 로컬 실행 (가장 빠른 루트)
아래는 **현재 레포 기준** 가장 빠른 테스트 순서입니다.

```
# 1) 레포 루트 의존성 설치
npm install

# 2) 테스트 사이트 의존성 설치
npm --prefix tests/luau-module-project/website install

# 3) reference 생성
npm --prefix tests/luau-module-project/website run reference:build

# 4) dev 서버 실행
npm --prefix tests/luau-module-project/website run dev
```

## Luau 네이티브 빌드 (필수 단계)
`reference:build`가 실제 추출기를 사용하므로 **네이티브 빌드가 필요**합니다.

```
# 네이티브 빌드 (릴리즈)
cd packages/luau-docgen/native
cargo build --release
```

### 런타임 DLL 복사 (Windows 계열)
Windows에서 GNU 툴체인을 쓰는 경우, 런타임 DLL을 함께 복사해야 실행됩니다.

```
# CMD 기준
set LUAU_DOCGEN_RUNTIME_DIR=C:\path\to\runtime\bin
npm --prefix packages/luau-docgen run native:bin
```

```
# PowerShell 기준
$env:LUAU_DOCGEN_RUNTIME_DIR = "C:\path\to\runtime\bin"
npm --prefix packages/luau-docgen run native:bin
```

- `LUAU_DOCGEN_RUNTIME_DIR`는 **시스템마다 다를 수 있으므로** 고정값을 문서에 박지 않습니다.
- 복사 대상 DLL이 누락되면 경고가 출력됩니다.

## reference 생성(단일 커맨드)
`bakerywave`는 docgen(JSON) + JSON->MDX를 함께 실행합니다.

```
npm --prefix tests/luau-module-project/website run reference:build
```

기본 동작:
- 입력: `tests/luau-module-project/src/**/*.luau`
- 출력 JSON: `tests/luau-module-project/website/.generated/reference/luau.json`
- 출력 MDX: `tests/luau-module-project/website/docs/reference/luau/`

## dev 모드
```
npm --prefix tests/luau-module-project/website run dev
```

- `bakerywave dev`는 Docusaurus `start`를 호출합니다.
- 필요 시 Docusaurus 옵션은 `--` 뒤로 전달합니다.

```
bakerywave dev -- --port 4000
```

### 자동 재시작(플러그인/설정 변경)
`bakerywave dev`는 기본적으로 **플러그인/프리셋/테마/CLI/설정 변경을 감지하면 Docusaurus를 자동 재시작**합니다.

- 감지 대상(기본값):
  - `packages/docs-preset`
  - `packages/docs-theme`
  - `packages/docusaurus-plugin-reference`
  - `packages/bakerywave`
  - `packages/luau-docgen`
  - `docusaurus.config.*`
  - `bakerywave.toml`

자동 재시작을 끄려면:
```
bakerywave dev --no-restart
```

## watch / 자동 갱신 (reference)
소스 변경 시 reference를 자동 갱신하려면 watch 모드를 사용합니다.

```
# reference watch
bakerywave reference watch --site-dir tests/luau-module-project/website

# 별도 터미널에서 dev 서버
npm --prefix tests/luau-module-project/website run dev
```

## CLI 개발 중 자동 재실행(권장)
CLI 자체를 수정 중이라면, **외부 watcher로 bakerywave를 자동 재시작**하는 구성이 가장 안정적입니다.

### nodemon 예시
```
nodemon packages/bakerywave/bin/bakerywave.js -- dev --site-dir tests/luau-module-project/website
```

### tsx watch / node --watch 대안
```
node --watch packages/bakerywave/bin/bakerywave.js -- dev --site-dir tests/luau-module-project/website
```

## 트러블슈팅
- `@param does not match function parameters` 경고가 나오면, 함수 시그니처와 주석 파라미터 이름이 일치하는지 확인합니다.
- `bakerywave`가 실행되지 않으면, `npm --prefix tests/luau-module-project/website install`이 완료됐는지 확인합니다.
- 네이티브 실행 오류가 나면 `native:bin` 단계에서 DLL 복사 로그를 확인합니다.

## reference 파이프라인 요약
- 입력: `src/**/*.luau` + 선택적 `types/**/*.d.luau`
- 출력 JSON: `website/.generated/reference/<lang>.json`
- 표준 렌더링: JSON -> MDX (reference 플러그인)

## 문서 작성 규칙
- [문서 스타일 가이드](./style.md)
