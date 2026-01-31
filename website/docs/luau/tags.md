# Luau 문서 태그

Luau 주석 기반 문서화에서 사용하는 태그 규칙을 정리합니다.

## Doc comment 형식

아래 두 형식을 지원합니다.

- `---` 연속 라인
- `--[=[ ... ]=]` 블록 주석

### 블록 내부 규칙

- `@`로 시작하는 라인은 **태그 라인**으로 처리합니다.
- `.`로 시작하는 라인은 **interface field(dot-syntax)** 로 처리합니다.
- 그 외 라인은 **설명(description)** 으로 처리하고 Markdown을 허용합니다.

## 태그 목록

| 태그 | 설명 |
| --- | --- |
| `@within <class>` | 소속 클래스 지정 |
| `@yields` | yielding 함수 표시 |
| `@param <name> [type] -- [description]` | 파라미터 설명 |
| `@return <type> -- [description]` | 반환값 설명 |
| `@error <type> -- [description]` | 오류 타입 설명 |
| `@tag <name>` | 태그 라벨 |
| `@event` | 이벤트 항목 표시 |
| `@extends <class>` | 상속 관계(부모 클래스) 표시 |
| `@category <name>` | 카테고리 분류 |
| `@unreleased` | 미출시 항목 표시 |
| `@since <version>` | 도입 버전 |
| `@deprecated <version> -- [description]` | 폐기 표시 |
| `@server` | 서버 전용 |
| `@client` | 클라이언트 전용 |
| `@plugin` | 플러그인 전용 |
| `@private` | 비공개 표시 |
| `@ignore` | 문서에서 제외 |
| `@readonly` | 읽기 전용 프로퍼티 |
| `@__index <name>` | 클래스 인덱스 테이블 지정 |
| `@external <name> <url>` | 외부 타입 링크 등록 |

## 멀티라인 설명

`@param`, `@return`, `@error`는 들여쓰기 continuation을 지원합니다.

```lua
--- @param path string -- 로드할 경로
---   - 상대/절대 경로 모두 지원한다.
---   - 실패 시 nil과 에러를 반환한다.
```

- 다음 줄이 2칸 이상 들여쓰기이며 첫 문자가 `@` 또는 `.`가 아니면 continuation으로 누적됩니다.
- 다음 태그 라인/field 라인/들여쓰기 없는 description 라인이 나오면 종료합니다.
- fenced code block 내부에서는 `@`를 태그로 해석하지 않습니다.

## 주요 태그 설명

### @within
- 문법: `@within <class>`
- 항목이 속한 클래스를 지정합니다.
- 기본적으로 필요하지만, 코드 패턴으로 자동 추론될 수 있습니다.

### @param
- 문법: `@param <name> [type] -- [description]`
- 파라미터 설명을 작성합니다.
- type이 비어 있거나 `any`인 경우 파라미터 불일치 경고를 완화합니다.

### @return
- 문법: `@return <type> -- [description]`
- 반환값 설명을 작성합니다.
- type이 비어 있거나 `any`인 경우 엄격한 타입 일치 강제를 하지 않습니다.

### @error
- 문법: `@error <type> -- [description]`
- 오류 타입 설명을 작성합니다.

### @yields
- 함수가 yield할 수 있음을 표시합니다.

### @tag
- 문법: `@tag <name>`
- 태그 라벨을 추가합니다.

### @event
- 문법: `@event`
- 이벤트 항목을 표시합니다.
- `@tag event`도 호환되지만 `@event` 사용을 우선합니다.

### @extends
- 문법: `@extends <class>`
- 상속 관계(부모 클래스)를 표시합니다.
- 복수 지정이 가능합니다.

### @category
- 문법: `@category <name>`
- Overview에서 클래스 분류를 위해 사용합니다.
- 슬래시(`/`)를 사용하면 중첩 분류로 취급합니다.

### @since
- 문법: `@since <version>`
- 도입 버전을 표시합니다.

### @deprecated
- 문법: `@deprecated <version> -- [description]`
- 폐기(deprecated) 항목을 표시합니다.

### @unreleased
- 미출시 항목을 표시합니다.

### @server / @client / @plugin
- 문법: `@server`, `@client`, `@plugin`
- 동작 영역을 표시합니다.

### @private / @ignore
- `@private`: 기본 숨김 처리
- `@ignore`: 문서에서 제외

### @readonly
- 문법: `@readonly`
- 읽기 전용 프로퍼티를 표시합니다.

### @__index
- 문법: `@__index <name>`
- 클래스 인덱스 테이블 이름을 지정합니다.

### @external
- 문법: `@external <name> <url>`
- 외부 타입 링크를 등록합니다.
