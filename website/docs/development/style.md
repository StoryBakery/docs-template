---
title: 문서 스타일 가이드
sidebar_label: Style Guide
---

# 문서 스타일 가이드

이 문서는 문서 작성 규칙을 정의합니다. 변경될 수 있으며 모든 상황을 포괄하지 않습니다.

> 이 문서는 **Roblox Creator Docs의 STYLE 가이드에서 영감을 받았습니다.**
> 참고: `https://github.com/Roblox/creator-docs/blob/main/STYLE.md`

## 문서 유형

문서는 다음 네 가지 유형 중 하나에 속합니다.

- **개념(Conceptual)**
- **작업(Task-based)**
- **레퍼런스(Reference)**
- **튜토리얼(Tutorial)**

하나의 페이지에 여러 유형이 섞일 수 있습니다. 이 경우 **Markdown 헤더로 구간을 분리**합니다. 각 구간의 목적을 명확히 드러내면 읽기와 탐색이 쉬워집니다.

## 문체 및 톤

- 가능한 한 **현재 시제**를 사용합니다.
  - 나쁨: 버튼을 눌렀기 때문에 커서가 곧 바뀝니다.
  - 좋음: 버튼을 누르면 커서가 바뀝니다.
- 가능한 한 **능동태**를 사용합니다.
  - 나쁨: 리스트가 반환됩니다.
  - 좋음: 서버가 리스트를 반환합니다.
- **we/our**는 권장 사항이나 공통 정책을 설명할 때만 제한적으로 사용합니다.
- **2인칭**으로 독자를 지칭하되 “you can”을 과하게 쓰지 않습니다.
- UI 요소, 핵심 용어는 **굵게** 표시합니다. 기울임은 사용하지 않습니다.
- 파일 경로, 코드, 함수/변수명은 `monospace`로 표시합니다.
- 관용구/은유/속어는 사용하지 않습니다.
- **can**은 선택/권한, **might**는 가능성, **must**는 요구사항, **should**는 권장 사항입니다.
- 성별 표현은 피하고 가능하면 복수형으로 작성합니다.
- UI에서 **option/객체는 select**, **버튼/아이콘은 click**을 사용합니다.
- 숫자 표기: **1~9는 철자**, **10 이상은 숫자**를 사용합니다.
  - 단위가 있으면 숫자를 사용합니다(예: `6 GB`).

## 링크 규칙

### 외부 링크
- `create.roblox.com` 외부 링크는 **표준 Markdown 링크**를 사용합니다.
  - 예: `[Creator Dashboard](https://create.roblox.com/dashboard/creations)`

### 문서 내부 링크
- 동일 문서 사이트 내 다른 문서는 **상대 경로 + .md 확장자**로 연결합니다.
  - 예: `[Meshes](../parts/meshes.md)`

### API 링크 문법 (레퍼런스 문서)

레퍼런스 문서에서는 **API 링크 문법**을 사용합니다. 이 문법은 백틱으로 감싸며, 렌더 시 자동 링크로 변환됩니다.

#### 클래스
- `` `Class.Name` ``
- `` `Class.Name.Property` ``
- `` `Class.Name:Method()` ``
- `` `Class.Name.Event` ``

#### 데이터 타입
- `` `Datatype.Name` ``
- `` `Datatype.Name:Method()` ``
- `` `Datatype.Name.constructor()` ``

#### 열거형
- `` `Enum.Name` ``

#### 전역 / 라이브러리
- `` `Global.LuaGlobals.Function()` ``
- `` `Global.RobloxGlobals.Property` ``
- `` `Library.Name.Function()` ``

> 현재 구현 기준으로 **Class 계열은 내부 레퍼런스 페이지로 연결**됩니다. 나머지는 기본적으로 코드 표기이며, 향후 외부 링크/내부 링크로 확장 가능합니다.

#### 링크 텍스트 대체 (Link substitution)

표시 텍스트를 바꾸려면 `|`를 사용합니다.

- `` `Class.Name.Property|PropertyName` ``
- `` `Enum.Name|EnumItemName` ``

#### 링크 비활성화

링크를 만들지 않으려면 `|no-link`를 사용합니다.

- `` `monospace|no-link` `` → `monospace`

## 이미지

- 이미지가 문서를 명확히 설명할 때만 사용합니다.
- 파일명은 하이픈(`-`)으로 단어를 구분합니다.
- 스크린샷은 PNG, 사진은 JPG를 권장합니다.
- 다이어그램은 SVG를 권장합니다.
- 용량은 가능하면 200 KB 이하로 유지합니다.

## 경고/알림 블록

필요한 경우에만 사용하며, 짧게 작성합니다.

```md
<Alert severity="warning">
This feature is beta and can change in future releases.
</Alert>
```

`severity`는 아래 중 하나입니다.

- `error`
- `info`
- `success`
- `warning`

