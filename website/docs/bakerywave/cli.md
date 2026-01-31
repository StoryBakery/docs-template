---
title: CLI 사용법
sidebar_label: CLI
---

# bakerywave CLI 사용법

## 기본 규칙
- `bakerywave`는 Docusaurus CLI 커맨드를 최대한 그대로 제공합니다.
- Docusaurus 옵션은 `--` 뒤에 그대로 전달합니다.

예시:
```
bakerywave start -- --host 0.0.0.0 --port 4000
```

## 주요 커맨드

### start (alias: dev)
Docusaurus 개발 서버를 실행합니다.

```
bakerywave start --site-dir website
```

### build
정적 빌드를 수행합니다.

```
bakerywave build --site-dir website
```

### serve (alias: preview)
빌드 결과를 로컬에서 서빙합니다.

```
bakerywave serve --site-dir website
```

### clear
Docusaurus 캐시를 정리합니다.

```
bakerywave clear --site-dir website
```

### write-translations
번역 스켈레톤을 생성합니다.

```
bakerywave write-translations --site-dir website -- --locale ko
```

## reference 명령

### reference build
reference JSON 생성 + MDX 생성을 수행합니다.

```
bakerywave reference build --site-dir website
```

### reference watch
reference 소스를 감시하고 변경 시 재생성합니다.

```
bakerywave reference watch --site-dir website
```

## 옵션 우선순위
1) CLI 옵션
2) 환경변수
3) 설정 파일(bakerywave.toml)
4) 기본값

## 에러 메시지
- `luau-docgen` 실행 실패 시 상세 경로와 원인을 출력합니다.
- `@param` 불일치 등 진단은 경고로 출력됩니다.
