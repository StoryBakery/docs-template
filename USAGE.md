# 사용법

## 목적
이 템플릿은 StoryBakery 조직 전체에서 문서의 톤, 구조, 그리고 시각적 경험을 통일하면서도
프로젝트별로 높은 커스텀성을 유지하는 것을 목표로 합니다.

## 기본 개념
- 기본 전략은 공통 preset/theme 패키지를 설치해 문서 경험을 통일한다.
- 프로젝트 레포는 문서 콘텐츠와 최소한의 설정만 소유한다.
- 문서 소스는 "기본 Docusaurus", "Moonwave 출력", "완전 커스텀" 중 하나로 선택한다.
- 공통 테마로 조직 식별 요소(브랜딩, 네비게이션, 푸터)를 유지한다.
- 템플릿 레포는 부트스트랩 용도로만 제한적으로 사용한다.

## 적용 절차 (요약)
1. 프로젝트 레포에 문서 사이트 디렉터리(예: `docs-site/`)를 만든다.
2. 공통 preset/theme 패키지를 설치한다.
3. `docusaurus.config.ts`에 문서 모드와 경로를 지정한다.
4. (Moonwave 사용 시) Moonwave 출력물을 Docusaurus가 읽는 경로로 동기화한다.
5. Docusaurus 빌드를 수행하고 배포한다.

## 공통 테마 패키지 사용
공통 프리셋에서 테마를 포함하면 별도 설정 없이 사용됩니다.
테마만 단독으로 쓸 때는 아래처럼 추가합니다.

```
npm install --save @storybakery/docs-theme
```

```ts
// docusaurus.config.ts
export default {
  themes: ['@storybakery/docs-theme'],
};
```

## 권장 레이아웃
프로젝트 레포에서는 아래 두 가지 중 하나를 선택합니다.

### 분리형 (권장)
코드가 이미 `src/`에 있을 때 문서 사이트를 분리합니다.

```
docs-site/
  docs/
    manual/         # 사람이 작성하는 문서
    generated/      # Moonwave 등 자동 생성 문서
  src/
    pages/          # 커스텀 페이지 (Docusaurus 전용)
  static/
    assets/         # 공통 정적 자산
src/                # 실제 제품 코드
```

### 단일형
레포가 문서 전용이거나 코드와 충돌이 없을 때만 사용합니다.

```
docs/
  manual/
  generated/
src/
  pages/
static/
  assets/
```

## src/pages에 대한 기준
- `src/pages`는 Docusaurus 사이트의 라우팅을 위한 디렉터리다.
- 제품 코드가 이미 `src/`를 사용한다면 분리형 구조로 둔다.
- 문서 전용 레포라면 단일형을 써도 문제 없다.

## Moonwave 연동 포인트
- Moonwave 출력물은 "생성물"로 간주하고 소스와 분리한다.
- 빌드 파이프라인에서 "Moonwave 출력 -> 문서 동기화 -> Docusaurus 빌드" 순서를 유지한다.
- 출력 경로만 바꾸면 재사용 가능하도록 설정을 분리한다.

## 커스텀 문서 모드
- Docusaurus의 `pages`와 커스텀 컴포넌트를 활용한다.
- 공통 테마와 애니메이션 유틸을 유지하면서 레이아웃만 교체한다.

## 업데이트 전략
- 공통 테마/프리셋은 버전으로 배포하고 프로젝트는 버전을 pin 한다.
- 템플릿 레포는 부트스트랩/예시 용도로만 최소 유지한다.
