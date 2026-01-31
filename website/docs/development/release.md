---
title: 릴리즈 가이드
sidebar_label: 릴리즈
---

# 릴리즈 가이드

릴리즈는 GitHub Releases를 기준으로 진행합니다.

## 태그 릴리즈
```
git tag vX.Y.Z
git push origin vX.Y.Z
```

## GitHub Actions 출력
- `luau-docgen` 바이너리(Windows/Linux/macOS)
- `bakerywave` 바이너리(Windows/Linux/macOS)
- 각 아키텍처별 zip 아카이브

## rokit 설치
GitHub Releases 자산을 직접 지정해서 설치합니다.

예시(Windows):
```
[tools]
bakerywave = { source = "github", repo = "StoryBakery/bakerywave", tag = "vX.Y.Z", asset = "bakerywave-windows-x64.zip" }
```

예시(Linux):
```
[tools]
bakerywave = { source = "github", repo = "StoryBakery/bakerywave", tag = "vX.Y.Z", asset = "bakerywave-linux-x64.zip" }
```

예시(macOS):
```
[tools]
bakerywave = { source = "github", repo = "StoryBakery/bakerywave", tag = "vX.Y.Z", asset = "bakerywave-macos-x64.zip" }
```

luau-docgen도 동일하게 자산명만 바꿔서 지정합니다.
