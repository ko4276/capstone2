import { PublicKey } from '@solana/web3.js';

// 모델 관련 타입
export interface ModelPricingTier {
  price: number;
  description: string;
  billingType: string; // e.g., 'free' | 'monthly_subscription' | 'one_time_purchase'
  // Optional limits per modality/tier
  monthlyTokenLimit?: number;       // LLM
  monthlyGenerationLimit?: number;  // image-generation
  monthlyRequestLimit?: number;     // multimodal
}

export interface ModelPricing {
  research?: ModelPricingTier;
  standard?: ModelPricingTier;
  enterprise?: ModelPricingTier;
}

export type ModelMetrics = Record<string, number>; // flexible to fit different modalities

export interface ModelData {
  modelId: string;
  modelName: string;
  uploader: string;
  versionName: string;
  modality: string; // e.g., 'LLM' | 'image-generation' | 'multimodal' | 'audio'
  ipfsCid: string;
  pricing?: ModelPricing;
  metrics?: ModelMetrics;
  thumbnail?: string;
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
  modelDeveloperWallet: PublicKey; // destination for developer share
  durationDays: number;
  expectedPriceLamports: number;
  slippageBps: number;
  royaltyBps?: number; // overrides model default if provided
  platformFeeBps?: number; // overrides env default if provided
  platformFeeWallet?: PublicKey; // destination for platform fee
  minRoyaltyLamports?: number; // stop cascading when below this
  ancestorDeveloperWallets?: PublicKey[]; // ordered from immediate parent up
  baseRoyaltyBps?: number; // cascade step rate (default 50 = 0.5%)
}

// 트랜잭션 관련 타입
export interface TransactionRequest {
  type: 'prepare_register_model_unsigned' | 'prepare_purchase_subscription_unsigned' | 'register_model' | 'purchase_subscription' | 'update_model_metadata' | 'verify_lineage';
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

// 계보 정보 타입
export interface LineageInfo {
  modelPDA: PublicKey;
  developerWallet: PublicKey;
  modelId: string;
  modelName: string;
  royaltyBps: number;
  depth: number;
  parentPDA?: PublicKey;
}

// 계보 추적 결과 타입
export interface LineageTrace {
  lineage: LineageInfo[];
  totalDepth: number;
  isValid: boolean;
  violations?: string[];
}

// 로열티 분배 타입 (계보 기반)
export interface RoyaltyDistribution {
  totalLamports: number;
  platformAmount: number;
  developerAmount: number;
  lineageRoyalties: {
    modelPDA: PublicKey;
    developerWallet: PublicKey;
    modelName: string;
    depth: number;
    amount: number;
    royaltyBps: number;
  }[];
  totalLineageAmount: number;
  remainingAmount: number;
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
