---
title: bakerywave 설정
sidebar_label: bakerywave 설정
sidebar_position: 3
---

# bakerywave 설정

bakerywave는 프로젝트 루트 또는 `website/`에서 `bakerywave.toml`을 찾아 reference 설정을 불러옵니다.

## 설정 파일 위치

탐색 순서는 다음과 같습니다.

1. `website/bakerywave.toml`
2. `<projectRoot>/bakerywave.toml`

`projectRoot`는 `siteDir`가 `website`인 경우 `website/..`로 계산됩니다.

## [reference] 섹션

현재 사용되는 설정은 `[reference]` 섹션입니다.

| 키 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| lang | string | `"luau"` | 언어 식별자 |
| rootDir | string | `siteDir/..` 또는 `cwd` | 소스 루트 디렉터리 |
| srcDir | string | `"src"` | Luau 소스 디렉터리 |
| typesDir | string | 없음 | 타입 정의 디렉터리 |
| input | string | `website/.generated/reference/<lang>.json` | reference JSON 경로 |
| outDir | string | `website/docs/reference/<lang>` | 생성된 MDX 출력 경로 |
| manifestPath | string | `website/.generated/reference/manifest.json` | manifest 경로 |
| renderMode | string | `"mdx"` | 렌더링 모드 |
| clean | boolean | `true` | manifest 기반 정리 수행 여부 |
| includePrivate | boolean | `false` | `@private` 항목 포함 여부 |
| overviewTitle | string | `"Overview"` | Overview 제목 |
| defaultCategory | string | `"Classes"` | 기본 카테고리 이름 |
| categoryOrder | array | `[]` | 카테고리 표시 순서 |

## 경로 해석 규칙

- `rootDir`, `input`, `outDir`, `manifestPath`는 `bakerywave.toml`이 있는 위치 기준으로 해석됩니다.
- `srcDir`, `typesDir`는 `rootDir` 기준으로 해석됩니다.

## 예시

```toml
[reference]
lang = "luau"
rootDir = "."
srcDir = "src"
input = "website/.generated/reference/luau.json"
outDir = "website/docs/reference/luau"
manifestPath = "website/.generated/reference/manifest.json"
renderMode = "mdx"
clean = true
overviewTitle = "Overview"
defaultCategory = "Classes"
categoryOrder = ["Core", "Async"]
```

## 주의 사항

- `renderMode`가 `mdx`가 아니면 reference 생성이 건너뛰어집니다.
- `clean = true`일 때는 manifest에 없는 파일을 정리합니다.


## [i18n] 섹션

`bakerywave`는 Docusaurus i18n 규칙을 따르며, reference 출력물은 선택적으로 각 로케일로 복제합니다.

| 키 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| defaultLocale | string | 없음 | 기본 로케일 |
| locales | array | `[]` | 사용 로케일 목록 |
| referenceLocales | array | `[]` | reference 복제 대상 로케일 (비어있으면 defaultLocale 제외 전부) |
| reference.copy | boolean | `true` | reference 복제 수행 여부 |

### 동작 규칙
- `defaultLocale`과 `locales`는 Docusaurus의 `i18n` 설정과 동일한 의미입니다.
- `referenceLocales`가 비어 있으면 `locales`에서 `defaultLocale`을 제외한 목록을 사용합니다.
- `reference.copy = false`면 복제를 수행하지 않습니다.

### 예시
```toml
[i18n]
defaultLocale = "en"
locales = ["en", "ko", "ja"]
referenceLocales = ["ko", "ja"]

[i18n.reference]
copy = true
```


## [reference.languages.<lang>] 섹션

여러 소스 언어를 동시에 운영하려면 언어별 설정을 추가합니다.
`reference.lang`은 기본 언어이며, `--lang`으로 오버라이드할 수 있습니다.

| 키 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| rootDir | string | 없음 | 언어별 소스 루트 |
| srcDir | string | 없음 | 언어별 소스 디렉터리 |
| typesDir | string | 없음 | 언어별 타입 디렉터리 |
| input | string | 없음 | 언어별 JSON 출력 경로 |
| outDir | string | 없음 | 언어별 MDX 출력 경로 |
| renderMode | string | 없음 | 언어별 렌더 모드 |

### 예시
```toml
[reference]
lang = "luau"

[reference.languages.luau]
rootDir = "."
srcDir = "src"
input = "website/.generated/reference/luau.json"
outDir = "website/docs/reference/luau"

[reference.languages.ts]
rootDir = "."
srcDir = "src"
input = "website/.generated/reference/ts.json"
outDir = "website/docs/reference/ts"
```

