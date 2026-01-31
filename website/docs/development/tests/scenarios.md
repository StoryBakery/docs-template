---
title: 테스트 시나리오
sidebar_label: 시나리오
---

# 테스트 시나리오

이 문서는 **기능별 확인 항목**을 체크리스트로 제공합니다.

## 1) reference 생성
- [ ] `luau-docgen`이 JSON을 생성한다
- [ ] JSON 경로가 표준(`website/.generated/reference/luau.json`)과 일치한다
- [ ] 경고/진단 로그가 출력된다 (경고는 실패로 처리하지 않음)

## 2) JSON -> MDX 변환
- [ ] `website/docs/reference/luau/`에 문서가 생성된다
- [ ] `manifest.json` 기준으로 고아 파일이 제거된다
- [ ] `@param` 멀티라인 설명이 유지된다

## 3) 링크/태그 처리
- [ ] short link(`[ClassName]`)가 문서 내 링크로 해석된다
- [ ] 미해결 링크는 진단 경고로 남는다
- [ ] `@tag`, `@deprecated`, `@since`가 태그로 렌더된다

## 4) 코드 블록 렌더링
- [ ] 언어가 없는 fenced code block은 Luau로 하이라이트된다
- [ ] Luau 타입 예제의 멀티라인 인덴트가 보존된다

## 5) Docusaurus 빌드
- [ ] `npm --prefix tests/luau-module-project/website run build` 성공
- [ ] 레퍼런스 사이드바가 중복되지 않는다

## 6) watch 동작
- [ ] `bakerywave reference watch` 실행 시 src 변경이 반영된다
- [ ] dev 서버는 새 문서를 즉시 반영한다
