# PAYMENTS.md — Apps in Toss 인앱결제(IAP) 개발 가이드

Apps in Toss에서 인앱결제 상품을 판매하고 지급하는 전체 흐름을 정리한 문서.

| 항목 | 값 |
|---|---|
| 최소 SDK 버전 | **1.1.3** (상품 지급 완료 프로세스 포함) |
| 주문 복원 SDK 버전 | **1.2.2+** |
| 최소 토스앱 버전 (복원/조회) | **5.231.0** (Android/iOS) |
| 지급 실패 에러코드 지원 | **5.230.0+** |

---

## Base URL

```
https://apps-in-toss-api.toss.im
```

---

## 전체 개발 흐름

```
1. 상품 목록 조회      getProductItemList()
        ↓
2. 결제 요청           createOneTimePurchaseOrder()
        ↓
   결제 성공?
   ├─ YES → 파트너 상품 지급 로직 실행
   │         ├─ 성공: event.type = 'success'  ✅
   │         └─ 실패: errorCode = PRODUCT_NOT_GRANTED_BY_PARTNER
   └─ NO  → 에러 처리 (취소, 네트워크 오류 등)

3. 미결 주문 복원 (앱 재실행 시)
   getPendingOrders() → 지급 → completeProductGrant()

4. 주문 조회
   SDK: getCompletedOrRefundedOrders()
   API: POST /api-partner/v1/apps-in-toss/order/get-order-status
```

---

# 1단계. 상품 목록 조회

콘솔에 등록된 인앱결제 상품 목록을 가져와 UI에 표시한다.

## 함수

```typescript
import { getProductItemList } from '@apps-in-toss/framework';

const products = await getProductItemList();
```

## 주의사항

- 콘솔에서 **노출 상태가 ON**인 상품만 반환된다.
- 샌드박스 환경에서는 mock 데이터("테스트 상품 - 1", "테스트 상품 - 2")가 노출된다.
- 실제 콘솔 등록 상품은 토스앱 내 실서비스에서만 확인 가능 (2024년 10월 말 개선 예정).

## IapProductListItem 타입

```typescript
type IapProductListItem = {
  sku: string;           // 상품 ID (예: ait.0000010000.af647449.xxx)
  title: string;         // 상품명
  description: string;   // 상품 설명
  price: number;         // 가격 (원)
  currency: string;      // 통화 코드 (예: KRW)
};
```

---

# 2단계. 결제 요청

SDK를 통해 결제창을 실행한다. 앱인토스 서버에서 실제 결제 및 구글/애플 영수증 검증이 이루어진다.

## 함수

```typescript
import { createOneTimePurchaseOrder } from '@apps-in-toss/framework';

createOneTimePurchaseOrder({
  sku: 'YOUR_SKU_ID',
  onEvent: (event) => {
    if (event.type === 'success') {
      const { orderId, amount } = event.data;
      // 상품 지급 로직 실행
      // 지급 완료 후 반드시 completeProductGrant(orderId) 호출
    }

    if (event.type === 'error') {
      const { errorCode, message } = event.data;
      // 에러 처리
    }
  },
});
```

## 이벤트 콜백 구조

### 성공 (`event.type === 'success'`)

| 필드 | 타입 | 설명 |
|---|---|---|
| `event.data.orderId` | string | 주문번호 (uuid v7) |
| `event.data.amount` | number | 결제 금액 |
| `event.data.sku` | string | 구매한 상품 ID |

### 에러 (`event.type === 'error'`)

| 필드 | 타입 | 설명 |
|---|---|---|
| `event.data.errorCode` | string | 에러 코드 |
| `event.data.message` | string | 에러 설명 |

## SDK 1.1.3+ 변경사항

- 결제 성공 시 파트너사 상품 지급 로직까지 완료되어야 `event.type: success` 콜백 전달
- 지급 실패 시 `errorCode: PRODUCT_NOT_GRANTED_BY_PARTNER` 반환 (토스앱 5.230.0+)

> **주의**: 환불 권한은 앱마켓(구글/애플)에 있으며 앱인토스에서 보장 불가. 반드시 소액으로 테스트할 것.

---

# 3단계. 주문 복원 (SDK 1.2.2+)

결제는 완료되었으나 상품이 미지급된 주문을 앱 재실행 시 복원한다.
**앱 최소 버전 5.231.0 미만은 `undefined` 반환.**

## getPendingOrders — 미결 주문 조회

```typescript
import { getPendingOrders } from '@apps-in-toss/framework';

const pendingOrders = await getPendingOrders();

if (pendingOrders === undefined) {
  // 최소 버전 미지원 — 처리 생략
  return;
}

for (const order of pendingOrders) {
  // 상품 지급 로직 실행
  await grantProduct(order.orderId, order.sku);

  // 지급 완료 후 반드시 호출
  await completeProductGrant(order.orderId);
}
```

## completeProductGrant — 지급 완료 처리

```typescript
import { completeProductGrant } from '@apps-in-toss/framework';

// 상품 지급 완료 후 호출하여 주문 상태를 PURCHASED로 변경
await completeProductGrant(orderId);
```

> **중요**: 상품을 지급한 후 반드시 `completeProductGrant`를 호출해야 한다.
> 호출하지 않으면 해당 주문이 계속 `getPendingOrders`에 나타난다.

---

# 4단계. 주문 조회

## SDK 방식 — getCompletedOrRefundedOrders

결제 및 지급이 완료된 주문 또는 환불된 주문을 조회한다.
미지급 주문은 포함되지 않는다.

```typescript
import { getCompletedOrRefundedOrders } from '@apps-in-toss/framework';

const orders = await getCompletedOrRefundedOrders();

if (orders === undefined) {
  // 최소 버전(5.231.0) 미지원
  return;
}
```

---

## API 방식 — 주문 상태 조회

서버에서 특정 주문의 상태를 직접 검증할 때 사용한다. 토스 로그인 연동 필수.

### 엔드포인트

```
POST /api-partner/v1/apps-in-toss/order/get-order-status
Content-Type: application/json
```

### 요청 헤더

| 항목 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `x-toss-user-key` | string | Y | 토스 로그인을 통해 획득한 userKey |

### 요청 파라미터

| 항목 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `orderId` | string | Y | 주문번호 (uuid v7) |

### 요청 예시

```json
{
  "orderId": "13c9a1ff-2baa-4495-bbfa-a0826ba8c7c0"
}
```

### 응답 필드

| 항목 | 타입 | 설명 |
|---|---|---|
| `orderId` | string | 요청한 주문번호 |
| `sku` | string | 구매한 상품 ID |
| `statusDeterminedAt` | string | 주문 완료 일시 (yyyy-MM-dd'T'HH:mm:ssZ) |
| `status` | string | 주문 상태 (아래 Enum 참고) |
| `reason` | string | 상태에 대한 설명 |

### Status Enum

| 상태 | 설명 |
|---|---|
| `PURCHASED` | 인앱 결제 및 상품 지급 모두 완료 |
| `PAYMENT_COMPLETED` | 결제 완료, 상품 지급 실패 (SDK 1.1.3+) |
| `FAILED` | 결제 실패 |
| `REFUNDED` | 환불 완료 (`statusDeterminedAt`은 환불 완료 일시) |
| `ORDER_IN_PROGRESS` | 생성되었으나 결제/지급 처리 미완료 |
| `NOT_FOUND` | 해당 주문번호 미존재 |
| `MINIAPP_MISMATCH` | 해당 앱의 상품이 아님 |
| `ERROR` | 시스템 내부 오류 |

### 응답 예시 — 결제 완료, 지급 대기

```json
{
  "resultType": "SUCCESS",
  "success": {
    "orderId": "13c9a1ff-2baa-4495-bbfa-a0826ba8c7c0",
    "sku": "ait.0000010000.af647449.3bd55cfd00.0000000475",
    "statusDeterminedAt": "2025-09-12T16:57:12",
    "status": "PAYMENT_COMPLETED",
    "reason": "결제가 완료되었어요."
  }
}
```

### 응답 예시 — 주문 완료

```json
{
  "resultType": "SUCCESS",
  "success": {
    "orderId": "13c9a1ff-2baa-4495-bbfa-0000000000",
    "sku": "ait.0000010000.af647449.00000000000.0000000475",
    "statusDeterminedAt": "2025-09-12T16:57:12",
    "status": "PURCHASED",
    "reason": "완료된 주문이에요."
  }
}
```

---

# 에러 코드

| 에러코드 | 발생 조건 | 대응 |
|---|---|---|
| `PRODUCT_NOT_GRANTED_BY_PARTNER` | 결제 성공 후 파트너 서버 지급 로직 실패 | `getPendingOrders`로 미결 주문 복원 |
| (네트워크 오류) | 결제 요청 중 네트워크 단절 | 재시도 안내, 미결 주문 복원 |
| (사용자 취소) | 사용자가 결제창 직접 닫음 | 조용히 처리 |

> **SDK 1.0.3+**: 결제 승인/실패 모든 주문에 `orderId` 전달.
> 네트워크 오류로 `orderId` 발급 전 오류 발생 시에는 미전달 가능.
>
> **SDK 1.1.3+**: `errorCode` 정상 전달. 이전 버전은 `errorCode` 미전달 버그 있음.

---

# 샌드박스 테스트

## 필수 테스트 시나리오

### ① 결제 성공 테스트

- `event.type: success` 콜백 및 `event.data` 정상 반환 확인
- 내부 상품 지급 로직 정상 동작 확인
- 지급 완료 후 `completeProductGrant` 호출 확인
- UI 업데이트 확인
- 실제 과금 발생하지 않음

### ② 결제 성공 + 서버 지급 실패 테스트 (반드시 테스트)

결제는 성공했으나 파트너 서버 지급 로직이 실패하는 시나리오.
실서비스에서도 발생 가능하므로 **필수** 테스트 항목.

```
1. 결제 성공 → 서버 지급 실패 발생
2. 사용자에게 지급 실패 안내 표시
3. 앱 재실행 시 getPendingOrders() 호출
4. 미결 주문 지급 처리
5. completeProductGrant(orderId) 호출
```

### ③ 에러 테스트

- 네트워크 오류 시 에러 UI 표시
- 사용자 취소 시 적절한 처리
- 파트너사 상품 지급 실패 처리

### ④ 주문 상태 조회 테스트 (권장)

서버 API를 통해 주문 정합성 검증.

## 테스트 체크리스트

| 항목 | 필수 | 확인 포인트 |
|---|---|---|
| 상품 목록 노출 | ✔️ | 콘솔 등록 상품 정상 표시 |
| 결제 성공 | ✔️ | `event.data` 처리, 지급 로직, UI 업데이트 |
| 결제 성공 + 서버 지급 실패 (복원) | ✔️ | 미결 주문 복원 및 재지급 처리 |
| 에러 처리 | ✔️ | 에러 UI, 오류 처리, 재시도 흐름 |
| 주문 상태 조회 API | 권장 | 서버 검증 및 정합성 확인 |

---

# 구현 체크리스트

- [ ] SDK 1.1.3 이상 사용 확인
- [ ] 주문 복원이 필요하면 SDK 1.2.2 이상 사용
- [ ] 토스 로그인 연동 (`x-toss-user-key` 획득용)
- [ ] `createOneTimePurchaseOrder` 성공 콜백에서 상품 지급 로직 실행
- [ ] 지급 완료 후 `completeProductGrant(orderId)` 반드시 호출
- [ ] 앱 시작 시 `getPendingOrders()` 호출하여 미결 주문 복원
- [ ] 버전 미지원(`undefined` 반환) 케이스 처리
- [ ] 기기 변경 시에도 구매 내역 유지 (서버 기반 지급 상태 관리)
- [ ] 환불은 앱마켓(구글/애플) 또는 토스앱 구매내역에서 처리됨을 안내

---

# FAQ

**Q. 샌드박스에서 콘솔에 등록한 상품이 보이지 않아요.**
> 샌드박스는 mock 데이터("테스트 상품 - 1/2")를 노출한다. 실제 등록 상품은 토스앱 내 실서비스에서 확인 가능.

**Q. 인앱결제 실패 시 `orderId`가 내려오지 않아요.**
> SDK 1.0.3+에서 승인/실패 모든 주문에 `orderId` 전달. 단, 네트워크 오류로 `orderId` 발급 전 오류 발생 시에는 미전달 가능.

**Q. `errorCode`가 내려오지 않아요.**
> SDK 1.1.3+에서 수정된 버그. 최신 SDK로 업데이트 필요.

**Q. 주문 실패 건은 어떻게 처리하나요?**
> SDK 1.2.2+의 `getPendingOrders`로 미결 주문 조회 후 `completeProductGrant`로 지급 완료 처리.

**Q. 토스앱에서 구매내역을 확인하거나 환불하려면?**
> 토스앱 5.229.1 이상에서 구매내역 확인 가능. 구글 결제는 "환불받기" 버튼으로 환불 요청 가능. 파트너사는 콘솔 환불 내역에서 승인/반려 가능하며 결과는 푸시 알림으로 전달.
