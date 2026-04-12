# CLAUDE.md — my-granite-app (Apps in Toss)

Apps in Toss 플랫폼 위에서 동작하는 Granite React Native 앱 개발 규칙.

---

## 프로젝트 개요

| 항목 | 값 |
|---|---|
| 앱 이름 | `my-granite-app` (패키지명), `app-in-toss-app` (granite appName) |
| URL Scheme | `intoss://app-in-toss-app` |
| React Native | 0.84.0 |
| React | 19.2.3 |
| Framework | `@granite-js/react-native` 1.0.4 |
| BaaS | `@apps-in-toss/framework` 2.4.1 |
| Design System | `@toss/tds-react-native` 2.0.2 |
| TDS React 지원 | **React 18까지만 공식 지원** (현재 프로젝트는 19.2.3 — 동작 확인 필요) |

---

## 디렉토리 구조

```
my-granite-app/
├── src/
│   ├── _app.tsx          # 앱 진입점 — 절대 수정 최소화
│   └── pages/            # 실제 페이지 컴포넌트 작성 위치
│       ├── index.tsx     → intoss://app-in-toss-app
│       └── about.tsx     → intoss://app-in-toss-app/about
├── pages/                # 루트 re-export shim (자동 생성, 직접 편집 금지)
├── src/router.gen.ts     # 라우터 타입 (자동 생성, 직접 편집 금지)
├── require.context.ts    # 페이지 컨텍스트 (수정 금지)
└── granite.config.ts     # 앱 설정
```

**규칙**: 새 페이지는 반드시 `src/pages/` 에 추가한다. `pages/` (루트) 파일은 직접 편집하지 않는다.

---

## 라우팅 규칙

### 파일 기반 라우팅 (Next.js 스타일)

| 파일 경로 | URL |
|---|---|
| `src/pages/index.tsx` | `intoss://app-in-toss-app` |
| `src/pages/about.tsx` | `intoss://app-in-toss-app/about` |
| `src/pages/item/index.tsx` | `intoss://app-in-toss-app/item` |
| `src/pages/item/detail.tsx` | `intoss://app-in-toss-app/item/detail` |

### 페이지 컴포넌트 패턴 (반드시 준수)

```typescript
import { createRoute } from '@granite-js/react-native';

// Route export는 파일당 하나, 이름은 반드시 `Route`
export const Route = createRoute('/your-path', {
  component: Page,
});

function Page() {
  const navigation = Route.useNavigation();

  return (
    // JSX
  );
}
```

- `createRoute` 첫 번째 인자: 해당 파일의 URL 경로 (예: `'/'`, `'/about'`)
- `component`: 페이지 렌더링 컴포넌트
- `Route.useNavigation()`: 페이지 내 내비게이션 훅 — 다른 훅/라이브러리로 대체 불가

### 내비게이션

```typescript
const navigation = Route.useNavigation();

// 다른 페이지로 이동
navigation.navigate('/about');

// 파라미터 전달 (라우터 타입 선언이 된 경우)
navigation.navigate('/item/detail', { id: 123 });
```

---

## 앱 진입점 (`src/_app.tsx`)

```typescript
import { AppsInToss } from '@apps-in-toss/framework';
import { PropsWithChildren } from 'react';
import { InitialProps } from '@granite-js/react-native';
import { context } from '../require.context';

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return <>{children}</>;
}

export default AppsInToss.registerApp(AppContainer, { context });
```

TDS를 사용하려면 `TDSProvider`를 `AppContainer` 안에 추가해야 한다:

```typescript
import { AppsInToss } from '@apps-in-toss/framework';
import { PropsWithChildren } from 'react';
import { InitialProps } from '@granite-js/react-native';
import { TDSProvider } from '@toss/tds-react-native';
import { context } from '../require.context';

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return (
    <TDSProvider>
      {children}
    </TDSProvider>
  );
}

export default AppsInToss.registerApp(AppContainer, { context });
```

- `TDSProvider`는 반드시 앱 루트에서 한 번만 선언한다.
- 다른 전역 Provider가 있을 경우 `TDSProvider` 안쪽에 중첩한다.
- `AppsInToss.registerApp` 호출 구조는 변경하지 않는다.

---

## 설정 (`granite.config.ts`)

```typescript
import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  scheme: 'intoss',
  appName: 'app-in-toss-app',  // Apps in Toss 콘솔 앱 이름과 반드시 일치
  plugins: [
    appsInToss({
      brand: {
        displayName: 'app-in-toss-app', // 네비게이션 바 레이블 (한글 가능)
        primaryColor: '#3182F6',          // RGB HEX 형식
        icon: '',                         // 아이콘 이미지 URL (미정이면 빈 문자열)
      },
      permissions: [],
    }),
  ],
});
```

- `appName`은 Apps in Toss 콘솔에 등록된 앱 이름과 반드시 일치해야 한다.
- `primaryColor`는 TDS 컴포넌트의 기본 색상에 반영된다.

---

## 개발 서버

```bash
# 개발 서버 시작
npm run dev

# 빌드 (.ait 파일 생성)
npm run build

# 배포
npm run deploy
```

### iOS 시뮬레이터 테스트

1. Apps in Toss 샌드박스 앱 실행
2. Scheme 입력: `intoss://app-in-toss-app`
3. "Bundling {n}%..." 메시지 → Metro 연결 성공

### iOS 실기기 테스트

```bash
# Mac IP 확인
ipconfig getifaddr en0
```

1. 개발 머신과 같은 WiFi 연결
2. "Local Network" 권한 허용
3. 샌드박스 앱 설정에서 IP 주소 입력

### Android 테스트

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5173 tcp:5173

# 연결 확인
adb reverse --list
```

---

## TypeScript 규칙

`tsconfig.json` strict 옵션이 모두 활성화되어 있다.

- `strict: true`
- `noUnusedLocals: true` — 사용하지 않는 지역 변수 금지
- `noUnusedParameters: true` — 사용하지 않는 파라미터 금지
- `noImplicitReturns: true` — 모든 코드 경로에서 반환값 명시
- `noUncheckedIndexedAccess: true` — 배열/객체 접근 시 undefined 가능성 고려
- `baseUrl: "src"` — `src/` 기준 절대 경로 임포트 사용 가능

---

## TDS (Toss Design System) 사용 규칙

### 설치 및 버전

```bash
npm install @toss/tds-react-native
```

> **주의**: `@toss/tds-react-native`는 공식적으로 React 18까지만 지원한다.
> 이 프로젝트는 React 19.2.3을 사용하므로, TDS 컴포넌트 동작에 이상이 있을 경우 React 버전 비호환을 먼저 의심한다.

### 컴포넌트 임포트 패턴

```typescript
import { Button, Badge, Toast } from '@toss/tds-react-native';
```

### 사용 가능한 컴포넌트 카테고리

| 카테고리 | 컴포넌트 |
|---|---|
| Foundation | Colors, Typography |
| Interactive | Button, Icon Button, Text Button, Checkbox, Radio, Switch, Dropdown |
| Input | Text Field, Search Field, Keypad, Numeric Spinner |
| Display | Badge, List, Toast, Loader, Skeleton |
| Layout | Navbar, Tab, Carousel, Grid List, Stepper |
| Specialized | Dialog, Result, Rating, Slider, Progress Bar, Bar Chart |

### Typography 규칙

- **폰트 사이즈와 line-height를 직접 숫자로 하드코딩하지 않는다**
- TDS Typography 토큰을 사용한다 (Typography 1~7, Sub Typography 1~13)
- 토큰이 iOS/Android 접근성 설정에 따라 자동으로 스케일된다

```typescript
// ❌ 금지 — 직접 숫자 하드코딩
<Text style={{ fontSize: 17, lineHeight: 25.5 }}>텍스트</Text>

// ✅ 권장 — TDS Typography 컴포넌트 또는 토큰 사용
import { Typography } from '@toss/tds-react-native';
<Typography.Body>텍스트</Typography.Body>
```

### 제약 사항

- TDS 컴포넌트는 로컬 브라우저에서 동작하지 않는다 — 반드시 샌드박스 앱으로 테스트한다
- `TDSProvider` 없이 TDS 컴포넌트를 사용하면 동작하지 않는다

---

## 스타일링 규칙

- `StyleSheet.create()` 를 사용한다 (인라인 스타일 지양)
- 스타일 객체는 컴포넌트 파일 하단에 선언한다
- 색상 상수는 파일 상단 또는 별도 `constants/colors.ts`에 정의한다
- 폰트 크기/줄간격은 TDS Typography 토큰을 우선 사용하고, 직접 지정이 불가피한 경우에만 숫자를 쓴다

---

## 코드 품질

```bash
npm run lint       # ESLint 검사
npm run typecheck  # TypeScript 타입 검사
npm run test       # Jest 테스트
```

- Linter: ESLint + Prettier (`.eslint.config.mjs` 기준)
- 커밋 전 `typecheck`와 `lint`를 통과해야 한다

---

## 트러블슈팅

| 증상 | 해결책 |
|---|---|
| "too many open files" | `rm -rf node_modules && npm install` |
| Plugin option error | `granite.config.ts`의 `icon` 값을 빈 문자열 `''`로 설정 |
| Network inspector 오작동 | 앱 재시작 → dev 서버 중지 → inspector 종료 → 재시작 |
| REPL 멈춤 | eye 아이콘 클릭 후 `__DEV__`, `1`, `undefined` 등 입력 |
| Port 연결 실패 | `adb kill-server` 후 재연결 |

---

## 주요 의존성 참조

| 패키지 | 용도 |
|---|---|
| `@granite-js/react-native` | 핵심 프레임워크 (라우팅, 빌드) |
| `@apps-in-toss/framework` | Apps in Toss 플랫폼 통합 |
| `@toss/tds-react-native` | Toss Design System 컴포넌트 |
| `@granite-js/plugin-router` | 파일 기반 라우터 |
| `@granite-js/plugin-hermes` | Hermes JS 엔진 최적화 |
