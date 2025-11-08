# 외부 백엔드 - Solana 백엔드 API 명세서

## 📋 목차
- [개요](#개요)
- [Base URL](#base-url)
- [인증](#인증)
- [API 엔드포인트](#api-엔드포인트)
  - [1. 모델 등록](#1-모델-등록)
  - [2. 로열티 분배 처리](#2-로열티-분배-처리)
- [에러 처리](#에러-처리)
- [예시 코드](#예시-코드)

---

## 개요

이 문서는 외부 백엔드가 Solana 백엔드와 통신하기 위한 API 명세를 정의합니다.

**주요 기능:**
1. AI 모델을 Solana 블록체인에 등록
2. 구독 결제 트랜잭션을 검증하고 계보 기반 로열티 분배

---
**프로덕션:**
```
https://35.216.87.44.sslip.io/api
```

---

## 인증

현재 버전에서는 인증이 필요하지 않습니다.

> **Note:** 프로덕션 환경에서는 API 키 또는 JWT 토큰 기반 인증을 추가할 것을 권장합니다.

---

## API 엔드포인트

### 1. 모델 등록

#### **POST** `/transactions/register-model`

AI 모델을 Solana 블록체인에 등록합니다. 등록이 완료되면 모델의 PDA(Program Derived Address)와 트랜잭션 서명을 반환합니다.

#### **Request**

**Headers:**
```
Content-Type: application/json
```

**Body Parameters:**

| 필드 | 타입 | 필수 | 설명 | 예시 |
|------|------|------|------|------|
| `name` | string | ✅ | 모델 이름 (최대 64자) | `"GPT-4-Base-Model"` |
| `uploader` | string | ✅ | 업로더 이름 (최대 64자) | `"OpenAI"` |
| `versionName` | string | ✅ | 버전 (최대 64자) | `"1.0.0"` |
| `modality` | string | ✅ | 모달리티 (최대 32자) | `"LLM"`, `"image-generation"`, `"multimodal"` |
| `license` | array[string] | ✅ | 라이선스 목록 (최대 256자) | `["MIT"]` |
| `walletAddress` | string | ✅ | 개발자 지갑 주소 (Solana Pubkey) | `"Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN"` |
| `releaseDate` | string | ✅ | 릴리스 날짜 (최대 32자) | `"2025-01-15"` |
| `overview` | string | ✅ | 모델 개요 (최대 1024자) | `"GPT-4 base model..."` |
| `releaseNotes` | string | ✅ | 릴리스 노트 (최대 1024자) | `"Initial release..."` |
| `thumbnail` | string | ✅ | 썸네일 URL (최대 256자) | `"https://example.com/img.png"` |
| `cidRoot` | string | ✅ | IPFS CID (최대 128자) | `"QmYwAPJzv5CZsnAzt8auVZRn"` |
| `encryptionKey` | string | ✅ | 암호화 키 (최대 128자) | `"enc_key_2025"` |
| `pricing` | object | ✅ | 가격 정책 객체 | 아래 참조 |
| `metrics` | object | ✅ | 성능 지표 (최대 1024자 JSON) | `{"accuracy": 0.95}` |
| `technicalSpecs` | object | ✅ | 기술 사양 (최대 1024자 JSON) | `{"parameters": "1.8T"}` |
| `sample` | object | ✅ | 입출력 샘플 (최대 1024자 JSON) | `{"input": "...", "output": "..."}` |
| `relationship` | string | ✅ | 관계 타입 (최대 64자) | `"root"`, `"derived"`, `"fine-tuned"` |
| `parentModelPDA` | string | ❌ | 부모 모델 PDA (relationship이 "derived"일 때 필수) | `"8dj63ZRmz2GRTr838g15bGmboD6TNPaxQGeDX8CHfVm3"` |

**Pricing 객체 구조:**
```json
{
  "research": {
    "price": 0,
    "description": "Free for research",
    "billingType": "free",
    "monthlyTokenLimit": 100000
  },
  "standard": {
    "price": 100000000000,
    "description": "100 SOL per month",
    "billingType": "monthly_subscription",
    "monthlyTokenLimit": 1000000
  }
}
```

**BillingType 옵션:**
- `"free"`: 무료
- `"monthly_subscription"`: 월 구독
- `"one_time_purchase"`: 일회성 구매

#### **Request Example 1: Root 모델**

```json
{
  "name": "GPT-4-Base-Model",
  "uploader": "OpenAI",
  "versionName": "1.0.0",
  "modality": "LLM",
  "license": ["MIT"],
  "walletAddress": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
  "releaseDate": "2025-01-15",
  "overview": "GPT-4 base model for natural language processing",
  "releaseNotes": "Initial release with improved performance",
  "thumbnail": "https://example.com/models/gpt4-thumbnail.png",
  "cidRoot": "QmYwAPJzv5CZsnAzt8auVZRn",
  "encryptionKey": "enc_key_gpt4_base_2025",
  "pricing": {
    "research": {
      "price": 0,
      "description": "Free for research",
      "billingType": "free"
    },
    "standard": {
      "price": 100000000000,
      "description": "100 SOL per month",
      "billingType": "monthly_subscription",
      "monthlyTokenLimit": 1000000
    }
  },
  "metrics": {
    "accuracy": 0.95,
    "f1Score": 0.93,
    "latency": 120
  },
  "technicalSpecs": {
    "parameters": "1.8T",
    "architecture": "Transformer",
    "contextWindow": 128000
  },
  "sample": {
    "input": "Explain quantum computing",
    "output": "Quantum computing uses quantum mechanics..."
  },
  "relationship": "root"
}
```

#### **Request Example 2: Derived 모델**

```json
{
  "name": "GPT-4-Medical-Specialized",
  "uploader": "MedAI Research Lab",
  "versionName": "1.0.0",
  "modality": "LLM",
  "license": ["Apache-2.0"],
  "walletAddress": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PwtSwkZ",
  "releaseDate": "2025-02-10",
  "overview": "Medical domain specialized GPT-4 model",
  "releaseNotes": "Fine-tuned on medical literature",
  "thumbnail": "https://example.com/models/gpt4-medical.png",
  "cidRoot": "QmXnNyB8fJzv5CZsnA9uVZRa",
  "encryptionKey": "enc_key_gpt4_medical_2025",
  "pricing": {
    "enterprise": {
      "price": 1000000000000,
      "description": "1000 SOL per month",
      "billingType": "monthly_subscription"
    }
  },
  "metrics": {
    "accuracy": 0.97,
    "medicalAccuracy": 0.98
  },
  "technicalSpecs": {
    "parameters": "1.8T",
    "baseModel": "GPT-4-Base-Model",
    "specialization": "Medical Diagnosis"
  },
  "sample": {
    "input": "Patient with fever and cough",
    "output": "Differential diagnosis suggests..."
  },
  "relationship": "derived",
  "parentModelPDA": "8dj63ZRmz2GRTr838g15bGmboD6TNPaxQGeDX8CHfVm3"
}
```

#### **Response**

**Success (200 OK):**
```json
{
  "success": true,
  "message": "Model registration transaction created successfully (development only)",
  "data": {
    "modelAccountPDA": "8dj63ZRmz2GRTr838g15bGmboD6TNPaxQGeDX8CHfVm3",
    "parentModelPDA": "4Ud8ywRLaiE92XFfYeK7ukHBmS9bY3tGSH7BpPuPzUrd"
  },
  "transactionHash": "hLnQPnTHCF9cB5zuURjH6uE733j6JrDsHAf2awm6Nxmth8gGAegFLiD2JPvtSpEa3SvnNXqKEcXb8UG7vq1QsEp"
}
```

**Response Fields:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 요청 성공 여부 |
| `message` | string | 성공 메시지 |
| `data.modelAccountPDA` | string | 등록된 모델의 PDA 주소 |
| `data.parentModelPDA` | string | 부모 모델 PDA (derived 모델만) |
| `transactionHash` | string | Solana 블록체인 트랜잭션 서명 |

**중요:**
- `modelAccountPDA`: 이후 로열티 분배 시 사용
- `transactionHash`: Solana Explorer에서 트랜잭션 확인 가능

**Error (400 Bad Request):**
```json
{
  "success": false,
  "error": "Validation error: \"name\" is required"
}
```

**Error (500 Internal Server Error):**
```json
{
  "success": false,
  "error": "Failed to register model: Transaction simulation failed"
}
```

---

### 2. 로열티 분배 처리

#### **POST** `/signature-royalty/process-signature-royalty`

구독 결제 트랜잭션을 검증하고 계보 기반 로열티를 분배합니다.

**주요 기능:**
1. 트랜잭션 존재 및 성공 여부 확인
2. 전송된 SOL/람포트 금액 추출
3. 모델 계보 추적 (modelPDA 제공 시)
4. 플랫폼 수수료 + 계보 로열티 분배 (modelPDA 제공 시)

**동작 시나리오:**
- **시나리오 1**: `transactionSignature`만 제공 → 람포트 확인만 수행
- **시나리오 2**: `transactionSignature` + `modelPDA` 제공 → 전체 로열티 분배 수행

#### **Request**

**Headers:**
```
Content-Type: application/json
```

**Body Parameters:**

| 필드 | 타입 | 필수 | 설명 | 예시 |
|------|------|------|------|------|
| `transactionSignature` | string | ✅ | Solana 트랜잭션 서명 | `"3CPvEGfEo42FrnT5cTWy..."` |
| `modelPDA` | string | ❌ | 모델 PDA (로열티 분배 시 필요) | `"8dj63ZRmz2GRTr838g15bGmboD6TNPaxQGeDX8CHfVm3"` |
| `platformFeeBps` | number | ❌ | 플랫폼 수수료 (basis points, 기본: 500 = 5%) | `500` |
| `minRoyaltyLamports` | number | ❌ | 최소 로열티 (lamports, 기본: 1000) | `1000` |
| `commitment` | string | ❌ | Solana commitment 레벨 | `"confirmed"`, `"finalized"` |

#### **Request Example 1: 람포트 확인만 (modelPDA 없음)**

```json
{
  "transactionSignature": "3CPvEGfEo42FrnT5cTWytvkAv4qqggNmKNjZaLGCgjiBNqLVaikbYzs1W957NAUpUxQZkySaUCAzRcr3gWRAikhu"
}
```

#### **Request Example 2: 전체 로열티 분배 (modelPDA 포함)**

```json
{
  "transactionSignature": "3CPvEGfEo42FrnT5cTWytvkAv4qqggNmKNjZaLGCgjiBNqLVaikbYzs1W957NAUpUxQZkySaUCAzRcr3gWRAikhu",
  "modelPDA": "8dj63ZRmz2GRTr838g15bGmboD6TNPaxQGeDX8CHfVm3",
  "platformFeeBps": 500,
  "minRoyaltyLamports": 1000
}
```

#### **Response**

##### **Case 1: modelPDA 없음 (람포트 확인만)**

**Success (200 OK):**
```json
{
  "success": false,
  "message": "Lamports transfer verified, but royalty distribution failed due to missing modelPDA",
  "data": {
    "transactionVerified": true,
    "lamportsTransferred": 100000000000,
    "totalSOL": 100,
    "royaltyDistributed": false,
    "reason": "modelPDA not provided in request"
  }
}
```

**Response Fields:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | `false` (로열티 분배 안 됨) |
| `message` | string | 람포트 확인됨, 분배 실패 메시지 |
| `data.transactionVerified` | boolean | 트랜잭션 검증 성공 여부 |
| `data.lamportsTransferred` | number | 전송된 람포트 수량 |
| `data.totalSOL` | number | 전송된 SOL 수량 |
| `data.royaltyDistributed` | boolean | `false` |
| `data.reason` | string | 분배 실패 이유 |

---

##### **Case 2: modelPDA 포함, 금액 부족**

**Success (200 OK):**
```json
{
  "success": false,
  "message": "Lamports transfer verified, but amount too small for royalty distribution",
  "data": {
    "transactionVerified": true,
    "lamportsTransferred": 23,
    "totalSOL": 0.000000023,
    "minRequiredLamports": 1000000,
    "minRequiredSOL": 0.001,
    "royaltyDistributed": false,
    "reason": "Amount too small: 23 lamports (minimum: 1000000 lamports = 0.001 SOL)"
  }
}
```

**Response Fields:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | `false` (금액 부족) |
| `message` | string | 금액 부족 메시지 |
| `data.transactionVerified` | boolean | 트랜잭션 검증 성공 |
| `data.lamportsTransferred` | number | 전송된 람포트 |
| `data.totalSOL` | number | 전송된 SOL |
| `data.minRequiredLamports` | number | 최소 요구 람포트 |
| `data.minRequiredSOL` | number | 최소 요구 SOL |
| `data.royaltyDistributed` | boolean | `false` |
| `data.reason` | string | 분배 실패 이유 |

---

##### **Case 3: modelPDA 포함, 금액 충분 (로열티 분배 성공)**

**Success (200 OK):**
```json
{
  "success": true,
  "message": "Signature-based royalty distribution completed successfully",
  "data": {
    "originalTransaction": {
      "signature": "3CPvEGfEo42FrnT5cTWytvkAv4qqggNmKNjZaLGCgjiBNqLVaikbYzs1W957NAUpUxQZkySaUCAzRcr3gWRAikhu",
      "modelPDA": "8dj63ZRmz2GRTr838g15bGmboD6TNPaxQGeDX8CHfVm3",
      "totalLamports": 100000000000,
      "totalSOL": 100
    },
    "lineageTrace": {
      "totalDepth": 2,
      "isValid": true,
      "lineage": [
        {
          "modelPDA": "8dj63ZRmz2GRTr838g15bGmboD6TNPaxQGeDX8CHfVm3",
          "modelName": "GPT-4-Medical-Specialized",
          "developerWallet": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PwtSwkZ",
          "depth": 0,
          "parentPDA": "4Ud8ywRLaiE92XFfYeK7ukHBmS9bY3tGSH7BpPuPzUrd"
        },
        {
          "modelPDA": "4Ud8ywRLaiE92XFfYeK7ukHBmS9bY3tGSH7BpPuPzUrd",
          "modelName": "GPT-4-Base-Model",
          "developerWallet": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
          "depth": 1,
          "parentPDA": null
        }
      ]
    },
    "distribution": {
      "totalAmount": 100000000000,
      "platformFee": 5000000000,
      "remainingAfterPlatformFee": 95000000000,
      "distributions": [
        {
          "recipient": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PwtSwkZ",
          "amount": 92625000000,
          "role": "current_model_developer",
          "percentage": 97.5
        },
        {
          "recipient": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
          "amount": 2375000000,
          "role": "parent_model_developer",
          "depth": 1,
          "percentage": 2.5
        }
      ],
      "platformFeePercentage": 5,
      "royaltyPercentagePerParent": 2.5
    },
    "distributionTransaction": {
      "signature": "2xYzB9fJzv5CZsnA9uVZRnQPPMiZA9uiVrgG2gE2LzoD2xGn1vtuSjG7UZZkPg4GGXRLL6t9KYzdCVWk"
    }
  }
}
```

**Response Fields:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | `true` |
| `message` | string | 성공 메시지 |
| `data.originalTransaction` | object | 원본 트랜잭션 정보 |
| `data.lineageTrace` | object | 계보 추적 결과 |
| `data.distribution` | object | 로열티 분배 내역 |
| `data.distributionTransaction.signature` | string | 분배 트랜잭션 서명 |

**로열티 분배 규칙:**
- **플랫폼 수수료**: 5% (기본값, 변경 가능)
- **부모 모델 로열티**: 각 부모당 2.5% (최대 32단계)
- **현재 모델 개발자**: 나머지 금액

**계산 예시:**
```
총액: 100 SOL
플랫폼 수수료 (5%): 5 SOL
남은 금액: 95 SOL

부모 1개 있을 경우:
- 부모 모델: 95 * 2.5% = 2.375 SOL
- 현재 모델: 95 - 2.375 = 92.625 SOL
```

---

#### **Error Responses**

##### **트랜잭션 없음 (404 Not Found):**
```json
{
  "success": false,
  "error": "Transaction not found on blockchain"
}
```

##### **트랜잭션 실패 (400 Bad Request):**
```json
{
  "success": false,
  "error": "Transaction failed on blockchain",
  "details": {
    "InstructionError": [0, "Custom error"]
  }
}
```

##### **SOL 전송 없음 (400 Bad Request):**
```json
{
  "success": false,
  "error": "No SOL transfer found in transaction. Transaction may not be a subscription payment."
}
```

##### **유효하지 않은 계보 (400 Bad Request):**
```json
{
  "success": false,
  "error": "Invalid lineage detected",
  "data": {
    "violations": [
      "Circular reference detected in lineage",
      "Max depth exceeded: 33 (max: 32)"
    ]
  }
}
```

##### **유효성 검증 실패 (400 Bad Request):**
```json
{
  "success": false,
  "error": "Validation error: \"transactionSignature\" is required"
}
```

---

## 에러 처리

### HTTP 상태 코드

| 코드 | 의미 | 설명 |
|------|------|------|
| `200` | OK | 요청 성공 (success: true/false 별도 확인) |
| `400` | Bad Request | 잘못된 요청 (유효성 검증 실패) |
| `404` | Not Found | 리소스 없음 (트랜잭션/모델 없음) |
| `500` | Internal Server Error | 서버 내부 오류 |

### 에러 응답 구조

모든 에러 응답은 다음 형식을 따릅니다:

```json
{
  "success": false,
  "error": "에러 메시지",
  "data": {}  // 추가 정보 (선택사항)
}
```

### 재시도 로직 권장사항

1. **네트워크 오류 (5xx)**: 지수 백오프로 최대 3회 재시도
2. **유효성 검증 오류 (4xx)**: 재시도하지 말고 요청 수정
3. **트랜잭션 없음 (404)**: 블록체인 확정 대기 후 재시도

---

## 예시 코드

### Node.js (axios)

```javascript
const axios = require('axios');

const BASE_URL = 'https://35.216.87.44.sslip.io/api';

// 1. 모델 등록
async function registerModel() {
  const modelData = {
    name: "GPT-4-Base-Model",
    uploader: "OpenAI",
    versionName: "1.0.0",
    modality: "LLM",
    license: ["MIT"],
    walletAddress: "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
    releaseDate: "2025-01-15",
    overview: "GPT-4 base model for natural language processing",
    releaseNotes: "Initial release with improved performance",
    thumbnail: "https://example.com/models/gpt4-thumbnail.png",
    cidRoot: "QmYwAPJzv5CZsnAzt8auVZRn",
    encryptionKey: "enc_key_gpt4_base_2025",
    pricing: {
      research: { price: 0, description: "Free", billingType: "free" }
    },
    metrics: { accuracy: 0.95 },
    technicalSpecs: { parameters: "1.8T" },
    sample: { input: "test", output: "result" },
    relationship: "root"
  };

  try {
    const response = await axios.post(
      `${BASE_URL}/transactions/register-model`,
      modelData
    );

    console.log('✅ Model registered successfully!');
    console.log('Model PDA:', response.data.data.modelAccountPDA);
    console.log('Transaction:', response.data.transactionHash);
    
    return response.data.data.modelAccountPDA;
  } catch (error) {
    console.error('❌ Error registering model:', error.response?.data || error.message);
    throw error;
  }
}

// 2. 로열티 분배 (람포트 확인만)
async function verifyTransaction(transactionSignature) {
  try {
    const response = await axios.post(
      `${BASE_URL}/signature-royalty/process-signature-royalty`,
      { transactionSignature }
    );

    console.log('✅ Transaction verified!');
    console.log('Lamports transferred:', response.data.data.lamportsTransferred);
    console.log('SOL transferred:', response.data.data.totalSOL);
    console.log('Royalty distributed:', response.data.data.royaltyDistributed);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error verifying transaction:', error.response?.data || error.message);
    throw error;
  }
}

// 3. 로열티 분배 (전체 분배)
async function distributeRoyalty(transactionSignature, modelPDA) {
  try {
    const response = await axios.post(
      `${BASE_URL}/signature-royalty/process-signature-royalty`,
      { 
        transactionSignature,
        modelPDA,
        platformFeeBps: 500,  // 5%
        minRoyaltyLamports: 1000
      }
    );

    if (response.data.success) {
      console.log('✅ Royalty distributed successfully!');
      console.log('Distribution signature:', response.data.data.distributionTransaction.signature);
      console.log('Platform fee:', response.data.data.distribution.platformFee, 'lamports');
      console.log('Distributions:', response.data.data.distribution.distributions);
    } else {
      console.log('⚠️  Transaction verified but royalty not distributed');
      console.log('Reason:', response.data.data.reason);
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Error distributing royalty:', error.response?.data || error.message);
    throw error;
  }
}

// 사용 예시
(async () => {
  // 1. 모델 등록
  const modelPDA = await registerModel();
  
  // 2. 구독 결제 후 트랜잭션 서명 받음 (외부 프로세스)
  const transactionSignature = "3CPvEGfEo42FrnT5cTWy...";
  
  // 3. 트랜잭션 검증만
  await verifyTransaction(transactionSignature);
  
  // 4. 로열티 분배까지
  await distributeRoyalty(transactionSignature, modelPDA);
})();
```

---

### Python (requests)

```python
import requests

BASE_URL = 'https://35.216.87.44.sslip.io/api'

# 1. 모델 등록
def register_model():
    model_data = {
        "name": "GPT-4-Base-Model",
        "uploader": "OpenAI",
        "versionName": "1.0.0",
        "modality": "LLM",
        "license": ["MIT"],
        "walletAddress": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
        "releaseDate": "2025-01-15",
        "overview": "GPT-4 base model for natural language processing",
        "releaseNotes": "Initial release with improved performance",
        "thumbnail": "https://example.com/models/gpt4-thumbnail.png",
        "cidRoot": "QmYwAPJzv5CZsnAzt8auVZRn",
        "encryptionKey": "enc_key_gpt4_base_2025",
        "pricing": {
            "research": {"price": 0, "description": "Free", "billingType": "free"}
        },
        "metrics": {"accuracy": 0.95},
        "technicalSpecs": {"parameters": "1.8T"},
        "sample": {"input": "test", "output": "result"},
        "relationship": "root"
    }

    try:
        response = requests.post(
            f'{BASE_URL}/transactions/register-model',
            json=model_data
        )
        response.raise_for_status()
        
        data = response.json()
        print('✅ Model registered successfully!')
        print(f'Model PDA: {data["data"]["modelAccountPDA"]}')
        print(f'Transaction: {data["transactionHash"]}')
        
        return data['data']['modelAccountPDA']
    except requests.exceptions.RequestException as e:
        print(f'❌ Error registering model: {e}')
        if hasattr(e.response, 'json'):
            print(e.response.json())
        raise

# 2. 로열티 분배 (람포트 확인만)
def verify_transaction(transaction_signature):
    try:
        response = requests.post(
            f'{BASE_URL}/signature-royalty/process-signature-royalty',
            json={'transactionSignature': transaction_signature}
        )
        response.raise_for_status()
        
        data = response.json()
        print('✅ Transaction verified!')
        print(f'Lamports transferred: {data["data"]["lamportsTransferred"]}')
        print(f'SOL transferred: {data["data"]["totalSOL"]}')
        print(f'Royalty distributed: {data["data"]["royaltyDistributed"]}')
        
        return data
    except requests.exceptions.RequestException as e:
        print(f'❌ Error verifying transaction: {e}')
        if hasattr(e.response, 'json'):
            print(e.response.json())
        raise

# 3. 로열티 분배 (전체 분배)
def distribute_royalty(transaction_signature, model_pda):
    try:
        response = requests.post(
            f'{BASE_URL}/signature-royalty/process-signature-royalty',
            json={
                'transactionSignature': transaction_signature,
                'modelPDA': model_pda,
                'platformFeeBps': 500,  # 5%
                'minRoyaltyLamports': 1000
            }
        )
        response.raise_for_status()
        
        data = response.json()
        if data['success']:
            print('✅ Royalty distributed successfully!')
            print(f'Distribution signature: {data["data"]["distributionTransaction"]["signature"]}')
            print(f'Platform fee: {data["data"]["distribution"]["platformFee"]} lamports')
        else:
            print('⚠️  Transaction verified but royalty not distributed')
            print(f'Reason: {data["data"]["reason"]}')
        
        return data
    except requests.exceptions.RequestException as e:
        print(f'❌ Error distributing royalty: {e}')
        if hasattr(e.response, 'json'):
            print(e.response.json())
        raise

# 사용 예시
if __name__ == '__main__':
    # 1. 모델 등록
    model_pda = register_model()
    
    # 2. 구독 결제 후 트랜잭션 서명 받음 (외부 프로세스)
    transaction_signature = "3CPvEGfEo42FrnT5cTWy..."
    
    # 3. 트랜잭션 검증만
    verify_transaction(transaction_signature)
    
    # 4. 로열티 분배까지
    distribute_royalty(transaction_signature, model_pda)
```

---

### cURL

```bash
# 1. 모델 등록
curl -X POST https://35.216.87.44.sslip.io/api/transactions/register-model \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPT-4-Base-Model",
    "uploader": "OpenAI",
    "versionName": "1.0.0",
    "modality": "LLM",
    "license": ["MIT"],
    "walletAddress": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
    "releaseDate": "2025-01-15",
    "overview": "GPT-4 base model",
    "releaseNotes": "Initial release",
    "thumbnail": "https://example.com/img.png",
    "cidRoot": "QmYwAPJzv5CZsnA",
    "encryptionKey": "enc_key_2025",
    "pricing": {"research": {"price": 0, "description": "Free", "billingType": "free"}},
    "metrics": {"accuracy": 0.95},
    "technicalSpecs": {"parameters": "1.8T"},
    "sample": {"input": "test", "output": "result"},
    "relationship": "root"
  }'

# 2. 트랜잭션 검증만 (modelPDA 없음)
curl -X POST https://35.216.87.44.sslip.io/api/signature-royalty/process-signature-royalty \
  -H "Content-Type: application/json" \
  -d '{
    "transactionSignature": "3CPvEGfEo42FrnT5cTWytvkAv4qqggNmKNjZaLGCgjiBNqLVaikbYzs1W957NAUpUxQZkySaUCAzRcr3gWRAikhu"
  }'

# 3. 로열티 분배 (modelPDA 포함)
curl -X POST https://35.216.87.44.sslip.io/api/signature-royalty/process-signature-royalty \
  -H "Content-Type: application/json" \
  -d '{
    "transactionSignature": "3CPvEGfEo42FrnT5cTWytvkAv4qqggNmKNjZaLGCgjiBNqLVaikbYzs1W957NAUpUxQZkySaUCAzRcr3gWRAikhu",
    "modelPDA": "8dj63ZRmz2GRTr838g15bGmboD6TNPaxQGeDX8CHfVm3",
    "platformFeeBps": 500
  }'
```

---

## 부록

### Solana 관련 용어

- **PDA (Program Derived Address)**: 프로그램이 생성한 주소로, 모델을 고유하게 식별
- **Lamports**: Solana의 최소 단위. 1 SOL = 1,000,000,000 lamports
- **Transaction Signature**: 블록체인 트랜잭션의 고유 식별자 (64자 Base58 문자열)
- **Commitment Level**: 트랜잭션 확정 수준 (`processed` < `confirmed` < `finalized`)

### 금액 단위 변환

```
1 SOL = 1,000,000,000 lamports
0.1 SOL = 100,000,000 lamports
0.01 SOL = 10,000,000 lamports
0.001 SOL = 1,000,000 lamports (최소 구독 금액)
```

### Solana Explorer

트랜잭션 확인:
- **Devnet**: https://explorer.solana.com/?cluster=devnet
- **Mainnet**: https://explorer.solana.com/

---

## 변경 이력

| 버전 | 날짜 | 변경 사항 |
|------|------|----------|
| 1.0.0 | 2025-01-08 | 초기 버전 작성 |

---

## 문의

기술 문의: [이메일 주소]
이슈 리포팅: [GitHub Issues URL]

