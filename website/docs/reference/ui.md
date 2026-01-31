---
title: UI / 섹션 / 레이아웃
sidebar_label: UI
---

# UI / 섹션 / 레이아웃

이 문서는 **현재 웹사이트에 구현된 레퍼런스 UI를 그대로 기준으로** 설명합니다. “어떤 화면이, 어떤 기준으로, 어떤 순서로 보이는지”를 상세히 정리합니다.

## 1) 좌측 사이드바 구조

### Overview 고정
- Reference 사이드바의 최상단 항목은 **Overview**로 고정됩니다.
- Overview는 항상 `sidebar_position: 1`로 렌더링됩니다.

### 카테고리(Classes) 표시
- 기본 카테고리는 `Classes`입니다.
- `@category`가 지정되지 않은 클래스는 **Uncategorized를 만들지 않고**, 기본 카테고리(`Classes`)로 묶입니다.
- 카테고리 정렬은 `reference.categoryOrder`가 있으면 그 순서를 우선하며, 없으면 **알파벳 순**입니다.

### 문서 단위 기준
- 문서 분리 기준은 **모듈 파일이 아니라 클래스 단위**입니다.
- `classes/<category>/<ClassName>.mdx` 구조로 각 클래스가 **개별 페이지**를 갖습니다.

## 2) Overview 페이지 구조

### 전체 레이아웃
- Overview는 **카테고리 단위 섹션**으로 구성됩니다.
- 섹션마다 “카테고리 이름”과 “클래스 개수”가 표시됩니다.
- 클래스는 **카드 그리드**로 보여집니다.

### 카테고리 분해 규칙
- `@category` 값에 `/`가 포함되면 **상위/하위 섹션**으로 분해됩니다.
  - 예: `@category Async/Primitives`
  - 상위 섹션: `Async`
  - 하위 섹션: `Primitives`
- 하위 섹션이 비어 있으면 상위 섹션 바로 아래에 카드 그리드가 배치됩니다.

### 파일/슬러그 위치
- Overview 페이지는 항상 `reference/<lang>/index.mdx`로 생성됩니다.
- Overview의 타이틀은 `reference.overviewTitle`로 변경할 수 있습니다(기본: `Overview`).

## 3) 클래스 페이지 헤더

### 제목 규칙
- 클래스 페이지의 문서 제목은 **클래스명만** 표시합니다.
  - 예: `Promise`
- `Promise.new`처럼 “클래스명 + 멤버명”으로 출력하지 않습니다.

### 소스 이동 버튼
- 헤더 오른쪽에 **소스 이동 버튼(</> 아이콘)**이 표시됩니다.
- 버튼은 **텍스트 라벨 없이 아이콘만** 노출됩니다.
- 클릭 시 **GitHub 파일 + 줄 번호로 이동**합니다.

## 4) 클래스 페이지의 섹션 순서

클래스 문서 내부 섹션은 **아래 순서로 고정**됩니다.

1. Summary
2. Types
3. Interfaces
4. Constructors
5. Properties
6. Methods
7. Functions
8. Events

이 순서는 내부 상수 `SECTION_ORDER`로 고정되어 있으며 UI 전체에서 일관되게 적용됩니다.

## 5) Summary 섹션

### 기본 규칙
- Summary는 **항상 최상단 섹션**입니다.
- Summary에는 **섹션별 멤버 목록**이 요약 링크로 제공됩니다.

### 링크 생성
- Summary의 항목은 **동일 페이지 내 앵커**로 연결됩니다.
- 각 항목은 해당 섹션 내부에서 자동 생성된 `anchorId`를 사용합니다.

## 6) 멤버 섹션(UI)

### 멤버 제목 표시
- 각 멤버는 `### 멤버명`으로 표시됩니다.
- `Promise.new`처럼 “클래스명 접두어”는 제거되어 **멤버명만** 보여집니다.

### 멤버 소스 버튼
- 각 멤버에도 동일한 **소스 이동 버튼(</>)**이 표시됩니다.
- 버튼은 멤버 헤더 오른쪽에 정렬됩니다.

### 표시되는 정보
- 타입 시그니처(`types.display`)는 코드 블록으로 렌더링됩니다.
- 설명은 `descriptionMarkdown`이 있으면 사용하고, 없으면 `summary`로 대체됩니다.
- 태그가 있으면 `Tags:` 리스트로 출력됩니다.

## 7) 코드 블록 렌더링

### 기본 언어 지정
- fenced code block에 언어가 없으면 **Luau로 처리**됩니다.
- ` ```luau `는 자동으로 ` ```lua `로 변환됩니다(Prism 호환).

### 탭 사이즈
- `reference.codeTabSize`가 설정되면 `custom.css`에 **tab-size CSS**가 자동 삽입됩니다.
- 생성된 CSS는 다음 마커 블록으로 유지됩니다:
  - `/* sb-ref-tab-size-start */`
  - `/* sb-ref-tab-size-end */`

## 8) 기본값 요약

- Overview 제목: `Overview`
- 기본 카테고리: `Classes`
- Summary 섹션: 항상 표시
- 멤버 섹션 순서: 고정
- 소스 버튼: 헤더 오른쪽

