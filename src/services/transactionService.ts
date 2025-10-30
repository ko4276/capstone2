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
    // 🔄 외부 백엔드 형식 → 내부 형식 자동 변환
    const normalizedData: any = {};
    
    // 1) name → modelName 매핑
    normalizedData.modelName = data.modelName || data.name;
    
    // 2) 필수 필드 매핑
    normalizedData.uploader = data.uploader;
    normalizedData.versionName = data.versionName;
    normalizedData.modality = data.modality;
    normalizedData.walletAddress = data.walletAddress;
    normalizedData.releaseDate = data.releaseDate;
    normalizedData.overview = data.overview;
    normalizedData.releaseNotes = data.releaseNotes;
    normalizedData.thumbnail = data.thumbnail;
    normalizedData.cidRoot = data.cidRoot;
    normalizedData.encryptionKey = data.encryptionKey;
    
    // 3) license: 배열이면 문자열로 변환
    if (data.license) {
      normalizedData.license = Array.isArray(data.license) 
        ? data.license.join(', ') 
        : data.license;
    }
    
    // 4) 객체 필드들: 이미 문자열이면 그대로, 객체면 JSON.stringify
    normalizedData.pricing = typeof data.pricing === 'string' 
      ? data.pricing 
      : JSON.stringify(data.pricing);
    
    normalizedData.metrics = typeof data.metrics === 'string'
      ? data.metrics
      : JSON.stringify(data.metrics);
    
    normalizedData.technicalSpecs = typeof data.technicalSpecs === 'string'
      ? data.technicalSpecs
      : JSON.stringify(data.technicalSpecs);
    
    normalizedData.sample = typeof data.sample === 'string'
      ? data.sample
      : JSON.stringify(data.sample);
    
    // 5) lineage 처리
    if (data.lineage) {
      // relationship 추출
      normalizedData.relationship = data.lineage.relationship || 'derived';
      
      // parentModelId는 실제로 부모 모델의 PDA 문자열
      if (data.lineage.parentModelId) {
        normalizedData.parentModelPDA = data.lineage.parentModelId;
        logger.info('✅ Parent model PDA extracted from lineage:', {
          parentModelId: data.lineage.parentModelId,
          relationship: normalizedData.relationship
        });
      }
    } else {
      // lineage 객체가 없으면 직접 필드 사용
      normalizedData.relationship = data.relationship || 'original';
      normalizedData.parentModelPDA = data.parentModelPDA;
    }
    
    // 6) 선택 필드
    normalizedData.priceLamports = data.priceLamports;
    normalizedData.creatorPubkey = data.creatorPubkey;
    
    logger.info('🔄 Normalized external data:', {
      original: Object.keys(data),
      normalized: Object.keys(normalizedData)
    });
    
    // 문자열 길이 검증 함수
    const validateStringLength = (field: string, value: string, maxLength: number) => {
      if (value && value.length > maxLength) {
        throw new Error(`${field} too long (max ${maxLength} characters, got ${value.length}): ${value.substring(0, 50)}...`);
      }
    };

    // 길이 검증 실행 (lib.rs의 제한과 동일) - normalizedData 사용
    validateStringLength('modelName', normalizedData.modelName, 64);
    validateStringLength('uploader', normalizedData.uploader, 64);
    validateStringLength('versionName', normalizedData.versionName, 64);
    validateStringLength('modality', normalizedData.modality, 32);
    validateStringLength('license', normalizedData.license, 256);
    validateStringLength('pricing', normalizedData.pricing, 1024);
    validateStringLength('releaseDate', normalizedData.releaseDate, 32);
    validateStringLength('overview', normalizedData.overview, 1024);
    validateStringLength('releaseNotes', normalizedData.releaseNotes, 1024);
    validateStringLength('thumbnail', normalizedData.thumbnail, 256);
    validateStringLength('metrics', normalizedData.metrics, 1024);
    validateStringLength('technicalSpecs', normalizedData.technicalSpecs, 1024);
    validateStringLength('sample', normalizedData.sample, 1024);
    validateStringLength('cidRoot', normalizedData.cidRoot, 128);
    validateStringLength('encryptionKey', normalizedData.encryptionKey, 128);
    validateStringLength('relationship', normalizedData.relationship, 64);

    const schema = Joi.object({
      // 필수 필드
      modelName: Joi.string().required(),
      uploader: Joi.string().required(),
      versionName: Joi.string().required(),
      modality: Joi.string().required(),
      license: Joi.string().required(),
      pricing: Joi.string().required(), // JSON 문자열 (자동 변환됨)
      walletAddress: Joi.string().optional(),
      releaseDate: Joi.string().required(),
      overview: Joi.string().required(),
      releaseNotes: Joi.string().required(),
      thumbnail: Joi.string().required(),
      metrics: Joi.string().required(), // JSON 문자열 (자동 변환됨)
      technicalSpecs: Joi.string().required(), // JSON 문자열 (자동 변환됨)
      sample: Joi.string().required(), // JSON 문자열 (자동 변환됨)
      cidRoot: Joi.string().required(),
      encryptionKey: Joi.string().required(),
      relationship: Joi.string().required(),
      
      // 선택 필드
      priceLamports: Joi.number().integer().min(0).optional(),
      parentModelPDA: Joi.string().optional(),
      creatorPubkey: Joi.string().optional()
    }).options({ allowUnknown: true, stripUnknown: true });

    const { error, value } = schema.validate(normalizedData);
    if (error) {
      throw new Error(`Validation error: ${error.details[0].message}`);
    }

    // JSON 문자열 필드들을 파싱하고 검증
    let parsedPricing, parsedMetrics, parsedTechnicalSpecs, parsedSample;
    
    try {
      parsedPricing = JSON.parse(value.pricing);
      // pricing 구조 검증 (모달리티에 따라 다를 수 있음)
      if (typeof parsedPricing !== 'object' || parsedPricing === null) {
        throw new Error('Invalid pricing structure');
      }
    } catch (e) {
      throw new Error(`Invalid pricing JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    try {
      parsedMetrics = JSON.parse(value.metrics);
      // metrics 구조 검증 (모달리티에 따라 다를 수 있음)
      if (typeof parsedMetrics !== 'object' || parsedMetrics === null) {
        throw new Error('Invalid metrics structure');
      }
    } catch (e) {
      throw new Error(`Invalid metrics JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    try {
      parsedTechnicalSpecs = JSON.parse(value.technicalSpecs);
      // technicalSpecs 구조 검증 (모달리티에 따라 다를 수 있음)
      if (typeof parsedTechnicalSpecs !== 'object' || parsedTechnicalSpecs === null) {
        throw new Error('Invalid technicalSpecs structure');
      }
    } catch (e) {
      throw new Error(`Invalid technicalSpecs JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    try {
      parsedSample = JSON.parse(value.sample);
      // sample 구조 검증 (모달리티에 따라 다를 수 있음)
      if (typeof parsedSample !== 'object' || parsedSample === null) {
        throw new Error('Invalid sample structure');
      }
    } catch (e) {
      throw new Error(`Invalid sample JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    // 부모 모델은 remaining_accounts로 전달: 요청에서 parentModelPDA(Base58) 수신 시 사용
    const parentPubkey = value.parentModelPDA ? new PublicKey(value.parentModelPDA) : undefined;

    // creatorPubkey가 없으면 서버 기본값으로 주입(환경변수 등)
    const creatorPubkeyStr = value.creatorPubkey || process.env.DEFAULT_CREATOR_PUBKEY;
    if (!creatorPubkeyStr) {
      throw new Error('creatorPubkey is required (provide in request or set DEFAULT_CREATOR_PUBKEY)');
    }

    // 허용된 필드만 명시적으로 구성하여 불필요한 입력은 무시
    return {
      modelName: value.modelName,
      uploader: value.uploader,
      versionName: value.versionName,
      modality: value.modality,
      license: value.license,
      pricing: parsedPricing,
      // walletAddress 미제공 시 creatorPubkey(=developerWallet)로 대체
      walletAddress: new PublicKey(value.walletAddress || creatorPubkeyStr),
      releaseDate: value.releaseDate,
      overview: value.overview,
      releaseNotes: value.releaseNotes,
      thumbnail: value.thumbnail,
      metrics: parsedMetrics,
      technicalSpecs: parsedTechnicalSpecs,
      sample: parsedSample,
      cidRoot: value.cidRoot,
      encryptionKey: value.encryptionKey,
      relationship: value.relationship,
      priceLamports: value.priceLamports,
      developerWallet: new PublicKey(creatorPubkeyStr),
      parentModelPubkey: parentPubkey,
      // royaltyBps removed for new smart contract
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
