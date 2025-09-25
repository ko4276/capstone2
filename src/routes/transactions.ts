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

// SystemProgram을 사용한 계정 생성 테스트
router.post('/test-create-account', async (req: Request, res: Response) => {
  try {
    const { space } = req.body;

    if (!space) {
      return res.status(400).json({
        success: false,
        error: 'space is required'
      });
    }

    const payer = solanaService.getTestKeypair();
    const { Keypair } = await import('@solana/web3.js');
    const newAccount = Keypair.generate();
    const programId = new (await import('@solana/web3.js')).PublicKey('GUrLuMj8yCB2T4NKaJSVqrAWWCMPMf1qtBSnDR8ytYwB');

    // 계정 생성 트랜잭션 생성
    const transaction = await solanaService.createAccountCreationTransaction(
      payer,
      newAccount.publicKey,
      parseInt(space),
      programId
    );

    // 최근 블록해시 설정
    const recentBlockhash = await solanaService.getRecentBlockhash();
    transaction.recentBlockhash = recentBlockhash;
    transaction.feePayer = payer.publicKey;

    // 트랜잭션 전송
    const signature = await solanaService.sendTransaction(transaction, [payer, newAccount]);

    res.json({
      success: true,
      message: 'Account creation transaction sent successfully',
      data: {
        payer: payer.publicKey.toString(),
        newAccount: newAccount.publicKey.toString(),
        space: parseInt(space),
        signature
      }
    });
  } catch (error) {
    logger.error('Failed to send test create account:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 간단한 SOL 전송 테스트
router.post('/test-transfer', async (req: Request, res: Response) => {
  try {
    const { toPublicKey, lamports } = req.body;

    if (!toPublicKey || !lamports) {
      return res.status(400).json({
        success: false,
        error: 'toPublicKey and lamports are required'
      });
    }

    const fromKeypair = solanaService.getTestKeypair();
    const toPubkey = new (await import('@solana/web3.js')).PublicKey(toPublicKey);

    // 간단한 전송 트랜잭션 생성
    const transaction = await solanaService.createSimpleTransferTransaction(
      fromKeypair,
      toPubkey,
      parseInt(lamports)
    );

    // 최근 블록해시 설정
    const recentBlockhash = await solanaService.getRecentBlockhash();
    transaction.recentBlockhash = recentBlockhash;
    transaction.feePayer = fromKeypair.publicKey;

    // 트랜잭션 전송
    const signature = await solanaService.sendTransaction(transaction, [fromKeypair]);

    res.json({
      success: true,
      message: 'Simple transfer transaction sent successfully',
      data: {
        from: fromKeypair.publicKey.toString(),
        to: toPublicKey,
        lamports: parseInt(lamports),
        signature
      }
    });
  } catch (error) {
    logger.error('Failed to send test transfer:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

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
