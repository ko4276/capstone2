# AI Agent Solana Backend

AI 에이전트 플랫폼의 솔라나 블록체인 백엔드 서비스입니다.

## 🚀 주요 기능

- **모델 등록**: AI 모델을 솔라나 블록체인에 등록
- **구독 시스템**: SOL 기반 모델 구독 및 결제
- **로열티 분배**: 플랫폼 수수료 및 부모 모델 로열티 자동 분배
- **계보 관리**: 모델 파생 관계 및 계보 깊이 관리
- **트랜잭션 처리**: 블록체인 트랜잭션 생성 및 관리

## 📋 요구사항

- Node.js 18+
- TypeScript 5+
- 솔라나 데브넷 접근

## 🛠️ 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
```bash
cp env.example .env
```

`.env` 파일을 편집하여 필요한 설정을 입력하세요:
```env
PORT=3002
NODE_ENV=development
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=GUrLuMj8yCB2T4NKaJSVqrAWWCMPMf1qtBSnDR8ytYwB
```

### 3. 개발 서버 실행
```bash
npm run dev
```

### 4. 프로덕션 빌드
```bash
npm run build
npm start
```

## 📡 API 엔드포인트

### 모델 관리
- `GET /api/models/:modelId` - 모델 정보 조회
- `POST /api/models/register` - 모델 등록
- `PUT /api/models/:modelId/metadata` - 모델 메타데이터 업데이트
- `PUT /api/models/:modelId/deactivate` - 모델 비활성화

### 구독 관리
- `GET /api/subscriptions/receipt/:modelPubkey/:userWallet` - 구독 영수증 조회
- `POST /api/subscriptions/purchase` - 구독 구매
- `GET /api/subscriptions/status/:modelPubkey/:userWallet` - 구독 상태 확인
- `DELETE /api/subscriptions/cancel/:modelPubkey/:userWallet` - 구독 취소

### 트랜잭션 처리
- `POST /api/transactions/process` - 트랜잭션 처리
- `POST /api/transactions/register-model` - 모델 등록 트랜잭션
- `POST /api/transactions/purchase-subscription` - 구독 구매 트랜잭션
- `POST /api/transactions/update-model-metadata` - 모델 메타데이터 업데이트 트랜잭션
- `POST /api/transactions/verify-lineage` - 계보 검증 트랜잭션
- `POST /api/transactions/treasury/distribute` - 트레저리 분배 (데브넷/테스트)
- `POST /api/transactions/process-signature-royalty` - 시그니처 기반 로열티 분배
- `GET /api/transactions/status/:signature` - 트랜잭션 상태 조회

### 시그니처 기반 로열티 (외부 백엔드 통합) ⭐ NEW
- `POST /api/signature-royalty/process-signature-royalty` - 트랜잭션 시그니처로 자동 로열티 분배

### 블록체인 유틸리티
- `GET /api/blockchain/status` - 블록체인 연결 상태 확인
- `GET /api/blockchain/balance/:publicKey` - 계정 잔액 조회
- `GET /api/blockchain/account/:publicKey` - 계정 정보 조회
- `POST /api/blockchain/pda` - PDA 계산
- `POST /api/blockchain/royalty-calculation` - 로열티 분배 계산
- `POST /api/blockchain/lineage-royalty-calculation` - 계보 기반 로열티 계산
- `POST /api/blockchain/trace-lineage` - 계보 추적

## 🏗️ 프로젝트 구조

```
solana-backend/
├── src/
│   ├── types/           # TypeScript 타입 정의
│   ├── services/        # 비즈니스 로직 서비스
│   ├── routes/          # API 라우트
│   ├── middleware/      # Express 미들웨어
│   └── utils/           # 유틸리티 함수
├── logs/                # 로그 파일
├── server.ts            # 메인 서버 파일
├── package.json         # 프로젝트 설정
└── tsconfig.json        # TypeScript 설정
```

## 🔧 주요 서비스

### SolanaService
- 솔라나 블록체인과의 상호작용
- PDA 생성 및 관리
- 트랜잭션 생성 및 전송
- 계정 정보 조회

### TransactionService
- 트랜잭션 요청 검증
- 트랜잭션 타입별 처리
- 에러 핸들링

## 📊 로그 관리

Winston을 사용한 구조화된 로깅:
- `logs/error.log` - 에러 로그
- `logs/combined.log` - 전체 로그

## 🔒 보안

- Rate limiting 적용
- CORS 설정
- Helmet 보안 헤더
- 입력 데이터 검증

## 🧪 테스트

```bash
npm test
```

## 🌟 외부 백엔드 통합: 시그니처 기반 로열티 분배

### 개요

외부 백엔드에서 ComputeBudget 프로그램을 포함한 구독 트랜잭션을 전송한 후, 시그니처만 전송하면 자동으로 로열티를 분배합니다.

### 워크플로우

```
[외부 백엔드] → 구독 트랜잭션 전송 → [Solana 블록체인]
                    ↓
                시그니처 반환
                    ↓
[외부 백엔드] → POST /api/signature-royalty/process-signature-royalty
                    ↓
[우리 백엔드] → 자동 분석 및 로열티 분배
```

### 사용 예시

```typescript
// 1. 외부 백엔드: 구독 트랜잭션 전송
const signature = await sendSubscriptionTransaction(userWallet, modelPDA, amount);

// 2. 우리 백엔드로 시그니처 전송
const response = await fetch('https://your-backend/api/signature-royalty/process-signature-royalty', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transactionSignature: signature,
    platformFeeBps: 500,        // 선택사항 (기본값 500 = 5%)
    minRoyaltyLamports: 1000    // 선택사항 (기본값 1000)
  })
});

const result = await response.json();
// 자동으로 계보 추적 및 로열티 분배 완료!
```

### 주요 기능

- ✅ **ComputeBudget instruction 자동 필터링**
- ✅ **구독 영수증 PDA 자동 추출**
- ✅ **모델 PDA 자동 추출**
- ✅ **전송 금액 자동 추출**
- ✅ **계보 추적 및 검증**
- ✅ **로열티 자동 분배**

### 상세 문서

자세한 내용은 [SUBSCRIPTION_ROYALTY_FLOW.md](./SUBSCRIPTION_ROYALTY_FLOW.md)를 참조하세요.

## 📝 라이선스

MIT License
