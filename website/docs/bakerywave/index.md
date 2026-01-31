---
title: bakerywave 시작하기
sidebar_label: bakerywave
sidebar_position: 2
---

# bakerywave 시작하기

bakerywave는 Docusaurus CLI를 최대한 그대로 노출하면서, reference 생성 파이프라인을 함께 제공하는 StoryBakery 전용 CLI입니다.

## 설치

bakerywave는 GitHub Releases를 기준으로 배포합니다.

### rokit 설치

Windows 예시:
```
[tools]
bakerywave = { source = "github", repo = "StoryBakery/bakerywave", tag = "vX.Y.Z", asset = "bakerywave-windows-x64.zip" }
```

Linux 예시:
```
[tools]
bakerywave = { source = "github", repo = "StoryBakery/bakerywave", tag = "vX.Y.Z", asset = "bakerywave-linux-x64.zip" }
```

macOS 예시:
```
[tools]
bakerywave = { source = "github", repo = "StoryBakery/bakerywave", tag = "vX.Y.Z", asset = "bakerywave-macos-x64.zip" }
```

## 기본 사용

Docusaurus 기본 커맨드는 bakerywave에서 그대로 사용할 수 있습니다.

```bash
bakerywave start
bakerywave build
bakerywave serve
```

별칭은 아래처럼 제공합니다.

```bash
bakerywave preview
```

Docusaurus 옵션은 `--` 뒤로 전달합니다.

```bash
bakerywave start -- --host 0.0.0.0 --port 4000
```

## dev 모드

`bakerywave dev`는 reference watch와 Docusaurus start를 함께 실행합니다.

```bash
bakerywave dev
```

`dev`에서도 Docusaurus 옵션은 `--`로 전달합니다.

```bash
bakerywave dev -- --port 4000
```

## reference 생성

reference 생성은 `reference` 서브커맨드로 수행합니다.

```bash
bakerywave reference build --site-dir .
```

기본 흐름은 아래 순서입니다.

- luau-docgen이 JSON을 생성합니다.
- reference 플러그인이 JSON을 MDX로 변환합니다.
- 생성된 문서는 `website/docs/reference/<lang>/`에 기록됩니다.

## 변경 감지(Watch)

`reference watch`는 소스 변경을 감지해 reference를 다시 생성합니다.

```bash
bakerywave reference watch
```

watch는 `src/`와 `types/` 변경을 감지합니다.

## 설정 우선순위

reference 관련 설정은 아래 순서로 병합됩니다.

1. CLI 옵션
2. `bakerywave.toml`의 `[reference]`
3. `@storybakery/docs-preset`의 `reference` 옵션
4. 기본값

## 참고 문서
- [CLI 사용법](./cli)
- [설정](./config)
