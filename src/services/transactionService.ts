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

  // 모델 등록 요청 검증 (새 스마트 계약 구조에 맞게 단순화)
  private async validateModelRegistrationWithNameResolution(data: any): Promise<ModelData> {
    // 🔄 외부 백엔드는 기존처럼 모든 필드를 보내지만, 백엔드가 자동으로 metadata_json으로 변환
    
    // 1) 필수 핵심 필드 추출
    const modelName = data.modelName || data.name;
    const cidRoot = data.cidRoot;
    const walletAddress = data.walletAddress;
    
    // 2) parentModelPDA 처리 (lineage 또는 직접 필드)
    let parentModelPDA: string | undefined;
    if (data.lineage && data.lineage.parentModelId) {
      parentModelPDA = data.lineage.parentModelId;
    } else {
      parentModelPDA = data.parentModelPDA;
    }
    
    // 3) 나머지 모든 필드를 metadata_json에 포함
    const metadataFields: any = {};
    
    // 외부 백엔드에서 온 모든 필드를 metadata에 추가 (핵심 필드 제외)
    const excludeFields = ['name', 'modelName', 'cidRoot', 'walletAddress', 'parentModelPDA', 'lineage', 'creatorPubkey', 'priceLamports'];
    
    for (const [key, value] of Object.entries(data)) {
      if (!excludeFields.includes(key) && value !== undefined && value !== null) {
        metadataFields[key] = value;
      }
    }
    
    // 4) metadata_json 생성 및 크기 검증 (최대 4096자)
    const metadataJson = JSON.stringify(metadataFields);
    
    if (metadataJson.length > 4096) {
      throw new Error(`Metadata too large: ${metadataJson.length} characters (max 4096). Please reduce the size of metadata fields.`);
    }
    
    // 5) 필수 필드 검증
    const schema = Joi.object({
      modelName: Joi.string().max(64).required(),
      cidRoot: Joi.string().max(128).required(),
      walletAddress: Joi.string().required(),
      parentModelPDA: Joi.string().optional(),
      metadataJson: Joi.string().max(4096).required(),
      creatorPubkey: Joi.string().optional(),
      priceLamports: Joi.number().integer().min(0).optional()
    });
    
    const validationData = {
      modelName,
      cidRoot,
      walletAddress,
      parentModelPDA,
      metadataJson,
      creatorPubkey: data.creatorPubkey,
      priceLamports: data.priceLamports
    };
    
    const { error, value } = schema.validate(validationData);
    if (error) {
      throw new Error(`Validation error: ${error.details[0].message}`);
    }
    
    // 6) creatorPubkey가 없으면 서버 기본값 사용
    const creatorPubkeyStr = value.creatorPubkey || process.env.DEFAULT_CREATOR_PUBKEY;
    if (!creatorPubkeyStr) {
      throw new Error('creatorPubkey is required (provide in request or set DEFAULT_CREATOR_PUBKEY)');
    }
    
    // 7) parentModelPDA 처리
    const parentPubkey = value.parentModelPDA ? new PublicKey(value.parentModelPDA) : undefined;
    
    logger.info('✅ Model registration validated:', {
      modelName: value.modelName,
      cidRoot: value.cidRoot,
      metadataSize: metadataJson.length,
      hasParent: !!parentPubkey,
      walletAddress: value.walletAddress
    });
    
    // 8) ModelData 반환 (새 스마트 계약 구조에 맞게)
    // 기존 ModelData 타입과 호환성을 위해 빈 값들을 제공
    return {
      modelName: value.modelName,
      cidRoot: value.cidRoot,
      walletAddress: new PublicKey(value.walletAddress || creatorPubkeyStr),
      developerWallet: new PublicKey(creatorPubkeyStr),
      parentModelPubkey: parentPubkey,
      
      // metadata_json에 포함될 필드들 (실제로는 metadataJson 문자열로 변환됨)
      metadataJson: value.metadataJson,
      
      // 하위 호환성을 위한 빈 필드들 (실제로는 사용 안됨)
      uploader: metadataFields.uploader || '',
      versionName: metadataFields.versionName || '',
      modality: metadataFields.modality || '',
      license: metadataFields.license || '',
      pricing: metadataFields.pricing || {},
      releaseDate: metadataFields.releaseDate || '',
      overview: metadataFields.overview || '',
      releaseNotes: metadataFields.releaseNotes || '',
      thumbnail: metadataFields.thumbnail || '',
      metrics: metadataFields.metrics || {},
      technicalSpecs: metadataFields.technicalSpecs || {},
      sample: metadataFields.sample || {},
      encryptionKey: metadataFields.encryptionKey || '',
      relationship: metadataFields.relationship || (parentPubkey ? 'derived' : 'root'),
      priceLamports: value.priceLamports
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
      // royaltyBps removed for new smart contract
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
      logger.info('Processing model registration:', { modelName: request.data.modelName });

      // 요청 데이터 검증
      const modelData = await this.validateModelRegistrationWithNameResolution(request.data);
      // 서버 트레저리 키로 서명/전송
      const treasuryKeypair = this.solanaService.getTreasuryKeypair();

      // 트랜잭션 생성
      const transaction = await this.solanaService.createModelRegistrationTransaction(
        modelData,
        treasuryKeypair
      );

      // 트랜잭션 전송(트레저리 서명)
      const signature = await this.solanaService.sendTransaction(transaction, [treasuryKeypair]);

      return {
        success: true,
        message: 'Model registration transaction created successfully (development only)',
        data: {
          modelAccountPDA: await this.solanaService.getModelAccountPDA(
            modelData.developerWallet,
            modelData.modelName
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
      logger.info('Preparing unsigned model registration transaction:', { modelName: request.data?.modelName });

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
        modelData.modelName
      );

      return {
        success: true,
        message: 'Unsigned model registration transaction prepared successfully',
        data: {
          modelAccountPDA: modelAccountPDA.toString(),
          developerWallet: modelData.developerWallet.toString(),
          // royaltyBps removed for new smart contract
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
          // royaltyBps removed for new smart contract
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
            modelName: l.modelName,
            developerWallet: l.developerWallet.toString(),
            // royaltyBps removed for new smart contract
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
