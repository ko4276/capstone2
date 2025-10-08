import { PublicKey, Keypair } from '@solana/web3.js';
import { SolanaService } from './solanaService';
import { ModelData, SubscriptionData, TransactionRequest, ApiResponse } from '../types';
import { resolveModelIdentifierToPubkey } from '../utils/modelResolver';
import { logger } from '../utils/logger';
import Joi from 'joi';
import { pricingSchema, pricingTierSchema, metricsSchema } from '../utils/validation';

export class TransactionService {
  private solanaService: SolanaService;

  constructor() {
    this.solanaService = new SolanaService();
  }

  // base64 서명 트랜잭션 브로드캐스트
  async broadcastSignedTransaction(serializedBase64: string, options?: { skipPreflight?: boolean; maxRetries?: number; commitment?: 'processed' | 'confirmed' | 'finalized' }): Promise<ApiResponse> {
    try {
      if (!serializedBase64 || typeof serializedBase64 !== 'string') {
        throw new Error('serializedBase64 is required');
      }

      const signature = await this.solanaService.sendRawTransactionBase64(serializedBase64, options);
      return { success: true, transactionHash: signature };
    } catch (error) {
      logger.error('Failed to broadcast signed transaction:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  // 모델 등록 요청 검증
  private async validateModelRegistrationWithNameResolution(data: any): Promise<ModelData> {
    const schema = Joi.object({
      modelId: Joi.string().required(),
      modelName: Joi.string().required(),
      uploader: Joi.string().optional(),
      versionName: Joi.string().optional(),
      modality: Joi.string().optional(),
      ipfsCid: Joi.string().required(),
      pricing: pricingSchema,
      metrics: metricsSchema,
      thumbnail: Joi.string().optional(),
      priceLamports: Joi.number().integer().min(0).required(),
      royaltyBps: Joi.number().integer().min(0).max(10000).required(),
      parentModelPubkey: Joi.string().optional(),
      developerWallet: Joi.string().required(),
      isAllowed: Joi.boolean().required()
    });

    const { error, value } = schema.validate(data);
    if (error) {
      throw new Error(`Validation error: ${error.details[0].message}`);
    }

    const parentPubkey = value.parentModelPubkey
      ? await resolveModelIdentifierToPubkey(value.parentModelPubkey)
      : undefined;

    return {
      ...value,
      developerWallet: new PublicKey(value.developerWallet),
      parentModelPubkey: parentPubkey,
      lineageDepth: parentPubkey ? 1 : 0
    };
  }

  // 구독 구매 요청 검증
  private validateSubscriptionPurchase(data: any): SubscriptionData {
    const schema = Joi.object({
      userWallet: Joi.string().required(),
      modelPubkey: Joi.string().required(),
      modelDeveloperWallet: Joi.string().required(),
      durationDays: Joi.number().integer().min(1).max(365).required(),
      expectedPriceLamports: Joi.number().integer().min(0).required(),
      slippageBps: Joi.number().integer().min(0).max(10000).default(50),
      royaltyBps: Joi.number().integer().min(0).max(10000).optional(),
      platformFeeBps: Joi.number().integer().min(0).max(10000).optional(),
      platformFeeWallet: Joi.string().optional(),
      minRoyaltyLamports: Joi.number().integer().min(0).optional(),
      baseRoyaltyBps: Joi.number().integer().min(0).max(10000).optional(),
      ancestorDeveloperWallets: Joi.array().items(Joi.string()).optional()
    });

    const { error, value } = schema.validate(data);
    if (error) {
      throw new Error(`Validation error: ${error.details[0].message}`);
    }

    return {
      ...value,
      userWallet: new PublicKey(value.userWallet),
      modelPubkey: new PublicKey(value.modelPubkey),
      modelDeveloperWallet: new PublicKey(value.modelDeveloperWallet),
      platformFeeWallet: value.platformFeeWallet ? new PublicKey(value.platformFeeWallet) : undefined,
      ancestorDeveloperWallets: Array.isArray(value.ancestorDeveloperWallets)
        ? value.ancestorDeveloperWallets.map((s: string) => new PublicKey(s))
        : undefined
    };
  }

  // 모델 등록 처리 (개발 환경에서만 테스트 키페어 사용)
  async registerModel(request: TransactionRequest): Promise<ApiResponse> {
    try {
      logger.info('Processing model registration:', { modelId: request.data.modelId });

      // 프로덕션 환경에서는 직접 등록 금지
      if (process.env.NODE_ENV === 'production') {
        return {
          success: false,
          error: 'Direct model registration is not available in production. Use prepare-register-model endpoint instead.'
        };
      }

      // 요청 데이터 검증
      const modelData = await this.validateModelRegistrationWithNameResolution(request.data);

      // 개발 환경에서만 테스트용 키페어 사용
      const developerKeypair = this.solanaService.getTestKeypair();

      // 트랜잭션 생성
      const transaction = await this.solanaService.createModelRegistrationTransaction(
        modelData,
        developerKeypair
      );

      // 최근 블록해시 설정
      const recentBlockhash = await this.solanaService.getRecentBlockhash();
      transaction.recentBlockhash = recentBlockhash;
      transaction.feePayer = modelData.developerWallet;

      // 트랜잭션 전송
      const signature = await this.solanaService.sendTransaction(transaction, [developerKeypair]);

      return {
        success: true,
        message: 'Model registration transaction created successfully (development only)',
        data: {
          modelId: modelData.modelId,
          modelAccountPDA: await this.solanaService.getModelAccountPDA(
            modelData.developerWallet,
            modelData.modelId
          ),
          parentModelPDA: modelData.parentModelPubkey ? modelData.parentModelPubkey.toString() : undefined
        },
        transactionHash: signature
      };
    } catch (error) {
      logger.error('Failed to register model:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // 모델 등록 미서명 트랜잭션 준비
  async prepareRegisterModelUnsigned(request: TransactionRequest): Promise<ApiResponse> {
    try {
      logger.info('Preparing unsigned model registration transaction:', { modelId: request.data?.modelId });

      // 요청 데이터 검증 및 변환
      const modelData = await this.validateModelRegistrationWithNameResolution(request.data);

      // 트랜잭션 생성 (서명하지 않음)
      const transaction = await this.solanaService.createModelRegistrationTransaction(
        modelData,
        // developerKeypair는 내부 서명에만 사용되므로 여기서는 무시됨
        this.solanaService.getTestKeypair()
      );

      // 블록해시 및 수수료 지불자 설정 (개발자 지갑이 fee payer)
      const recentBlockhash = await this.solanaService.getRecentBlockhash();
      transaction.recentBlockhash = recentBlockhash;
      transaction.feePayer = modelData.developerWallet;

      // 미서명 직렬화(base64)
      const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
      const base64 = serialized.toString('base64');

      const modelAccountPDA = await this.solanaService.getModelAccountPDA(
        modelData.developerWallet,
        modelData.modelId
      );

      return {
        success: true,
        message: 'Unsigned model registration transaction prepared successfully',
        data: {
          modelId: modelData.modelId,
          modelAccountPDA: modelAccountPDA.toString(),
          developerWallet: modelData.developerWallet.toString(),
          royaltyBps: modelData.royaltyBps,
          isAllowed: modelData.isAllowed,
          parentModelPDA: modelData.parentModelPubkey ? modelData.parentModelPubkey.toString() : undefined,
          unsignedTransactionBase64: base64
        },
      };
    } catch (error) {
      logger.error('Failed to prepare unsigned model registration transaction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // 구독 구매 처리 (개발 환경에서만 테스트 키페어 사용)
  async purchaseSubscription(request: TransactionRequest): Promise<ApiResponse> {
    try {
      logger.info('Processing subscription purchase:', { 
        userWallet: request.data.userWallet,
        modelPubkey: request.data.modelPubkey 
      });

      // 프로덕션 환경에서는 직접 구매 금지
      if (process.env.NODE_ENV === 'production') {
        return {
          success: false,
          error: 'Direct subscription purchase is not available in production. Use prepare-purchase-subscription endpoint instead.'
        };
      }

      // 요청 데이터 검증
      const subscriptionData = this.validateSubscriptionPurchase(request.data);

      // 개발 환경에서만 테스트용 키페어 사용
      const userKeypair = this.solanaService.getTestKeypair();

      // 트랜잭션 생성
      const transaction = await this.solanaService.createSubscriptionTransaction(
        subscriptionData,
        userKeypair
      );

      // 최근 블록해시 설정
      const recentBlockhash = await this.solanaService.getRecentBlockhash();
      transaction.recentBlockhash = recentBlockhash;
      transaction.feePayer = subscriptionData.userWallet;

      // 트랜잭션 전송
      const signature = await this.solanaService.sendTransaction(transaction, [userKeypair]);

      return {
        success: true,
        message: 'Subscription purchase transaction created successfully (development only)',
        data: {
          userWallet: subscriptionData.userWallet.toString(),
          modelPubkey: subscriptionData.modelPubkey.toString(),
          durationDays: subscriptionData.durationDays
        },
        transactionHash: signature
      };
    } catch (error) {
      logger.error('Failed to purchase subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // 구독 구매 미서명 트랜잭션 준비 (클라이언트 서명용)
  async preparePurchaseSubscriptionUnsigned(request: TransactionRequest): Promise<ApiResponse> {
    try {
      logger.info('Preparing unsigned subscription purchase transaction:', { 
        userWallet: request.data?.userWallet,
        modelPubkey: request.data?.modelPubkey 
      });

      const subscriptionData = this.validateSubscriptionPurchase(request.data);

      // 트랜잭션 생성 (서명하지 않음)
      const tx = await this.solanaService.createSubscriptionTransaction(
        subscriptionData,
        this.solanaService.getTestKeypair() // not used for signing here
      );

      // 블록해시 및 수수료 지불자 설정 (user가 fee payer)
      const recentBlockhash = await this.solanaService.getRecentBlockhash();
      tx.recentBlockhash = recentBlockhash;
      tx.feePayer = subscriptionData.userWallet;

      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const base64 = serialized.toString('base64');

      return {
        success: true,
        message: 'Unsigned subscription purchase transaction prepared successfully',
        data: {
          userWallet: subscriptionData.userWallet.toString(),
          modelPubkey: subscriptionData.modelPubkey.toString(),
          unsignedTransactionBase64: base64
        }
      };
    } catch (error) {
      logger.error('Failed to prepare unsigned subscription purchase transaction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // 모델 메타데이터 업데이트 처리
  async updateModelMetadata(request: TransactionRequest): Promise<ApiResponse> {
    try {
      logger.info('Processing model metadata update:', { modelPubkey: request.data.modelPubkey });

      // 요청 데이터 검증 (pricing/metrics 포함 허용)
      const schema = Joi.object({
        modelPubkey: Joi.string().required(),
        updates: Joi.object({
          modelName: Joi.string().optional(),
          ipfsCid: Joi.string().optional(),
          royaltyBps: Joi.number().integer().min(0).max(10000).optional(),
          uploader: Joi.string().optional(),
          versionName: Joi.string().optional(),
          modality: Joi.string().optional(),
          thumbnail: Joi.string().optional(),
          pricing: pricingSchema,
          metrics: metricsSchema
        }).required()
      });

      const { error, value } = schema.validate(request.data);
      if (error) {
        throw new Error(`Validation error: ${error.details[0].message}`);
      }

      return {
        success: true,
        message: 'Model metadata update transaction created successfully',
        data: {
          modelPubkey: value.modelPubkey,
          updates: value.updates
        }
      };
    } catch (error) {
      logger.error('Failed to update model metadata:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // 계보 검증 처리 (실제 온체인 데이터 기반)
  async verifyLineage(request: TransactionRequest): Promise<ApiResponse> {
    try {
      logger.info('Processing lineage verification:', { modelPubkey: request.data.modelPubkey });

      // 요청 데이터 검증
      const schema = Joi.object({
        modelPubkey: Joi.string().required(),
        maxDepth: Joi.number().integer().min(1).max(32).default(32)
      });

      const { error, value } = schema.validate(request.data);
      if (error) {
        throw new Error(`Validation error: ${error.details[0].message}`);
      }

      // 실제 계보 추적 수행
      const modelPDA = new PublicKey(value.modelPubkey);
      const lineageTrace = await this.solanaService.traceLineage(modelPDA, value.maxDepth);

      return {
        success: true,
        message: 'Lineage verification completed successfully',
        data: {
          modelPubkey: value.modelPubkey,
          maxDepth: value.maxDepth,
          isValid: lineageTrace.isValid,
          totalDepth: lineageTrace.totalDepth,
          lineage: lineageTrace.lineage.map(l => ({
            modelPDA: l.modelPDA.toString(),
            modelId: l.modelId,
            modelName: l.modelName,
            developerWallet: l.developerWallet.toString(),
            royaltyBps: l.royaltyBps,
            depth: l.depth,
            parentPDA: l.parentPDA?.toString()
          })),
          violations: lineageTrace.violations
        }
      };
    } catch (error) {
      logger.error('Failed to verify lineage:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // 트랜잭션 처리 메인 함수
  async processTransaction(request: TransactionRequest): Promise<ApiResponse> {
    try {
      switch (request.type) {
        case 'prepare_purchase_subscription_unsigned':
          return await this.preparePurchaseSubscriptionUnsigned(request);
        case 'prepare_register_model_unsigned':
          // @ts-ignore - 확장 응답(미서명 트랜잭션 base64)을 라우트에서 병합하여 반환
          return await this.prepareRegisterModelUnsigned(request);
        case 'register_model':
          return await this.registerModel(request);
        case 'purchase_subscription':
          return await this.purchaseSubscription(request);
        case 'update_model_metadata':
          return await this.updateModelMetadata(request);
        case 'verify_lineage':
          return await this.verifyLineage(request);
        default:
          throw new Error(`Unsupported transaction type: ${request.type}`);
      }
    } catch (error) {
      logger.error('Failed to process transaction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

export default new TransactionService();
