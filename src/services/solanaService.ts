import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Keypair,
  VersionedTransaction,
  Commitment
} from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { ModelData, SubscriptionData, RoyaltyDistribution, LineageInfo, LineageTrace } from '../types';

export class SolanaService {
  private connection: Connection;
  private programId: PublicKey;
  private testKeypair: Keypair | null = null;

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    this.programId = new PublicKey(process.env.PROGRAM_ID || 'GUrLuMj8yCB2T4NKaJSVqrAWWCMPMf1qtBSnDR8ytYwB');
    this.initializeTestKeypair();
  }

  // Anchor discriminator 계산 (sha256("global:<method>")의 첫 8바이트)
  private getAnchorDiscriminator(method: string): Buffer {
    const hash = crypto.createHash('sha256').update(`global:${method}`).digest();
    return hash.subarray(0, 8);
  }

  // Anchor/Borsh 문자열 인코딩: u32 LE 길이 + 바이트
  private encodeBorshString(value: string): Buffer {
    const data = Buffer.from(value, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(data.length, 0);
    return Buffer.concat([len, data]);
  }

  // 프로덕션 환경에서는 테스트 키페어 사용 금지
  private initializeTestKeypair() {
    if (process.env.NODE_ENV === 'production') {
      logger.info('Production environment detected - test keypair disabled');
      return;
    }
    
    try {
      if (process.env.TEST_PRIVATE_KEY) {
        const privateKeyBytes = Buffer.from(process.env.TEST_PRIVATE_KEY, 'base64');
        this.testKeypair = Keypair.fromSecretKey(privateKeyBytes);
        logger.info('Test keypair initialized for development:', { 
          publicKey: this.testKeypair.publicKey.toString() 
        });
      } else {
        logger.warn('TEST_PRIVATE_KEY not found in environment variables');
      }
    } catch (error) {
      logger.error('Failed to initialize test keypair:', error);
    }
  }

  // 테스트용 키페어 가져오기 (개발 환경에서만)
  getTestKeypair(): Keypair {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Test keypair is not available in production environment. Use client-signed transactions instead.');
    }
    
    if (!this.testKeypair) {
      throw new Error('Test keypair not initialized. Please set TEST_PRIVATE_KEY in environment variables.');
    }
    return this.testKeypair;
  }

  // 모델 계정 PDA 생성
  async getModelAccountPDA(developerWallet: PublicKey, modelId: string): Promise<PublicKey> {
    const [pda] = await PublicKey.findProgramAddress(
      [
        Buffer.from('model'),
        developerWallet.toBuffer(),
        Buffer.from(modelId)
      ],
      this.programId
    );
    return pda;
  }

  // 구독 영수증 PDA 생성
  async getSubscriptionReceiptPDA(modelPubkey: PublicKey, userWallet: PublicKey): Promise<PublicKey> {
    const [pda] = await PublicKey.findProgramAddress(
      [
        Buffer.from('receipt'),
        modelPubkey.toBuffer(),
        userWallet.toBuffer()
      ],
      this.programId
    );
    return pda;
  }

  // 계정 잔액 확인
  async getBalance(publicKey: PublicKey): Promise<number> {
    try {
      const balance = await this.connection.getBalance(publicKey);
      return balance;
    } catch (error) {
      logger.error('Failed to get balance:', error);
      throw error;
    }
  }

  // 계정 정보 조회
  async getAccountInfo(publicKey: PublicKey) {
    try {
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      return accountInfo;
    } catch (error) {
      logger.error('Failed to get account info:', error);
      throw error;
    }
  }

  // 모델 등록 트랜잭션 생성
  async createModelRegistrationTransaction(
    modelData: ModelData,
    developerKeypair: Keypair
  ): Promise<Transaction> {
    try {
      const modelAccountPDA = await this.getModelAccountPDA(
        modelData.developerWallet,
        modelData.modelId
      );

      const transaction = new Transaction();

      // Anchor 디스크리미네이터 동적 계산 및 Borsh 직렬화로 데이터 구성
      const createModelDiscriminator = this.getAnchorDiscriminator('create_model');

      const royalty = Buffer.alloc(2);
      royalty.writeUInt16LE(modelData.royaltyBps, 0);

      const instructionData = Buffer.concat([
        createModelDiscriminator,
        this.encodeBorshString(modelData.modelId),
        this.encodeBorshString(modelData.modelName),
        this.encodeBorshString(modelData.ipfsCid),
        royalty,
        Buffer.from([modelData.isAllowed ? 1 : 0])
      ]);

      const keys = [
        { pubkey: modelAccountPDA, isSigner: false, isWritable: true },
        { pubkey: modelData.developerWallet, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ] as { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[];

      // 부모 모델 PDA가 제공된 경우, 참조 계정으로 포함 (읽기 전용)
      if (modelData.parentModelPubkey) {
        keys.push({ pubkey: modelData.parentModelPubkey, isSigner: false, isWritable: false });
      }

      const createModelInstruction = new TransactionInstruction({
        keys,
        programId: this.programId,
        data: instructionData
      });

      transaction.add(createModelInstruction);

      logger.info('Model registration transaction created:', {
        modelId: modelData.modelId,
        modelAccountPDA: modelAccountPDA.toString(),
        instructionDataLength: instructionData.length,
        discriminator: Array.from(createModelDiscriminator).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to create model registration transaction:', error);
      throw error;
    }
  }

  // 구독 구매 트랜잭션 생성 (계보 기반 로열티 분배)
  async createSubscriptionTransaction(
    subscriptionData: SubscriptionData,
    userKeypair: Keypair
  ): Promise<Transaction> {
    try {
      const subscriptionReceiptPDA = await this.getSubscriptionReceiptPDA(
        subscriptionData.modelPubkey,
        subscriptionData.userWallet
      );

      const transaction = new Transaction();

      // Anchor 디스크리미네이터 동적 계산 및 Borsh 직렬화로 데이터 구성
      const purchaseSubscriptionDiscriminator = this.getAnchorDiscriminator('purchase_subscription');

      const duration = Buffer.alloc(4);
      duration.writeUInt32LE(subscriptionData.durationDays, 0);

      const instructionData = Buffer.concat([
        purchaseSubscriptionDiscriminator,
        duration
      ]);

      const purchaseSubscriptionInstruction = new TransactionInstruction({
        keys: [
          { pubkey: subscriptionReceiptPDA, isSigner: false, isWritable: true },
          { pubkey: subscriptionData.userWallet, isSigner: true, isWritable: true },
          { pubkey: subscriptionData.modelPubkey, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
        ],
        programId: this.programId,
        data: instructionData
      });

      transaction.add(purchaseSubscriptionInstruction);

      // 계보 추적 및 로열티 분배 계산
      const lineageTrace = await this.traceLineage(subscriptionData.modelPubkey);
      const platformFeeBps = subscriptionData.platformFeeBps ?? parseInt(process.env.PLATFORM_FEE_BPS || '500');
      const minRoyaltyLamports = subscriptionData.minRoyaltyLamports ?? parseInt(process.env.MIN_ROYALTY_LAMPORTS || '1000');
      
      const royaltyDistribution = this.calculateLineageRoyaltyDistribution(
        subscriptionData.expectedPriceLamports,
        lineageTrace,
        platformFeeBps,
        minRoyaltyLamports
      );

      // 플랫폼 수수료 전송
      const platformWalletEnv = process.env.PLATFORM_FEE_WALLET;
      const platformWallet = subscriptionData.platformFeeWallet || (platformWalletEnv ? new PublicKey(platformWalletEnv) : undefined);
      
      if (platformWallet && royaltyDistribution.platformAmount > 0) {
        transaction.add(SystemProgram.transfer({
          fromPubkey: subscriptionData.userWallet,
          toPubkey: platformWallet,
          lamports: royaltyDistribution.platformAmount
        }));
      }

      // 계보 기반 로열티 전송 (부모부터 시작)
      for (const lineageRoyalty of royaltyDistribution.lineageRoyalties) {
        transaction.add(SystemProgram.transfer({
          fromPubkey: subscriptionData.userWallet,
          toPubkey: lineageRoyalty.developerWallet,
          lamports: lineageRoyalty.amount
        }));
      }

      // 메인 개발자 수익 전송
      if (subscriptionData.modelDeveloperWallet && royaltyDistribution.developerAmount > 0) {
        transaction.add(SystemProgram.transfer({
          fromPubkey: subscriptionData.userWallet,
          toPubkey: subscriptionData.modelDeveloperWallet,
          lamports: royaltyDistribution.developerAmount
        }));
      }

      logger.info('Subscription purchase transaction created with lineage-based royalties:', {
        modelPubkey: subscriptionData.modelPubkey.toString(),
        userWallet: subscriptionData.userWallet.toString(),
        durationDays: subscriptionData.durationDays,
        lineageDepth: lineageTrace.totalDepth,
        lineageValid: lineageTrace.isValid,
        platformAmount: royaltyDistribution.platformAmount,
        lineageRoyaltiesCount: royaltyDistribution.lineageRoyalties.length,
        totalLineageAmount: royaltyDistribution.totalLineageAmount,
        developerAmount: royaltyDistribution.developerAmount,
        instructionDataLength: instructionData.length
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to create subscription transaction:', error);
      throw error;
    }
  }

  // 모델 계정 데이터 디코딩 (Borsh 형식)
  private decodeModelAccountData(accountData: Buffer): LineageInfo | null {
    try {
      // 실제 온체인 프로그램의 데이터 레이아웃에 맞춰 수정 필요
      // 여기서는 예시 구조를 사용
      let offset = 0;
      
      // discriminator (8 bytes) 건너뛰기
      offset += 8;
      
      // model_id (string)
      const modelIdLength = accountData.readUInt32LE(offset);
      offset += 4;
      const modelId = accountData.subarray(offset, offset + modelIdLength).toString('utf8');
      offset += modelIdLength;
      
      // model_name (string)
      const modelNameLength = accountData.readUInt32LE(offset);
      offset += 4;
      const modelName = accountData.subarray(offset, offset + modelNameLength).toString('utf8');
      offset += modelNameLength;
      
      // developer_wallet (32 bytes)
      const developerWallet = new PublicKey(accountData.subarray(offset, offset + 32));
      offset += 32;
      
      // royalty_bps (2 bytes)
      const royaltyBps = accountData.readUInt16LE(offset);
      offset += 2;
      
      // depth (2 bytes)
      const depth = accountData.readUInt16LE(offset);
      offset += 2;
      
      // parent_model (Option<Pubkey> - 1 byte + 32 bytes if Some)
      const hasParent = accountData.readUInt8(offset) === 1;
      offset += 1;
      let parentPDA: PublicKey | undefined;
      if (hasParent) {
        parentPDA = new PublicKey(accountData.subarray(offset, offset + 32));
      }
      
      return {
        modelPDA: new PublicKey(''), // 실제 PDA는 호출자에서 설정
        developerWallet,
        modelId,
        modelName,
        royaltyBps,
        depth,
        parentPDA
      };
    } catch (error) {
      logger.error('Failed to decode model account data:', error);
      return null;
    }
  }

  // 계보 추적 (루트까지)
  async traceLineage(modelPDA: PublicKey, maxDepth: number = 32): Promise<LineageTrace> {
    const lineage: LineageInfo[] = [];
    const violations: string[] = [];
    let currentPDA = modelPDA;
    let depth = 0;

    try {
      while (currentPDA && depth < maxDepth) {
        // 모델 계정 정보 조회
        const accountInfo = await this.getAccountInfo(currentPDA);
        if (!accountInfo || !accountInfo.data) {
          violations.push(`Model account not found: ${currentPDA.toString()}`);
          break;
        }

        // 계정 데이터 디코딩
        const lineageInfo = this.decodeModelAccountData(accountInfo.data);
        if (!lineageInfo) {
          violations.push(`Failed to decode model account: ${currentPDA.toString()}`);
          break;
        }

        // PDA 설정
        lineageInfo.modelPDA = currentPDA;
        lineage.push(lineageInfo);

        // 부모 모델로 이동
        if (lineageInfo.parentPDA) {
          currentPDA = lineageInfo.parentPDA;
          depth++;
        } else {
          // 루트 모델에 도달
          break;
        }
      }

      // 깊이 검증
      if (depth >= maxDepth) {
        violations.push(`Maximum lineage depth exceeded: ${depth}`);
      }

      // 순환 참조 검증
      const pdaSet = new Set(lineage.map(l => l.modelPDA.toString()));
      if (pdaSet.size !== lineage.length) {
        violations.push('Circular reference detected in lineage');
      }

      return {
        lineage,
        totalDepth: depth,
        isValid: violations.length === 0,
        violations: violations.length > 0 ? violations : undefined
      };
    } catch (error) {
      logger.error('Failed to trace lineage:', error);
      return {
        lineage,
        totalDepth: depth,
        isValid: false,
        violations: [`Lineage tracing failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  // 계보 기반 로열티 분배 계산
  calculateLineageRoyaltyDistribution(
    totalLamports: number,
    lineageTrace: LineageTrace,
    platformFeeBps: number = parseInt(process.env.PLATFORM_FEE_BPS || '500'),
    minRoyaltyLamports: number = parseInt(process.env.MIN_ROYALTY_LAMPORTS || '1000')
  ): RoyaltyDistribution {
    const platformAmount = Math.floor(totalLamports * platformFeeBps / 10000);
    let remainingAmount = totalLamports - platformAmount;
    const lineageRoyalties: RoyaltyDistribution['lineageRoyalties'] = [];
    let totalLineageAmount = 0;

    // 계보를 따라 로열티 계산 (부모부터 시작)
    for (let i = lineageTrace.lineage.length - 1; i >= 0; i--) {
      const lineageInfo = lineageTrace.lineage[i];
      const royaltyAmount = Math.floor(totalLamports * lineageInfo.royaltyBps / 10000);
      
      // 최소 단위 이하면 중단
      if (royaltyAmount < minRoyaltyLamports) {
        logger.info(`Stopping lineage royalty at depth ${i}: amount ${royaltyAmount} < min ${minRoyaltyLamports}`);
        break;
      }

      // 잔액 부족하면 중단
      if (royaltyAmount > remainingAmount) {
        logger.info(`Stopping lineage royalty at depth ${i}: insufficient remaining amount`);
        break;
      }

      lineageRoyalties.push({
        modelPDA: lineageInfo.modelPDA,
        developerWallet: lineageInfo.developerWallet,
        modelName: lineageInfo.modelName,
        depth: lineageInfo.depth,
        amount: royaltyAmount,
        royaltyBps: lineageInfo.royaltyBps
      });

      totalLineageAmount += royaltyAmount;
      remainingAmount -= royaltyAmount;
    }

    return {
      totalLamports,
      platformAmount,
      developerAmount: remainingAmount,
      lineageRoyalties,
      totalLineageAmount,
      remainingAmount
    };
  }

  // 기존 로열티 분배 계산 (하위 호환성)
  calculateRoyaltyDistribution(
    totalLamports: number,
    royaltyBps: number
  ): RoyaltyDistribution {
    const platformFeeBps = parseInt(process.env.PLATFORM_FEE_BPS || '500');
    
    const platformAmount = Math.floor(totalLamports * platformFeeBps / 10000);
    const royaltyAmount = Math.floor(totalLamports * royaltyBps / 10000);
    const developerAmount = totalLamports - platformAmount - royaltyAmount;

    return {
      totalLamports,
      platformAmount,
      developerAmount,
      lineageRoyalties: [],
      totalLineageAmount: royaltyAmount,
      remainingAmount: developerAmount
    };
  }

  // 트랜잭션 전송
  async sendTransaction(
    transaction: Transaction,
    signers: Keypair[]
  ): Promise<string> {
    try {
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        signers,
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed'
        }
      );

      logger.info('Transaction sent successfully:', { signature });
      return signature;
    } catch (error) {
      logger.error('Failed to send transaction:', error);
      throw error;
    }
  }

  // base64 인코딩된 서명된 트랜잭션 전송
  async sendRawTransactionBase64(
    serializedTransactionBase64: string,
    options?: { skipPreflight?: boolean; maxRetries?: number; commitment?: Commitment }
  ): Promise<string> {
    try {
      const raw = Buffer.from(serializedTransactionBase64, 'base64');
      const signature = await this.connection.sendRawTransaction(raw, {
        skipPreflight: options?.skipPreflight ?? false,
        maxRetries: options?.maxRetries,
        preflightCommitment: options?.commitment ?? 'confirmed'
      });

      await this.connection.confirmTransaction({
        signature,
        ...(await this.connection.getLatestBlockhash())
      }, options?.commitment ?? 'confirmed');

      logger.info('Raw transaction sent successfully:', { signature });
      return signature;
    } catch (error) {
      logger.error('Failed to send raw transaction:', error);
      throw error;
    }
  }

  // base64 인코딩된 트랜잭션 시뮬레이션
  async simulateRawTransactionBase64(
    serializedTransactionBase64: string
  ) {
    try {
      const raw = Buffer.from(serializedTransactionBase64, 'base64');
      let simulationResult;

      try {
        // 우선 VersionedTransaction으로 시도
        const vtx = VersionedTransaction.deserialize(raw);
        simulationResult = await this.connection.simulateTransaction(vtx, {
          sigVerify: true,
          commitment: 'processed'
        });
      } catch {
        // 구버전 Transaction으로 재시도 (옵션 없이 기본 시뮬레이션)
        const legacyTx = Transaction.from(raw);
        simulationResult = await this.connection.simulateTransaction(legacyTx);
      }

      return simulationResult;
    } catch (error) {
      logger.error('Failed to simulate raw transaction:', error);
      throw error;
    }
  }

  // 트랜잭션 상태 확인
  async getTransactionStatus(signature: string) {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      return status;
    } catch (error) {
      logger.error('Failed to get transaction status:', error);
      throw error;
    }
  }

  // 최근 블록 해시 가져오기
  async getRecentBlockhash() {
    try {
      const { blockhash } = await this.connection.getRecentBlockhash();
      return blockhash;
    } catch (error) {
      logger.error('Failed to get recent blockhash:', error);
      throw error;
    }
  }

  // 간단한 SOL 전송 테스트 (SystemProgram.transfer 사용)
  async createSimpleTransferTransaction(
    fromKeypair: Keypair,
    toPublicKey: PublicKey,
    lamports: number
  ): Promise<Transaction> {
    try {
      const transaction = new Transaction();
      
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports: lamports
      });

      transaction.add(transferInstruction);
      return transaction;
    } catch (error) {
      logger.error('Failed to create simple transfer transaction:', error);
      throw error;
    }
  }

  // SystemProgram을 사용한 계정 생성 테스트 (모델 등록 시뮬레이션)
  async createAccountCreationTransaction(
    payer: Keypair,
    newAccount: PublicKey,
    space: number,
    programId: PublicKey
  ): Promise<Transaction> {
    try {
      const transaction = new Transaction();
      
      const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: newAccount,
        lamports: await this.connection.getMinimumBalanceForRentExemption(space),
        space: space,
        programId: programId
      });

      transaction.add(createAccountInstruction);
      return transaction;
    } catch (error) {
      logger.error('Failed to create account creation transaction:', error);
      throw error;
    }
  }
}

export default new SolanaService();
