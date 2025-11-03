# 외부 백엔드 통합 가이드

## 🎯 목표

외부 백엔드에서 구독 트랜잭션을 전송한 후, 시그니처만 우리 백엔드로 전송하면 **자동으로 로열티가 분배**됩니다.

## 📦 필요한 패키지

```bash
npm install @solana/web3.js
```

## 🔧 통합 단계

### 1단계: 구독 트랜잭션 생성 및 전송

```typescript
import {
  Connection,
  Transaction,
  TransactionInstruction,
  PublicKey,
  Keypair,
  ComputeBudgetProgram,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';

// 설정
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const PROGRAM_ID = new PublicKey('AiZSvcFJJd6dKzqXvk6QU3PUjyRvMnvB9VpLyLokDxqF');
const BACKEND_API = 'https://35.216.87.44.sslip.io';

// 구독 트랜잭션 전송 함수
async function sendSubscriptionTransaction(
  userKeypair: Keypair,
  modelPDA: PublicKey,
  amountSOL: number
) {
  // 1. 구독 영수증 PDA 계산
  const [subscriptionReceiptPDA] = await PublicKey.findProgramAddress(
    [
      Buffer.from('receipt'),
      modelPDA.toBuffer(),
      userKeypair.publicKey.toBuffer()
    ],
    PROGRAM_ID
  );

  // 2. 트랜잭션 생성
  const transaction = new Transaction();

  // 2-1. ComputeBudget instruction 추가 (선택사항)
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 200000
  });
  transaction.add(computeBudgetIx);

  // 2-2. 구독 instruction 데이터 생성 (실제 프로그램에 맞게 수정 필요)
  const subscriptionIx = new TransactionInstruction({
    keys: [
      { pubkey: subscriptionReceiptPDA, isSigner: false, isWritable: true },
      { pubkey: modelPDA, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
      // 추가 계정들...
    ],
    programId: PROGRAM_ID,
    data: Buffer.from([]) // 실제 instruction 데이터
  });
  transaction.add(subscriptionIx);

  // 3. 트랜잭션 전송
  const signature = await connection.sendTransaction(transaction, [userKeypair]);
  
  // 4. 트랜잭션 확인
  await connection.confirmTransaction(signature, 'confirmed');

  console.log('✅ 구독 트랜잭션 전송 완료:', signature);
  return signature;
}
```

### 2단계: 우리 백엔드로 시그니처 전송

```typescript
async function processRoyaltyDistribution(transactionSignature: string) {
  try {
    const response = await fetch(`${BACKEND_API}/api/transactions/process-signature-royalty`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transactionSignature: transactionSignature,
        // 선택사항: 커스텀 설정
        platformFeeBps: 500,        // 5% 플랫폼 수수료
        minRoyaltyLamports: 1000,   // 최소 로열티
        commitment: 'confirmed'      // 트랜잭션 확인 레벨
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ 로열티 분배 완료!');
      console.log('원본 트랜잭션:', result.data.originalTransaction);
      console.log('계보 정보:', result.data.lineageTrace);
      console.log('분배 내역:', result.data.distribution);
      console.log('분배 트랜잭션:', result.data.distributionTransaction.signature);
      
      return result;
    } else {
      console.error('❌ 로열티 분배 실패:', result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('❌ API 호출 실패:', error);
    throw error;
  }
}
```

### 3단계: 전체 워크플로우 통합

```typescript
async function completeSubscriptionFlow(
  userKeypair: Keypair,
  modelPDA: PublicKey,
  amountSOL: number
) {
  try {
    console.log('📝 1단계: 구독 트랜잭션 전송 중...');
    const signature = await sendSubscriptionTransaction(userKeypair, modelPDA, amountSOL);
    
    console.log('💰 2단계: 로열티 분배 처리 중...');
    const result = await processRoyaltyDistribution(signature);
    
    console.log('🎉 구독 및 로열티 분배 완료!');
    console.log({
      subscriptionSignature: signature,
      distributionSignature: result.data.distributionTransaction.signature,
      platformFee: result.data.distribution.platformAmount / LAMPORTS_PER_SOL,
      developerAmount: result.data.distribution.developerAmount / LAMPORTS_PER_SOL,
      lineageRoyalties: result.data.distribution.totalLineageAmount / LAMPORTS_PER_SOL
    });
    
    return result;
  } catch (error) {
    console.error('❌ 구독 프로세스 실패:', error);
    throw error;
  }
}
```

## 🚀 사용 예시

```typescript
// 사용자 지갑
const userKeypair = Keypair.fromSecretKey(/* secret key */);

// 구독할 모델 PDA
const modelPDA = new PublicKey('4uagqxrGxqY1GEJ54ipKvaun3UFCd1JyVYZDHGijmD8H');

// 구독 금액 (1 SOL)
const amountSOL = 1.0;

// 실행
await completeSubscriptionFlow(userKeypair, modelPDA, amountSOL);
```

## 📊 응답 예시

```json
{
  "success": true,
  "message": "Signature-based royalty distribution completed successfully",
  "data": {
    "originalTransaction": {
      "signature": "5LzM8x...",
      "modelPDA": "4uagqx...",
      "totalLamports": 1000000000,
      "totalSOL": 1.0
    },
    "lineageTrace": {
      "totalDepth": 2,
      "isValid": true,
      "lineage": [
        {
          "modelPDA": "4uagqx...",
          "modelName": "GPT-4-Fine-Tuned",
          "developerWallet": "Ctsc4R...",
          "depth": 0,
          "parentPDA": "7Abc8d..."
        },
        {
          "modelPDA": "7Abc8d...",
          "modelName": "GPT-4-Base",
          "developerWallet": "8nXGvX...",
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
          "modelPDA": "7Abc8d...",
          "developerWallet": "8nXGvX...",
          "modelName": "GPT-4-Base",
          "depth": 1,
          "amount": 25000000
        }
      ],
      "totalLineageAmount": 25000000,
      "remainingAmount": 925000000
    },
    "distributionTransaction": {
      "signature": "3XyZ9a..."
    }
  }
}
```

## 🔑 로열티 분배 계산

### 예시 1: 부모 모델 없음

```
총액: 1 SOL (1,000,000,000 lamports)
─────────────────────────────────────
플랫폼 수수료 (5%):     0.05 SOL → 플랫폼
개발자 몫 (95%):       0.95 SOL → 개발자
```

### 예시 2: 1단계 파생 모델

```
총액: 1 SOL
─────────────────────────────────────
플랫폼 수수료 (5%):     0.05 SOL  → 플랫폼
부모 로열티 (2.5%):    0.025 SOL → 부모 개발자
개발자 몫 (92.5%):     0.925 SOL → 현재 개발자
```

### 예시 3: 2단계 파생 모델

```
총액: 1 SOL
─────────────────────────────────────
플랫폼 수수료 (5%):     0.05 SOL  → 플랫폼
조부모 로열티 (2.5%):  0.025 SOL → 조부모 개발자
부모 로열티 (2.5%):    0.025 SOL → 부모 개발자
개발자 몫 (90%):       0.90 SOL  → 현재 개발자
```

## ⚙️ 커스터마이제이션

### 플랫폼 수수료 변경

```typescript
await processRoyaltyDistribution(signature, {
  platformFeeBps: 300  // 3%로 변경
});
```

### 최소 로열티 변경

```typescript
await processRoyaltyDistribution(signature, {
  minRoyaltyLamports: 5000  // 5000 lamports로 변경
});
```

## 🛡️ 에러 처리

```typescript
async function safeProcessRoyalty(signature: string) {
  try {
    const result = await processRoyaltyDistribution(signature);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      // 트랜잭션을 찾을 수 없음
      if (error.message.includes('Transaction not found')) {
        return { success: false, error: 'TRANSACTION_NOT_FOUND' };
      }
      
      // SOL 전송이 없음
      if (error.message.includes('No SOL transfer found')) {
        return { success: false, error: 'NO_TRANSFER_FOUND' };
      }
      
      // 무효한 계보
      if (error.message.includes('Invalid lineage')) {
        return { success: false, error: 'INVALID_LINEAGE' };
      }
    }
    
    return { success: false, error: 'UNKNOWN_ERROR' };
  }
}
```

## 🔍 디버깅

### 로그 확인

```typescript
// 우리 백엔드는 상세한 로그를 제공합니다
console.log('계보 정보:', result.data.lineageTrace);
console.log('분배 내역:', result.data.distribution);
```

### 수동 확인

```typescript
// Solana Explorer에서 트랜잭션 확인
const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
console.log('Solana Explorer:', explorerUrl);
```

## 📞 지원

문제가 발생하거나 질문이 있으시면:
- 📖 [SUBSCRIPTION_ROYALTY_FLOW.md](./SUBSCRIPTION_ROYALTY_FLOW.md) 참조
- 🐛 GitHub Issues에 문의
- 📧 support@your-platform.com

## 🔐 보안 고려사항

1. **프라이빗 키 보호**: 절대 프라이빗 키를 노출하지 마세요
2. **환경 변수 사용**: 민감한 정보는 환경 변수로 관리
3. **HTTPS 사용**: API 통신은 항상 HTTPS 사용
4. **Rate Limiting**: 너무 많은 요청을 보내지 마세요 (15분당 100회 제한)

## ✅ 체크리스트

- [ ] @solana/web3.js 패키지 설치
- [ ] 구독 트랜잭션 전송 함수 구현
- [ ] 우리 백엔드 API 통합
- [ ] 에러 처리 구현
- [ ] 테스트 (데브넷)
- [ ] 프로덕션 배포

## 🎉 완료!

이제 외부 백엔드에서 구독 트랜잭션을 전송하면, 우리 백엔드가 자동으로 계보를 추적하고 로열티를 분배합니다! 🚀

