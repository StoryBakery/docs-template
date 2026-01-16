# 테스트 사이트

템플릿 변경을 검증하기 위한 임시 Docusaurus 사이트입니다.
이 디렉터리는 배포 대상이 아니며, 실제 문서 사이트는 `website/`입니다.

테스트 프로젝트 구조:
- `tests/luau-module-project/src`: Luau 코드
- `tests/luau-module-project/website`: 문서 사이트

## 빠른 실행

```
npm install
npm run test
```

`npm run test`는 Moonwave extractor로 JSON을 생성한 뒤 Docusaurus 빌드를 수행하고,
생성된 reference 문서를 검증합니다.
생성 문서는 `docs/reference/`에 생성되며 Git 추적하지 않습니다.

## 로컬 개발(변경 자동 반영)

Lua 소스 변경을 바로 반영하려면 Moonwave 추출을 감시하고 Docusaurus를 동시에 실행해야 합니다.

```
npm run dev
```

`npm run start`는 한 번만 추출한 뒤 Docusaurus를 실행합니다.

## Moonwave extractor 설정

`tests/luau-module-project/src`에 테스트용 Luau 파일이 있습니다.
Moonwave 추출기를 사용해 JSON을 생성한 뒤 사이트를 실행합니다.

1. Moonwave extractor로 JSON 생성 (`.generated/moonwave/docs.json` 위치 고정)
2. `npm run start` 또는 `npm run build`

예시(명령은 팀 표준에 맞게 교체):

```
MOONWAVE_EXTRACTOR_CMD="moonwave-extractor extract {src} --base {src} > {out}" npm run moonwave:extract
npm run start
```

기본값으로는 최초 실행 시 Moonwave 릴리즈에서 extractor 바이너리를 자동으로 내려받습니다.
