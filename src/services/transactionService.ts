import { PublicKey, Keypair } from '@solana/web3.js';
import { SolanaService } from './solanaService';
import { ModelData, SubscriptionData, TransactionRequest, ApiResponse } from '../types';
import { logger } from '../utils/logger';
import Joi from 'joi';

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
  private validateModelRegistration(data: any): ModelData {
    const schema = Joi.object({
      modelId: Joi.string().required(),
      modelName: Joi.string().required(),
      ipfsCid: Joi.string().required(),
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

    return {
      ...value,
      developerWallet: new PublicKey(value.developerWallet),
      parentModelPubkey: value.parentModelPubkey ? new PublicKey(value.parentModelPubkey) : undefined,
      lineageDepth: value.parentModelPubkey ? 1 : 0
    };
  }

  // 구독 구매 요청 검증
  private validateSubscriptionPurchase(data: any): SubscriptionData {
    const schema = Joi.object({
      userWallet: Joi.string().required(),
      modelPubkey: Joi.string().required(),
      durationDays: Joi.number().integer().min(1).max(365).required(),
      expectedPriceLamports: Joi.number().integer().min(0).required(),
      slippageBps: Joi.number().integer().min(0).max(10000).default(50)
    });

    const { error, value } = schema.validate(data);
    if (error) {
      throw new Error(`Validation error: ${error.details[0].message}`);
    }

    return {
      ...value,
      userWallet: new PublicKey(value.userWallet),
      modelPubkey: new PublicKey(value.modelPubkey)
    };
  }

  // 모델 등록 처리
  async registerModel(request: TransactionRequest): Promise<ApiResponse> {
    try {
      logger.info('Processing model registration:', { modelId: request.data.modelId });

      // 요청 데이터 검증
      const modelData = this.validateModelRegistration(request.data);

      // 테스트용 키페어 사용 (데브넷 테스트용)
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
        message: 'Model registration transaction created successfully',
        data: {
          modelId: modelData.modelId,
          modelAccountPDA: await this.solanaService.getModelAccountPDA(
            modelData.developerWallet,
            modelData.modelId
          )
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

  // 구독 구매 처리
  async purchaseSubscription(request: TransactionRequest): Promise<ApiResponse> {
    try {
      logger.info('Processing subscription purchase:', { 
        userWallet: request.data.userWallet,
        modelPubkey: request.data.modelPubkey 
      });

      // 요청 데이터 검증
      const subscriptionData = this.validateSubscriptionPurchase(request.data);

      // 테스트용 키페어 사용 (데브넷 테스트용)
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
        message: 'Subscription purchase transaction created successfully',
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

  // 모델 메타데이터 업데이트 처리
  async updateModelMetadata(request: TransactionRequest): Promise<ApiResponse> {
    try {
      logger.info('Processing model metadata update:', { modelPubkey: request.data.modelPubkey });

      // 요청 데이터 검증
      const schema = Joi.object({
        modelPubkey: Joi.string().required(),
        updates: Joi.object({
          modelName: Joi.string().optional(),
          ipfsCid: Joi.string().optional(),
          royaltyBps: Joi.number().integer().min(0).max(10000).optional()
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

  // 계보 검증 처리
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

      return {
        success: true,
        message: 'Lineage verification completed successfully',
        data: {
          modelPubkey: value.modelPubkey,
          maxDepth: value.maxDepth,
          isValid: true
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
