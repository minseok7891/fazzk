# Fazzk 프로젝트 개발 지침

## 📝 문서화
- 모든 계획안(`implementation_plan.md`) 및 작업 목록(`task.md`)은 **반드시 한국어**로 작성해야 합니다.


## 🖥️ 환경별 주의사항

### PowerShell (Windows)
- **`&&` 연산자 사용 금지**: PowerShell에서는 `&&` 연산자가 기본적으로 지원되지 않습니다.
  - ❌ 잘못된 예: `git add -A && git commit -m "message"`
  - ✅ 올바른 예: 명령을 분리하여 순차적으로 실행
    ```powershell
    git add -A
    git commit -m "message"
    ```
  - 또는 PowerShell 7+에서는 `;`를 사용: `git add -A; git commit -m "message"`

## 📦 릴리즈 배포

- GitHub 릴리즈 배포 시 `/release` 워크플로우를 사용하세요.
- 버전 업데이트 시 다음 세 파일을 동시에 수정해야 합니다:
  1. `package.json`
  2. `src-tauri/tauri.conf.json`
  3. `src-tauri/Cargo.toml`
