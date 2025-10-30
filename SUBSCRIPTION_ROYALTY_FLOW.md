# 구독 기반 로열티 분배 워크플로우

## 📋 개요

외부 백엔드에서 ComputeBudget 프로그램을 포함한 구독 트랜잭션을 전송하면, 우리 백엔드가 시그니처를 받아 자동으로 로열티를 분배합니다.

## 🔄 전체 워크플로우

```
[외부 백엔드] → 구독 트랜잭션 전송 → [Solana 블록체인]
                                              ↓
                                         시그니처 반환
                                              ↓
[외부 백엔드] → POST /api/signature-royalty/process-signature-royalty
                 (transactionSignature만 전송)
                                              ↓
[우리 백엔드] → 트랜잭션 디코딩 & 분석
                 1. 전송된 람포트 양 추출
                 2. 구독 영수증 PDA 추출
                 3. 구독 PDA에서 모델 PDA 추출
                 4. 계보 추적
                 5. 로열티 분배 계산
                 6. 트레저리에서 자동 분배
                                              ↓
                                         응답 반환
```

## 🎯 1. 외부 백엔드: 구독 트랜잭션 전송

### 트랜잭션 구조 예시

```typescript
import { 
  Transaction, 
  ComputeBudgetProgram, 
  SystemProgram,
  Connection,
  PublicKey,
  Keypair
} from '@solana/web3.js';

// 1. ComputeBudget instruction 추가 (선택사항, 트랜잭션 메타데이터/최적화용)
const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
  units: 200000
});

// 2. 우리 프로그램의 구독 instruction
const subscriptionIx = new TransactionInstruction({
  keys: [
    { pubkey: subscriptionReceiptPDA, isSigner: false, isWritable: true },
    { pubkey: modelPDA, isSigner: false, isWritable: true },
    { pubkey: userWallet, isSigner: true, isWritable: true },
    { pubkey: developerWallet, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    // ... 기타 계정들
  ],
  programId: PROGRAM_ID,
  data: subscriptionInstructionData
});

// 3. 트랜잭션 생성 및 전송
const transaction = new Transaction()
  .add(computeBudgetIx)  // ComputeBudget instruction (우리 백엔드에서 자동 필터링됨)
  .add(subscriptionIx);

const signature = await connection.sendTransaction(transaction, [userKeypair]);
await connection.confirmTransaction(signature);

// 4. 시그니처를 우리 백엔드로 전송
const response = await fetch('https://our-backend/api/signature-royalty/process-signature-royalty', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transactionSignature: signature,
    platformFeeBps: 500,        // 선택사항, 기본값 500 (5%)
    minRoyaltyLamports: 1000,   // 선택사항, 기본값 1000
    commitment: 'confirmed'     // 선택사항, 기본값 'confirmed'
  })
});

const result = await response.json();
```

## 🔍 2. 우리 백엔드: 트랜잭션 분석 및 처리

### API 엔드포인트

```
POST /api/signature-royalty/process-signature-royalty
```

### 요청 본문

```json
{
  "transactionSignature": "5Lz...xyz",
  "platformFeeBps": 500,         // 선택사항, 기본값 500 (5%)
  "minRoyaltyLamports": 1000,    // 선택사항
  "commitment": "confirmed"       // 선택사항
}
```

### 처리 단계

#### 2.1. 트랜잭션 정보 조회

```typescript
const transactionInfo = await solanaService.getTransactionInfo(transactionSignature);
```

#### 2.2. 전송된 람포트 양 추출

```typescript
// extractTransferredAmountFromTransaction()
// - ComputeBudget instruction 자동 필터링
// - SystemProgram.transfer instruction에서 lamports 추출
// - SPL Token transfer도 지원

const totalLamports = await solanaService.extractTransferredAmountFromTransaction(transactionInfo);
// 결과 예시: 1000000000 (1 SOL)
```

#### 2.3. 구독 영수증 PDA 추출

```typescript
// extractSubscriptionReceiptPDAFromTransaction()
// - ComputeBudget instruction 건너뛰기
// - 우리 프로그램 instruction에서 첫 번째 계정 (subscription_receipt PDA) 추출
// - 로그에서도 PDA 패턴 검색

const subscriptionReceiptPDA = await solanaService.extractSubscriptionReceiptPDAFromTransaction(transactionInfo);
// 결과 예시: PublicKey('7Abc...xyz')
```

#### 2.4. 구독 PDA에서 모델 PDA 추출

```typescript
// extractModelInfoFromSubscriptionReceipt()
// - 구독 영수증 계정 데이터 읽기
// - 구조: discriminator(8) + model_pubkey(32) + user_wallet(32) + ...
// - 모델 PDA와 사용자 지갑 추출

const modelInfo = await solanaService.extractModelInfoFromSubscriptionReceipt(subscriptionReceiptPDA);
// 결과 예시: { modelPDA: PublicKey('4uag...xyz'), userWallet: PublicKey('Ctsc...xyz') }
```

#### 2.5. 계보 추적

```typescript
// traceLineage()
// - 모델의 부모 모델을 재귀적으로 추적
// - 최대 32단계까지 추적
// - 순환 참조 감지

const lineageTrace = await solanaService.traceLineage(modelPDA, 32);
// 결과 예시:
// {
//   lineage: [
//     { modelPDA, modelName: 'GPT-4-Fine-Tuned', developerWallet, depth: 0, parentPDA },
//     { modelPDA, modelName: 'GPT-4-Base', developerWallet, depth: 1, parentPDA: null }
//   ],
//   totalDepth: 2,
//   isValid: true,
//   violations: []
// }
```

#### 2.6. 로열티 분배 계산

```typescript
// calculateLineageRoyaltyDistribution()
// - 플랫폼 수수료: 5% (기본값)
// - 조상 모델 로열티: 각 2.5% (기본값)
// - 남은 금액: 개발자에게

const distribution = solanaService.calculateLineageRoyaltyDistribution(
  totalLamports,      // 1000000000 (1 SOL)
  lineageTrace,
  platformFeeBps,     // 500 (5%)
  minRoyaltyLamports  // 1000
);
// 결과 예시:
// {
//   totalLamports: 1000000000,
//   platformAmount: 50000000,    // 0.05 SOL (5%)
//   lineageRoyalties: [
//     { modelPDA, developerWallet, modelName: 'GPT-4-Base', depth: 1, amount: 25000000 } // 0.025 SOL (2.5%)
//   ],
//   totalLineageAmount: 25000000,
//   developerAmount: 925000000,  // 0.925 SOL (92.5%)
//   remainingAmount: 925000000
// }
```

#### 2.7. 트레저리에서 자동 분배

```typescript
// distributeFromTreasury()
// - 플랫폼 몫: 트레저리에 잔류
// - 조상 모델 로열티: 각 조상 개발자 지갑으로 전송
// - 개발자 몫: 직접 개발자 지갑으로 전송

const { signature, distribution } = await solanaService.distributeFromTreasury(
  totalLamports,
  modelPDA,
  developerWallet,
  { platformFeeBps, minRoyaltyLamports, commitment }
);
```

### 응답 예시

```json
{
  "success": true,
  "message": "Signature-based royalty distribution completed successfully",
  "data": {
    "originalTransaction": {
      "signature": "5Lz...xyz",
      "modelPDA": "4uag...xyz",
      "totalLamports": 1000000000,
      "totalSOL": 1.0
    },
    "lineageTrace": {
      "totalDepth": 2,
      "isValid": true,
      "lineage": [
        {
          "modelPDA": "4uag...xyz",
          "modelName": "GPT-4-Fine-Tuned",
          "developerWallet": "Ctsc...xyz",
          "depth": 0,
          "parentPDA": "7Abc...xyz"
        },
        {
          "modelPDA": "7Abc...xyz",
          "modelName": "GPT-4-Base",
          "developerWallet": "8nXG...xyz",
          "depth": 1,
          "parentPDA": null
        }
      ]
    },
    "distribution": {
      "totalLamports": 1000000000,
      "platformAmount": 50000000,
      "developerAmount": 925000000,
      "lineageRoyalties": [
        {
          "modelPDA": "7Abc...xyz",
          "developerWallet": "8nXG...xyz",
          "modelName": "GPT-4-Base",
          "depth": 1,
          "amount": 25000000
        }
      ],
      "totalLineageAmount": 25000000,
      "remainingAmount": 925000000
    },
    "distributionTransaction": {
      "signature": "3Xy...abc"
    }
  }
}
```

## 🔑 주요 개선 사항

### 1. ComputeBudget Instruction 자동 필터링

```typescript
// ComputeBudget Program ID
private readonly COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';

// 모든 추출 메서드에서 자동으로 건너뛰기
if (programId && programId.toString() === this.COMPUTE_BUDGET_PROGRAM_ID) {
  logger.info('⏭️  Skipping ComputeBudget instruction');
  continue;
}
```

### 2. 구독 영수증 PDA 추출

```typescript
// 트랜잭션에서 구독 영수증 PDA 자동 추출
const subscriptionReceiptPDA = await extractSubscriptionReceiptPDAFromTransaction(transactionInfo);
```

### 3. 구독 PDA에서 모델 정보 추출

```typescript
// 구독 영수증 계정 데이터에서 모델 PDA와 사용자 지갑 추출
const modelInfo = await extractModelInfoFromSubscriptionReceipt(subscriptionReceiptPDA);
// { modelPDA, userWallet }
```

## 🧪 테스트 시나리오

### 시나리오 1: 기본 구독 (부모 모델 없음)

```
총액: 1 SOL (1,000,000,000 lamports)
플랫폼 수수료 (5%): 0.05 SOL
개발자 몫 (95%): 0.95 SOL
```

### 시나리오 2: 1단계 파생 모델

```
총액: 1 SOL
플랫폼 수수료 (5%): 0.05 SOL
부모 모델 로열티 (2.5%): 0.025 SOL
개발자 몫 (92.5%): 0.925 SOL
```

### 시나리오 3: 2단계 파생 모델

```
총액: 1 SOL
플랫폼 수수료 (5%): 0.05 SOL
조부모 모델 로열티 (2.5%): 0.025 SOL
부모 모델 로열티 (2.5%): 0.025 SOL
개발자 몫 (90%): 0.90 SOL
```

## 🔒 보안 고려사항

1. **트랜잭션 검증**: 온체인 데이터만 신뢰
2. **PDA 계산 검증**: 프로그램 PDA 규칙 준수 확인
3. **금액 검증**: 실제 블록체인 전송 금액만 사용
4. **계보 검증**: 순환 참조 및 무효 계보 감지
5. **최소 로열티**: 1000 lamports 이하면 분배 중단

## 📊 로깅 및 모니터링

모든 단계에서 상세한 로그를 제공합니다:

```
🔍 Extracting Subscription Receipt PDA from transaction
🔍 Instruction 0: programId=ComputeBudget...
⏭️  Skipping ComputeBudget instruction
🔍 Instruction 1: programId=AiZSvc... (우리 프로그램)
✅ Found Subscription Receipt PDA: 7Abc...xyz
📝 This is a subscription transaction, extracting model PDA from subscription receipt
✅ Extracted model info from subscription receipt
✅ Found Model PDA: 4uag...xyz
🔍 DEBUG - Amount Extraction: totalLamports=1000000000, totalSOL=1.0
```

## 🚀 사용 예시 (외부 백엔드)

```javascript
// 1. 구독 트랜잭션 전송
const signature = await sendSubscriptionTransaction(userWallet, modelPDA, 1000000000);

// 2. 시그니처를 우리 백엔드로 전송
const response = await fetch('https://your-backend/api/signature-royalty/process-signature-royalty', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ transactionSignature: signature })
});

const result = await response.json();

if (result.success) {
  console.log('로열티 분배 완료!');
  console.log('플랫폼 수수료:', result.data.distribution.platformAmount / LAMPORTS_PER_SOL, 'SOL');
  console.log('개발자 몫:', result.data.distribution.developerAmount / LAMPORTS_PER_SOL, 'SOL');
  console.log('조상 로열티:', result.data.distribution.totalLineageAmount / LAMPORTS_PER_SOL, 'SOL');
}
```

## 🔧 환경 변수

```env
# 플랫폼 수수료 (500 = 5%)
PLATFORM_FEE_BPS=500

# 기본 로열티 (250 = 2.5%)
DEFAULT_ROYALTY_BPS=250

# 최소 로열티 (lamports)
MIN_ROYALTY_LAMPORTS=1000

# 최대 계보 깊이
MAX_LINEAGE_DEPTH=32

# 트레저리 키페어 경로
TREASURY_KEYPAIR_PATH=./treasury.json
```

## 📞 API 참조

- **엔드포인트**: `POST /api/signature-royalty/process-signature-royalty`
- **라우트 파일**: `src/routes/signatureRoyalty.ts`
- **서비스 파일**: `src/services/solanaService.ts`
- **타입 정의**: `src/types/index.ts`

## ⚠️ 에러 처리

```json
// 트랜잭션을 찾을 수 없음
{
  "success": false,
  "error": "Transaction not found"
}

// SOL 전송이 없음
{
  "success": false,
  "error": "No SOL transfer found in transaction"
}

// 모델 PDA를 추출할 수 없음
{
  "success": false,
  "error": "Could not extract model PDA from transaction"
}

// 무효한 계보
{
  "success": false,
  "error": "Invalid lineage detected",
  "data": {
    "violations": ["Circular reference detected at depth 3"]
  }
}
```

