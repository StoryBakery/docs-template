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

`npm run test`는 Docusaurus 빌드를 수행한 뒤 reference 문서를 검증합니다.
검증 대상은 `docs/reference/`에 있는 파일입니다.

## 로컬 개발(변경 자동 반영)

```
npm run dev
```

`npm run start`는 동일하게 Docusaurus를 실행합니다.
