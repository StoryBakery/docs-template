---
title: bakerywave CLI
sidebar_label: CLI
---

# bakerywave CLI

이 문서는 **현재 구현된 CLI의 명령/옵션/동작 원리**를 전부 정리합니다. 실제 코드 동작 기준으로 작성되어 있습니다.

## 1) 기본 사용 형식

```
bakerywave <command> [siteDir] [-- ...docusaurus-args]
```

### 전역 옵션
- `--cwd <dir>`: 기준 작업 디렉터리
- `--site-dir <dir>`: 사이트 디렉터리
  - 기본값: **현재 디렉터리에 docusaurus.config.*가 있으면 `.`**, 아니면 `website`
- `--config <path>`: Docusaurus 설정 파일 경로
  - reference 옵션/ i18n 옵션 로딩 시 **해당 경로를 우선 사용**
- `--no-restart`: dev 모드 자동 재시작 비활성화

## 2) Docusaurus 표준 명령

아래 명령은 **Docusaurus CLI를 그대로 호출**합니다.

- `start`
- `build`
- `serve`
- `clear`
- `swizzle`
- `deploy`
- `write-translations`
- `write-heading-ids`

### 별칭
- `preview` → `serve`

### Docusaurus 옵션 전달
- `--` 이후 옵션은 그대로 Docusaurus에 전달됩니다.

예:
```
bakerywave start -- --host 0.0.0.0 --port 4000
```

### 실행 방식
1. 기본: `npm exec docusaurus -- <command>`
2. 실패 시: `node @docusaurus/core/bin/docusaurus.mjs <command>`

## 3) init (스캐폴딩)

### 명령
```
bakerywave init [dir] [options]
```

### 동작
- 내부적으로 `npm create @storybakery/docs`를 실행합니다.
- `dir`가 있으면 해당 경로에 생성합니다.
- 추가 옵션은 `--` 없이 그대로 전달됩니다.

### 지원 옵션(패스스루)
- `--dir <dir>`: 생성 경로 지정
- `--template <path>`: 템플릿 경로 지정
- `--no-install` / `--skip-install`: 설치 생략
- `--package-manager <pm>`: `npm | pnpm | yarn | bun`
- `--force`: 비어있지 않은 디렉터리 허용

## 4) dev 명령 (reference watch + auto restart)

### 명령
```
bakerywave dev --site-dir <dir>
```

### 동작 구성
- 내부적으로 다음을 동시에 실행합니다.
  1. `bakerywave reference watch`
  2. `docusaurus start`

### 자동 재시작
- 기본값: **활성화**
- `--no-restart`로 비활성화 가능
- 감시 대상:
  - `packages/docs-preset`
  - `packages/docs-theme`
  - `packages/docusaurus-plugin-reference`
  - `packages/bakerywave`
  - `packages/luau-docgen`
  - `docusaurus.config.*`
  - `bakerywave.toml`

## 5) reference build

### 명령
```
bakerywave reference build [options]
```

### 지원 옵션
- `--lang <lang>`: 언어 식별자
- `--root <dir>`: docgen root
- `--src <dir>`: 소스 디렉터리
- `--types <dir>`: 타입 디렉터리
- `--input <path>`: JSON 출력 경로
- `--out-dir <dir>`: MDX 출력 경로
- `--manifest <path>`: manifest 경로
- `--include-private`: private 심볼 포함
- `--no-clean`: stale 파일 정리 비활성화
- `--render-mode <mdx|json>`: 렌더 모드
- `--no-reference`: 주석 기반 reference 추출 비활성화
- `--fail-on-warning`: 경고를 실패로 처리
- `--legacy`: Node docgen 실행 시 legacy 모드

### 실제 동작
1. **luau-docgen 실행**
2. JSON → MDX 변환
3. manifest 갱신 + stale 파일 정리
4. i18n 복제(설정 시)

> `renderMode`가 `mdx`가 아니면 **생성 스킵**으로 처리됩니다.

## 6) reference watch

### 명령
```
bakerywave reference watch [options]
```

### 감시 대상
- `<rootDir>/<srcDir>`
- `<rootDir>/<typesDir>` (설정된 경우)

### 동작 방식
- 파일 변경 시 `reference build`와 동일한 플로우를 수행
- 실행 중 추가 변경이 들어오면 **1회 대기 후 재실행**

## 7) 설정 탐색 규칙

### bakerywave.toml
- 탐색 위치:
  1. `<siteDir>/bakerywave.toml`
  2. `<projectRoot>/bakerywave.toml`

### projectRoot 결정
- siteDir이 `website`면 상위 디렉터리
- 그 외는 현재 작업 디렉터리

## 8) 예시

### 기본 개발 실행
```
bakerywave dev --site-dir tests/luau-module-project/website
```

### reference만 생성
```
bakerywave reference build --site-dir tests/luau-module-project/website --lang luau
```

### Docusaurus 옵션 전달
```
bakerywave start --site-dir tests/luau-module-project/website -- --host 0.0.0.0 --port 3000
```
