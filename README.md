# Fazzk (치지직 팔로우 알림)

**Fazzk**는 치지직(Chzzk) 스트리머를 위한 **실시간 팔로우 알림 프로그램**입니다.  
방송 화면(OBS)에 투명 배경으로 띄울 수 있으며, 알림 소리와 디자인을 자유롭게 커스터마이징할 수 있습니다.

![Fazzk Icon](public/dodoroi_icon.png)

## ✨ 주요 기능

*   **실시간 알림**: 새 팔로워가 생기면 즉시 화면에 알림을 띄웁니다. (재팔로우 감지 포함)
*   **OBS 완벽 지원**:
    *   배경이 투명하게 처리되어 게임 화면 위에 깔끔하게 올라갑니다.
    *   OBS '브라우저 소스'로 간편하게 추가 가능합니다.
*   **자동 업데이트**: 새 버전이 출시되면 앱 내에서 알림을 받고 다운로드할 수 있습니다.
*   **다크 모드**: 라이트/다크 테마 전환 지원
*   **브라우저 확장 프로그램**: Chrome 및 Firefox 모두 지원
*   **강력한 커스터마이징**:
    *   **사운드**: 원하는 MP3 파일을 알림음으로 설정
    *   **애니메이션**: 페이드(Fade), 슬라이드(Slide), 바운스(Bounce) 효과
    *   **텍스트**: 글자 색상과 크기 조절
*   **안정성**:
    *   **중복 실행 방지**: 이미 앱이 켜져 있다면 기존 창을 활성화
    *   **자동 재연결**: 네트워크 오류 시 자동 복구

## 🚀 설치 및 실행

### Windows 설치
[Releases](https://github.com/minseok7891/fazzk/releases) 페이지에서 최신 버전의 `Fazzk Setup.exe`를 다운로드하여 설치하세요.

### 직접 빌드하기
Node.js가 설치되어 있어야 합니다.

```bash
# 1. 저장소 복제
git clone https://github.com/minseok7891/fazzk.git
cd fazzk

# 2. 의존성 설치
npm install

# 3. 빌드 (Windows exe + Chrome/Firefox 확장프로그램)
npm run build
```

빌드 결과물:
- `dist/v버전/Fazzk Setup 버전.exe` - Windows 설치 파일
- `dist/v버전/chrome-extension.zip` - Chrome 확장프로그램
- `dist/v버전/firefox-extension.zip` - Firefox 확장프로그램

## 📖 사용 방법

### 1. 확장 프로그램 설치 (필수)
로그인을 위해 브라우저 확장 프로그램을 먼저 설치해야 합니다.

**Chrome:**
1. [Releases](https://github.com/minseok7891/fazzk/releases)에서 `chrome-extension.zip` 다운로드
2. `chrome://extensions`로 이동
3. "개발자 모드" 활성화 후 압축 해제한 폴더 로드

**Firefox:**
1. [Releases](https://github.com/minseok7891/fazzk/releases)에서 `firefox-extension.zip` 다운로드
2. `about:debugging#/runtime/this-firefox`로 이동
3. "임시 부가 기능 로드"로 zip 파일 선택

### 2. 로그인
1. **네이버에 로그인**한 상태에서 확장 프로그램이 자동으로 쿠키를 동기화합니다.
2. Fazzk 앱을 실행하면 자동으로 로그인됩니다.
3. 확장 프로그램 아이콘이 **초록색**이면 연결 성공!

> 수동 로그인이 필요한 경우: 확장 프로그램에서 쿠키를 복사하여 앱에 붙여넣기

### 3. OBS 연동
1. OBS 소스 목록에서 **[브라우저]** 추가
2. **URL**: `http://localhost:3000/pages/notifier.html?obs=true`
   - 포트가 다를 수 있음 (3000~3010 중 사용 가능한 포트 자동 선택)
   - 앱 내 '사용 방법' 메뉴에서 정확한 주소 확인 가능
3. **너비**: `1920` / **높이**: `1080` (방송 해상도에 맞게)

## 🛠 기술 스택

*   **Electron**: 데스크탑 앱 프레임워크
*   **Node.js**: 백엔드 로직
*   **Alpine.js**: 프론트엔드 인터랙션
*   **Express**: 로컬 서버

## 📝 라이선스

ISC License
