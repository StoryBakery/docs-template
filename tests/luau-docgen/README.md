# luau-docgen 테스트

이 폴더는 luau-docgen 입력과 출력 구조를 분리해 가독성을 높이기 위한 테스트 공간입니다.

- fixtures: 입력 소스
- expected: luau-docgen 출력(JSON)

예시:

```
luau-docgen --root tests/luau-docgen/fixtures/basic --out tests/luau-docgen/expected/basic.json
```
