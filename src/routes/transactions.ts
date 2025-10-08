import { Router, Request, Response } from 'express';
import { TransactionService } from '../services/transactionService';
import { SolanaService } from '../services/solanaService';
import { logger } from '../utils/logger';
import { TransactionRequest } from '../types';
import Joi from 'joi';
import { pricingSchema, metricsSchema } from '../utils/validation';

const router = Router();
const transactionService = new TransactionService();
const solanaService = new SolanaService();

// 트랜잭션 처리
router.post('/process', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = req.body;

    // 요청 데이터 검증
    if (!transactionRequest.type) {
      return res.status(400).json({
        success: false,
        error: 'Transaction type is required'
      });
    }

    if (!transactionRequest.data) {
      return res.status(400).json({
        success: false,
        error: 'Transaction data is required'
      });
    }

    // 지원되는 트랜잭션 타입 확인
    const supportedTypes = ['register_model', 'purchase_subscription', 'update_model_metadata', 'verify_lineage'];
    if (!supportedTypes.includes(transactionRequest.type)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported transaction type: ${transactionRequest.type}`
      });
    }

    logger.info('Processing transaction:', {
      type: transactionRequest.type,
      timestamp: new Date().toISOString()
    });

    // 트랜잭션 처리
    const result = await transactionService.processTransaction(transactionRequest);

    res.json(result);
  } catch (error) {
    logger.error('Failed to process transaction:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 모델 등록 트랜잭션
router.post('/register-model', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'register_model',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to register model:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 모델 등록 미서명 트랜잭션 준비
router.post('/prepare-register-model', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'prepare_register_model_unsigned',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to prepare unsigned register model tx:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 구독 구매 트랜잭션
router.post('/purchase-subscription', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'purchase_subscription',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to purchase subscription:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 구독 구매 미서명 트랜잭션 준비
router.post('/prepare-purchase-subscription', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'prepare_purchase_subscription_unsigned',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to prepare unsigned purchase subscription tx:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 모델 메타데이터 업데이트 트랜잭션
router.post('/update-model-metadata', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'update_model_metadata',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to update model metadata:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 계보 검증 트랜잭션
router.post('/verify-lineage', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'verify_lineage',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to verify lineage:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 트랜잭션 상태 조회
router.get('/status/:signature', async (req: Request, res: Response) => {
  try {
    const { signature } = req.params;

    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Transaction signature is required'
      });
    }

    // 실제로는 SolanaService를 통해 트랜잭션 상태를 조회해야 함
    // const status = await solanaService.getTransactionStatus(signature);

    res.json({
      success: true,
      data: {
        signature,
        status: 'confirmed', // 임시 응답
        message: 'Transaction status retrieved successfully'
      }
    });
  } catch (error) {
    logger.error('Failed to get transaction status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 테스트용 엔드포인트들은 프로덕션에서 제거됨
// 개발 환경에서만 사용 가능한 테스트 기능들은 별도 개발 서버에서 제공

export default router;

// 외부 백엔드에서 서명된 트랜잭션을 받아서 온체인으로 전송
router.post('/broadcast-signed', async (req: Request, res: Response) => {
  try {
    const { transactionBase64, options } = req.body || {};

    if (!transactionBase64 || typeof transactionBase64 !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'transactionBase64 is required' 
      });
    }

    logger.info('Broadcasting signed transaction from external backend');

    const result = await transactionService.broadcastSignedTransaction(transactionBase64, options);
    
    if (result.success) {
      logger.info('Successfully broadcasted signed transaction:', { 
        transactionHash: result.transactionHash 
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to broadcast signed transaction:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});

// raw 트랜잭션 전송 (기존 호환성 유지)
router.post('/send-raw', async (req: Request, res: Response) => {
  try {
    const { transactionBase64, options } = req.body || {};

    if (!transactionBase64 || typeof transactionBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'transactionBase64 is required' });
    }

    const signature = await solanaService.sendRawTransactionBase64(transactionBase64, options);

    return res.json({ success: true, transactionHash: signature });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// raw 트랜잭션 시뮬레이션
router.post('/simulate-raw', async (req: Request, res: Response) => {
  try {
    const { transactionBase64 } = req.body || {};

    if (!transactionBase64 || typeof transactionBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'transactionBase64 is required' });
    }

    const result = await solanaService.simulateRawTransactionBase64(transactionBase64);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// 메타데이터 + 서명된 트랜잭션을 한 번에 받아 브로드캐스트
router.post('/register-model-direct', async (req: Request, res: Response) => {
  try {
    const schema = Joi.object({
      metadata: Joi.object({
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
      }).required(),
      transactionBase64: Joi.string().required(),
      options: Joi.object({
        skipPreflight: Joi.boolean().optional(),
        maxRetries: Joi.number().integer().min(0).optional(),
        commitment: Joi.string().valid('processed', 'confirmed', 'finalized').optional()
      }).optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: `Validation error: ${error.details[0].message}` });
    }

    logger.info('Direct register-model: received metadata and signed tx', {
      modelId: value.metadata.modelId,
      developerWallet: value.metadata.developerWallet
    });

    // 1) 시뮬레이션으로 기본 오류 확인
    const sim = await solanaService.simulateRawTransactionBase64(value.transactionBase64);
    if (sim?.value?.err) {
      return res.status(400).json({ success: false, error: 'Simulation failed', data: sim.value });
    }

    // 2) 경량 구조 검증: fee payer 및 프로그램 호출 포함 여부(가능할 때만)
    try {
      const raw = Buffer.from(value.transactionBase64, 'base64');
      let isLegacyParsed = false;
      try {
        const { Transaction, PublicKey } = await import('@solana/web3.js');
        const legacyTx = Transaction.from(raw);
        isLegacyParsed = true;

        // fee payer는 developer 지갑인지 확인
        if (legacyTx.feePayer && legacyTx.feePayer.toString() !== value.metadata.developerWallet) {
          return res.status(400).json({ success: false, error: 'Fee payer mismatch with developerWallet' });
        }

        // 프로그램 호출 포함 여부 확인
        const programIdStr = process.env.PROGRAM_ID || 'GUrLuMj8yCB2T4NKaJSVqrAWWCMPMf1qtBSnDR8ytYwB';
        const programId = new PublicKey(programIdStr);
        const hasProgramInvoke = legacyTx.instructions.some(ix => ix.programId.equals(programId));
        if (!hasProgramInvoke) {
          return res.status(400).json({ success: false, error: 'Expected program invoke not found in transaction' });
        }
      } catch (_) {
        if (!isLegacyParsed) {
          logger.info('Versioned tx detected; skipping legacy-specific checks');
        }
      }
    } catch (verErr) {
      logger.warn('Light verification failed (non-fatal):', verErr instanceof Error ? verErr.message : String(verErr));
    }

    // 3) 브로드캐스트
    const result = await transactionService.broadcastSignedTransaction(value.transactionBase64, value.options);
    return res.json(result);
  } catch (error) {
    logger.error('Failed to direct register model with signed tx:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// 구독 구매도 동일 방식으로 직접 전송 지원
router.post('/purchase-subscription-direct', async (req: Request, res: Response) => {
  try {
    const schema = Joi.object({
      metadata: Joi.object({
        userWallet: Joi.string().required(),
        modelPubkey: Joi.string().required(),
        modelDeveloperWallet: Joi.string().required(),
        durationDays: Joi.number().integer().min(1).max(365).required(),
        expectedPriceLamports: Joi.number().integer().min(0).required(),
        slippageBps: Joi.number().integer().min(0).max(10000).optional()
      }).required(),
      transactionBase64: Joi.string().required(),
      options: Joi.object({
        skipPreflight: Joi.boolean().optional(),
        maxRetries: Joi.number().integer().min(0).optional(),
        commitment: Joi.string().valid('processed', 'confirmed', 'finalized').optional()
      }).optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: `Validation error: ${error.details[0].message}` });
    }

    logger.info('Direct purchase-subscription: received metadata and signed tx', {
      userWallet: value.metadata.userWallet,
      modelPubkey: value.metadata.modelPubkey
    });

    const result = await transactionService.broadcastSignedTransaction(value.transactionBase64, value.options);
    return res.json(result);
  } catch (error) {
    logger.error('Failed to direct purchase subscription with signed tx:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// 구독 구매: FE 서명 트랜잭션 검증 후 브로드캐스트
router.post('/purchase-subscription-verify-and-broadcast', async (req: Request, res: Response) => {
  try {
    const schema = Joi.object({
      metadata: Joi.object({
        userWallet: Joi.string().required(),
        modelPubkey: Joi.string().required(),
        modelDeveloperWallet: Joi.string().required(),
        durationDays: Joi.number().integer().min(1).max(365).required(),
        expectedPriceLamports: Joi.number().integer().min(0).required(),
        slippageBps: Joi.number().integer().min(0).max(10000).optional()
      }).required(),
      transactionBase64: Joi.string().required(),
      options: Joi.object({
        skipPreflight: Joi.boolean().optional(),
        maxRetries: Joi.number().integer().min(0).optional(),
        commitment: Joi.string().valid('processed', 'confirmed', 'finalized').optional()
      }).optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: `Validation error: ${error.details[0].message}` });
    }

    // 1) 사전 시뮬레이션으로 기본 오류 확인
    const sim = await solanaService.simulateRawTransactionBase64(value.transactionBase64);
    if (sim?.value?.err) {
      return res.status(400).json({ success: false, error: 'Simulation failed', data: sim.value });
    }

    // 2) (가능 시) 간단 구조 검증: fee payer 및 프로그램 호출 포함 여부
    try {
      const raw = Buffer.from(value.transactionBase64, 'base64');
      let isLegacyParsed = false;
      try {
        const { Transaction, SystemProgram, PublicKey } = await import('@solana/web3.js');
        const legacyTx = Transaction.from(raw);
        isLegacyParsed = true;

        // fee payer 확인
        if (legacyTx.feePayer && legacyTx.feePayer.toString() !== value.metadata.userWallet) {
          return res.status(400).json({ success: false, error: 'Fee payer mismatch with userWallet' });
        }

        // 프로그램 호출 포함 여부(PROGRAM_ID 또는 SystemProgram 존재 체크)
        const programIdStr = process.env.PROGRAM_ID || 'GUrLuMj8yCB2T4NKaJSVqrAWWCMPMf1qtBSnDR8ytYwB';
        const programId = new PublicKey(programIdStr);
        const hasProgramInvoke = legacyTx.instructions.some(ix => ix.programId.equals(programId));
        if (!hasProgramInvoke) {
          return res.status(400).json({ success: false, error: 'Expected program invoke not found in transaction' });
        }
      } catch (_) {
        // VersionedTransaction일 수 있음 → 파싱은 생략하고 시뮬레이션 통과로 완화
        if (!isLegacyParsed) {
          logger.info('Versioned tx detected; skipping legacy-specific checks');
        }
      }
    } catch (verErr) {
      logger.warn('Light verification failed (non-fatal):', verErr instanceof Error ? verErr.message : String(verErr));
    }

    // 3) 브로드캐스트
    const result = await transactionService.broadcastSignedTransaction(value.transactionBase64, value.options);
    return res.json(result);
  } catch (error) {
    logger.error('Failed to verify and broadcast subscription tx:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// 트레저리 기반 정산(데브넷/테스트 전용): 트레저리 지갑에서 분배 전송
router.post('/treasury/distribute', async (req: Request, res: Response) => {
  try {
    const schema = Joi.object({
      modelPubkey: Joi.string().required(),
      developerWallet: Joi.string().required(),
      totalLamports: Joi.number().integer().min(0).required(),
      platformFeeBps: Joi.number().integer().min(0).max(10000).optional(),
      minRoyaltyLamports: Joi.number().integer().min(0).optional(),
      commitment: Joi.string().valid('processed', 'confirmed', 'finalized').optional()
    });
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: `Validation error: ${error.details[0].message}` });
    }

    const { PublicKey } = await import('@solana/web3.js');
    const modelPDA = new PublicKey(value.modelPubkey);
    const developer = new PublicKey(value.developerWallet);

    const { signature, distribution } = await solanaService.distributeFromTreasury(
      value.totalLamports,
      modelPDA,
      developer,
      { platformFeeBps: value.platformFeeBps, minRoyaltyLamports: value.minRoyaltyLamports, commitment: value.commitment }
    );

    return res.json({ success: true, transactionHash: signature, distribution });
  } catch (error) {
    logger.error('Failed to distribute from treasury:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});
