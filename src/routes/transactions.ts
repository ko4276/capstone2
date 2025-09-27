import { Router, Request, Response } from 'express';
import { TransactionService } from '../services/transactionService';
import { SolanaService } from '../services/solanaService';
import { logger } from '../utils/logger';
import { TransactionRequest } from '../types';

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

// raw 트랜잭션 전송
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
