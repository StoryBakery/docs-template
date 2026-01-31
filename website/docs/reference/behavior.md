---
title: 링크 / 정렬 / 진단
sidebar_label: Behavior
---

# 링크 / 정렬 / 진단

이 문서는 **현재 구현된 링크/정렬/진단 로직**을 실제 코드 기준으로 정리합니다. “현재 동작하는 규칙”만 포함하며, 계획이나 추측은 적지 않습니다.

## 1) 클래스 분류 로직

### 클래스 수집 기준
- `reference.json`의 `modules[].symbols[]`에서 `kind === "class"` 인 심볼을 수집합니다.
- **클래스 이름이 동일하면 하나로 병합**됩니다.

### 클래스 문서 경로
- 경로 규칙: `classes/<categoryPath>/<ClassName>.mdx`
- `categoryPath`는 `@category`의 값으로 구성됩니다.
- `@category`가 없으면 기본 카테고리(`Classes`)로 묶이며 경로는 `classes/<ClassName>.mdx`가 됩니다.

### 카테고리 분해 규칙
- `@category` 값에 `/`가 포함되면 **상위/하위 카테고리로 분리**됩니다.
  - 예: `Async/Primitives` → 상위 `Async`, 하위 `Primitives`
- Overview는 상위 카테고리별로 섹션을 만들고, 하위 카테고리를 작은 소제목으로 정렬합니다.

## 2) 멤버 분류 규칙

### 그룹 분류 순서
멤버는 다음 순서로 분류됩니다.

1. Types
2. Interfaces
3. Constructors
4. Properties
5. Methods
6. Functions
7. Events

### 분류 상세 규칙
- `symbol.kind === "constructor"` → Constructors
- `symbol.kind === "function"` 이고 `qualifiedName`에 `:`가 포함되면 → Methods
- `symbol.kind === "function"` 이고 `symbol.name === "new"` 이며 `qualifiedName`에 `.`가 포함되면 → Constructors
- `symbol.kind === "field"` → Interfaces
- `@event` 또는 `@tag event`가 있으면 → Events

## 3) 앵커 생성 규칙

### 앵커 후보 우선순위
1. `symbol.name`
2. `symbol.qualifiedName`
3. 표시 라벨

### 중복 방지
- 동일 앵커가 이미 사용된 경우, `-2`, `-3` 형태로 고유화합니다.
- 앵커는 알파벳/숫자/`_`/`-`만 허용됩니다.

## 4) 링크 생성 규칙

### Overview 카드 링크
- Overview 카드 링크는 해당 클래스 문서의 **상대 경로**로 생성됩니다.
- `.mdx` 확장자는 제거됩니다.

### Summary 링크
- Summary 항목은 **동일 페이지 내 앵커**로 연결됩니다.
- 앵커는 “멤버 고유 ID”로 생성된 값을 사용합니다.

### 레거시 API 링크 치환
- 문서 내용에 `/api/<Name>` 형태 링크가 있으면
  `/reference/<lang>/<Name>` 형태로 자동 변환됩니다.

## 5) 소스 링크 생성

### 기본 소스 URL
- Git 저장소의 `remote.origin.url`에서 URL을 추론합니다.
- 기본 브랜치는 `main`으로 처리합니다.

### URL 규칙
- 최종 URL은 아래 규칙을 따릅니다.
  - `{repoUrl}/blob/{branch}/{relativePath}#L{line}`
- `source.basePath`, `source.stripPrefix`가 있으면 경로를 보정합니다.

### 표시 방식
- 텍스트(`Source: ...`)는 출력하지 않습니다.
- **아이콘 버튼(</>)만 출력**합니다.

## 6) 진단(경고/오류)

### luau-docgen 경고
- `@param`이 함수 파라미터와 1:1 매칭되지 않으면 경고를 출력합니다.
- `@return` 규칙 위반, `@readonly`의 잘못된 사용 등도 경고 항목으로 기록됩니다.

### reference 생성 진단
- reference 생성기 자체는 **진단을 출력하지 않고**, JSON 입력을 그대로 렌더링합니다.
- 따라서 **진단은 docgen 단계에서 발생**하며, 렌더 단계는 출력만 수행합니다.

## 7) 현재 제한 사항

- `includePrivate`는 module 페이지 로직에만 적용되며, 클래스 페이지에는 적용되지 않습니다.
- `renderMode !== "mdx"`는 현재 CLI에서 “생성 스킵”으로 처리됩니다.


## 8) API 링크 처리 (백틱 문법)

### 대상
- 백틱으로 감싼 텍스트 중 `Class.` 접두어를 가진 항목은 링크로 변환됩니다.

### 변환 규칙
- `` `Class.Name` `` → 해당 클래스 페이지로 연결
- `` `Class.Name:Method()` `` → 클래스 페이지의 해당 멤버 앵커로 연결
- `` `Class.Name.Property` `` → 클래스 페이지의 해당 멤버 앵커로 연결

### 링크 텍스트 대체
- `` `Class.Name|표시텍스트` `` 형태를 지원합니다.
- `` `monospace|no-link` ``는 링크를 만들지 않고 코드로 표시합니다.

### 현재 범위
- 현재 구현은 **Class 접두어만 링크로 변환**합니다.
- `Datatype.`, `Enum.`, `Global.`, `Library.`는 코드 표기로 유지됩니다.

