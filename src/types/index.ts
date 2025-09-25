import { PublicKey } from '@solana/web3.js';

// 모델 관련 타입
export interface ModelData {
  modelId: string;
  modelName: string;
  ipfsCid: string;
  priceLamports: number;
  royaltyBps: number;
  parentModelPubkey?: PublicKey;
  developerWallet: PublicKey;
  isAllowed: boolean;
  lineageDepth: number;
}

// 구독 관련 타입
export interface SubscriptionData {
  userWallet: PublicKey;
  modelPubkey: PublicKey;
  durationDays: number;
  expectedPriceLamports: number;
  slippageBps: number;
}

// 트랜잭션 관련 타입
export interface TransactionRequest {
  type: 'register_model' | 'purchase_subscription' | 'update_model_metadata' | 'verify_lineage';
  data: any;
  userSignature?: string;
  developerSignature?: string;
}

// API 응답 타입
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  transactionHash?: string;
}

// 솔라나 계정 정보 타입
export interface SolanaAccountInfo {
  pubkey: PublicKey;
  account: {
    executable: boolean;
    owner: PublicKey;
    lamports: number;
    data: Buffer;
    rentEpoch: number;
  };
}

// 로열티 분배 타입
export interface RoyaltyDistribution {
  totalLamports: number;
  platformAmount: number;
  royaltyAmount: number;
  developerAmount: number;
  parentDeveloperAmount?: number;
}

// 에러 타입
export interface CustomError extends Error {
  code?: string;
  statusCode?: number;
}

// 환경 변수 타입
export interface EnvironmentConfig {
  PORT: number;
  NODE_ENV: string;
  SOLANA_RPC_URL: string;
  SOLANA_WS_URL: string;
  PROGRAM_ID: string;
  PLATFORM_FEE_BPS: number;
  DEFAULT_ROYALTY_BPS: number;
  MAX_LINEAGE_DEPTH: number;
  FRONTEND_URL: string;
  LOG_LEVEL: string;
  JWT_SECRET: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
}
