# 🌐 API 엔드포인트 가이드

## 📍 Base URL

**프로덕션**: `https://35.216.87.44.sslip.io`

---

## 🔗 주요 엔드포인트

### 1. 헬스 체크

```bash
GET https://35.216.87.44.sslip.io/health
```

**응답 예시:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-30T12:00:00.000Z",
  "blockchain": "devnet",
  "programId": "AiZSvcFJJd6dKzqXvk6QU3PUjyRvMnvB9VpLyLokDxqF"
}
```

---

### 2. 블록체인 상태 확인

```bash
GET https://35.216.87.44.sslip.io/api/blockchain/status
```

**응답 예시:**
```json
{
  "network": "devnet",
  "rpcUrl": "https://api.devnet.solana.com",
  "programId": "AiZSvcFJJd6dKzqXvk6QU3PUjyRvMnvB9VpLyLokDxqF",
  "blockHeight": 123456789
}
```

---

### 3. 모델 등록 ⭐

```bash
POST https://35.216.87.44.sslip.io/api/transactions/register-model
Content-Type: application/json
```

**요청 본문 (외부 백엔드 형식 지원):**

#### 루트 모델 등록
```json
{
  "name": "GPT-4.5",
  "uploader": "agentchain",
  "versionName": "1.0.0",
  "modality": "LLM",
  "license": ["MIT", "Apache-2.0"],
  "pricing": {
    "type": "subscription",
    "price": 100
  },
  "walletAddress": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
  "releaseDate": "2025-10-30",
  "overview": "Advanced language model",
  "releaseNotes": "Initial release",
  "thumbnail": "https://example.com/image.png",
  "cidRoot": "ipfs://QmExample123",
  "encryptionKey": "encryptionKeyExample123",
  "metrics": {
    "accuracy": 0.95,
    "latency": 100
  },
  "technicalSpecs": {
    "parameters": "175B",
    "architecture": "Transformer"
  },
  "sample": {
    "input": "Hello",
    "output": "Hi there!"
  }
}
```

#### 파생 모델 등록
```json
{
  "name": "GPT-4.5-FineTuned",
  "uploader": "agentchain",
  "versionName": "1.1.0",
  "modality": "LLM",
  "license": ["MIT"],
  "lineage": {
    "parentModelId": "2wPSL519dQ1ZntUiDADpGqvBr1yhyJ8kF5z3pEJgMvbf",
    "relationship": "fine_tuned"
  },
  "walletAddress": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
  "releaseDate": "2025-10-30",
  "overview": "Fine-tuned version",
  "releaseNotes": "Improved for specific tasks",
  "thumbnail": "https://example.com/image2.png",
  "cidRoot": "ipfs://QmExample456",
  "encryptionKey": "encryptionKeyExample456",
  "pricing": { "type": "subscription", "price": 150 },
  "metrics": { "accuracy": 0.97 },
  "technicalSpecs": { "parameters": "175B" },
  "sample": { "input": "test", "output": "result" }
}
```

**응답 예시:**
```json
{
  "success": true,
  "message": "Model registration transaction created successfully",
  "data": {
    "modelAccountPDA": "2wPSL519dQ1ZntUiDADpGqvBr1yhyJ8kF5z3pEJgMvbf",
    "parentModelPDA": null
  },
  "transactionHash": "3p92GC6gp58tWJQwW2MZ9jWXiKMUcsfUzgAMrpx2t6Fk..."
}
```

**주요 변환 규칙:**
- ✅ `name` → `modelName` 자동 변환
- ✅ `license` 배열 → 문자열 자동 변환
- ✅ `pricing`, `metrics`, `technicalSpecs`, `sample` 객체 → JSON 문자열 자동 변환
- ✅ `lineage.parentModelId` → `parentModelPDA` 자동 추출
- ✅ 추가 필드는 자동으로 무시됨

---

### 4. 시그니처 기반 로열티 분배 🔥

```bash
POST https://35.216.87.44.sslip.io/api/signature-royalty/process-signature-royalty
Content-Type: application/json
```

**요청 본문:**
```json
{
  "transactionSignature": "5LzM8x9yJ3kP4vN2wQ1fR6tG8hU7iS5dC3aE4bF2gH1j...",
  "modelPDA": "4xUJxzf1K46e8Xd4ixp47rEzQQUPTNQ4ku9ksv4EM8kc"
}
```

**요청 파라미터:**
- `transactionSignature` (필수): Solana 트랜잭션 시그니처
- `modelPDA` (필수): 구독한 모델의 PDA 주소
- `platformFeeBps` (선택): 플랫폼 수수료 (기본값: 500 = 5%)
- `minRoyaltyLamports` (선택): 최소 로열티 금액 (기본값: 1000)
- `commitment` (선택): 트랜잭션 확인 레벨 (processed/confirmed/finalized)

**응답 예시:**
```json
{
  "success": true,
  "message": "Royalty distribution completed successfully",
  "data": {
    "signature": "5LzM8x9yJ3kP4vN2wQ1fR6tG8hU7iS5dC3aE4bF2gH1j...",
    "modelPDA": "4xUJxzf1K46e8Xd4ixp47rEzQQUPTNQ4ku9ksv4EM8kc",
    "totalAmount": 1000000000,
    "totalSOL": 1.0,
    "lineageTrace": {
      "totalDepth": 1,
      "isValid": true,
      "lineage": [
        {
          "modelPDA": "4xUJxzf1K46e8Xd4ixp47rEzQQUPTNQ4ku9ksv4EM8kc",
          "modelName": "GPT-4.5-FineTuned",
          "developerWallet": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
          "depth": 1,
          "parentPDA": "2wPSL519dQ1ZntUiDADpGqvBr1yhyJ8kF5z3pEJgMvbf"
        },
        {
          "modelPDA": "2wPSL519dQ1ZntUiDADpGqvBr1yhyJ8kF5z3pEJgMvbf",
          "modelName": "GPT-4.5",
          "developerWallet": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
          "depth": 0
        }
      ]
    },
    "distribution": {
      "totalLamports": 1000000000,
      "platformAmount": 50000000,
      "platformSOL": 0.05,
      "developerAmount": 925000000,
      "developerSOL": 0.925,
      "lineageRoyalties": [
        {
          "modelPDA": "2wPSL519dQ1ZntUiDADpGqvBr1yhyJ8kF5z3pEJgMvbf",
          "developerWallet": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
          "modelName": "GPT-4.5",
          "depth": 1,
          "amount": 25000000,
          "amountSOL": 0.025
        }
      ],
      "totalLineageAmount": 25000000,
      "totalLineageSOL": 0.025
    },
    "distributionTransaction": {
      "signature": "3XyZ9a..."
    }
  }
}
```

**로열티 계산 규칙:**
- 플랫폼 수수료: 5% (500 bps)
- 각 부모 모델: 2.5% (250 bps)
- 나머지: 현재 모델 개발자

**예시:**
```
총액: 1 SOL (1,000,000,000 lamports)

1단계 파생 모델:
- 플랫폼: 0.05 SOL (5%)
- 부모 모델: 0.025 SOL (2.5%)
- 개발자: 0.925 SOL (92.5%)

2단계 파생 모델:
- 플랫폼: 0.05 SOL (5%)
- 조부모 모델: 0.025 SOL (2.5%)
- 부모 모델: 0.025 SOL (2.5%)
- 개발자: 0.90 SOL (90%)
```

---

### 5. 계보 조회

```bash
GET https://35.216.87.44.sslip.io/api/blockchain/lineage/:modelPDA
```

**요청 예시:**
```bash
GET https://35.216.87.44.sslip.io/api/blockchain/lineage/4xUJxzf1K46e8Xd4ixp47rEzQQUPTNQ4ku9ksv4EM8kc
```

**응답 예시:**
```json
{
  "modelPubkey": "4xUJxzf1K46e8Xd4ixp47rEzQQUPTNQ4ku9ksv4EM8kc",
  "maxDepth": 5,
  "isValid": true,
  "totalDepth": 1,
  "lineage": [
    {
      "modelPDA": "4xUJxzf1K46e8Xd4ixp47rEzQQUPTNQ4ku9ksv4EM8kc",
      "modelName": "GPT-4.5-FineTuned",
      "developerWallet": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
      "depth": 1,
      "parentPDA": "2wPSL519dQ1ZntUiDADpGqvBr1yhyJ8kF5z3pEJgMvbf"
    },
    {
      "modelPDA": "2wPSL519dQ1ZntUiDADpGqvBr1yhyJ8kF5z3pEJgMvbf",
      "modelName": "GPT-4.5",
      "developerWallet": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
      "depth": 0
    }
  ]
}
```

---

## 🧪 테스트 방법

### cURL 예시

#### 1. 헬스 체크
```bash
curl https://35.216.87.44.sslip.io/health
```

#### 2. 블록체인 상태
```bash
curl https://35.216.87.44.sslip.io/api/blockchain/status
```

#### 3. 모델 등록
```bash
curl -X POST https://35.216.87.44.sslip.io/api/transactions/register-model \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TestModel",
    "uploader": "testuser",
    "versionName": "1.0.0",
    "modality": "LLM",
    "license": ["MIT"],
    "walletAddress": "Ctsc4RLun5Rrv8pLSidD8cpYKWWdsT1sNUqpA7rv4YLN",
    "releaseDate": "2025-10-30",
    "overview": "Test model",
    "releaseNotes": "Test",
    "thumbnail": "https://example.com/img.png",
    "cidRoot": "ipfs://test",
    "encryptionKey": "testkey",
    "pricing": {"type": "free"},
    "metrics": {},
    "technicalSpecs": {},
    "sample": {}
  }'
```

#### 4. 로열티 분배
```bash
curl -X POST https://35.216.87.44.sslip.io/api/signature-royalty/process-signature-royalty \
  -H "Content-Type: application/json" \
  -d '{
    "transactionSignature": "YOUR_TRANSACTION_SIGNATURE",
    "modelPDA": "4xUJxzf1K46e8Xd4ixp47rEzQQUPTNQ4ku9ksv4EM8kc"
  }'
```

#### 5. 계보 조회
```bash
curl https://35.216.87.44.sslip.io/api/blockchain/lineage/2wPSL519dQ1ZntUiDADpGqvBr1yhyJ8kF5z3pEJgMvbf
```

---

## 🔧 JavaScript/TypeScript 예시

### Fetch API
```typescript
// 모델 등록
const response = await fetch('https://35.216.87.44.sslip.io/api/transactions/register-model', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: "GPT-4.5",
    uploader: "agentchain",
    // ... 기타 필드
  })
});

const result = await response.json();
console.log('Model PDA:', result.data.modelAccountPDA);
```

### Axios
```typescript
import axios from 'axios';

const BASE_URL = 'https://35.216.87.44.sslip.io';

// 로열티 분배
const { data } = await axios.post(`${BASE_URL}/api/signature-royalty/process-signature-royalty`, {
  transactionSignature: 'YOUR_TRANSACTION_SIGNATURE',
  modelPDA: '4xUJxzf1K46e8Xd4ixp47rEzQQUPTNQ4ku9ksv4EM8kc'
});

console.log('Distribution:', data.data.distribution);
```

---

## 🚨 에러 응답

모든 에러는 다음 형식으로 반환됩니다:

```json
{
  "success": false,
  "error": {
    "message": "에러 메시지",
    "code": "ERROR_CODE",
    "details": {}
  }
}
```

**주요 에러 코드:**
- `VALIDATION_ERROR`: 요청 데이터 검증 실패
- `TRANSACTION_NOT_FOUND`: 트랜잭션을 찾을 수 없음
- `NO_SOL_TRANSFER`: SOL 전송이 없음
- `INVALID_LINEAGE`: 유효하지 않은 계보
- `BLOCKCHAIN_ERROR`: 블록체인 처리 오류

---

## 📚 추가 문서

- [외부 백엔드 통합 가이드](./EXTERNAL_BACKEND_INTEGRATION.md)
- [로열티 분배 플로우](./SUBSCRIPTION_ROYALTY_FLOW.md)
- [GCP VM 배포 가이드](./GCP_VM_DEPLOYMENT_GUIDE.md)

---

## 🔒 보안

- ✅ HTTPS 연결 필수
- ✅ CORS 활성화
- ✅ Rate Limiting: 15분당 100 요청

---

## 📞 지원

문제가 발생하면:
1. 로그 확인
2. Solana Explorer에서 트랜잭션 확인
3. GitHub Issues에 문의

---

## ✅ 빠른 시작 체크리스트

- [ ] Base URL 확인: `https://35.216.87.44.sslip.io`
- [ ] 헬스 체크 테스트
- [ ] 모델 등록 API 테스트
- [ ] 로열티 분배 API 테스트
- [ ] 에러 처리 구현
- [ ] 프로덕션 배포

---

**Last Updated**: 2025-10-30  
**Version**: 1.0.0  
**Network**: Solana Devnet

