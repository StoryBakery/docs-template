# 패키지 릴리즈 가이드

이 저장소는 `@storybakery/docs-theme`, `@storybakery/docs-preset`, `@storybakery/create-docs`, `@storybakery/luau-docgen` 패키지를 배포합니다.
릴리즈 전에는 반드시 테스트를 통과시켜야 합니다.

## 테스트

```
npm run test
```

## 버전 업데이트

각 패키지의 `package.json`에서 버전을 올립니다(semver).

- `packages/docs-theme/package.json`
- `packages/docs-preset/package.json`
- `packages/create-docs/package.json`
- `packages/luau-docgen/package.json`

## 배포

각 패키지 디렉터리에서 `npm publish`를 실행합니다.

```
cd packages/docs-theme
npm publish --access public

cd ../docs-preset
npm publish --access public

cd ../create-docs
npm publish --access public

cd ../luau-docgen
npm publish --access public
```

## 설치/업데이트(프로젝트 레포)

```
npm install --save @storybakery/docs-preset@latest
```

또는:

```
npm update @storybakery/docs-preset
```
