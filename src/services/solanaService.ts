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
  private treasuryKeypair: Keypair | null = null;

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    this.programId = new PublicKey(process.env.PROGRAM_ID || 'AiZSvcFJJd6dKzqXvk6QU3PUjyRvMnvB9VpLyLokDxqF');
    this.initializeTestKeypair();
    this.initializeTreasuryKeypair();
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

  // Option<Pubkey> Borsh 직렬화: 1바이트(Some/None) + 32바이트(Pubkey)
  private encodeBorshOptionPubkey(pubkey: PublicKey | null): Buffer {
    if (pubkey) {
      return Buffer.concat([
        Buffer.from([1]), // Some
        pubkey.toBuffer()
      ]);
    } else {
      return Buffer.from([0]); // None
    }
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
      // 프로덕션 환경에서는 더미 키페어 반환 (실제 서명에는 사용되지 않음)
      logger.info('Production environment: returning dummy keypair for transaction creation');
      return Keypair.generate(); // 더미 키페어 생성
    }
    
    if (!this.testKeypair) {
      throw new Error('Test keypair not initialized. Please set TEST_PRIVATE_KEY in environment variables.');
    }
    return this.testKeypair;
  }

  // 서버 트레저리 키페어 초기화 (개발/테스트/데브넷 용도)
  private initializeTreasuryKeypair() {
    try {
      // 1) 파일 경로 우선: TREASURY_KEYPAIR_PATH (JSON 배열 형식, solana-keygen 기본 형식)
      const keypairPath = process.env.TREASURY_KEYPAIR_PATH;
      if (keypairPath) {
        const fs = require('fs');
        const path = require('path');
        const resolved = path.isAbsolute(keypairPath) ? keypairPath : path.resolve(process.cwd(), keypairPath);
        const raw = fs.readFileSync(resolved, 'utf-8');
        const json = JSON.parse(raw);
        if (!Array.isArray(json)) throw new Error('Invalid keypair file format: expected JSON array');
        const secret = Uint8Array.from(json);
        this.treasuryKeypair = Keypair.fromSecretKey(secret);
        logger.info('Treasury keypair initialized from file path', { publicKey: this.treasuryKeypair.publicKey.toString(), path: resolved });
        return;
      }

      const base58 = process.env.TREASURY_PRIVATE_KEY;
      const base64 = process.env.TREASURY_PRIVATE_KEY_BASE64;
      if (base58) {
        const secret = Buffer.from(require('bs58').decode(base58));
        this.treasuryKeypair = Keypair.fromSecretKey(secret);
        logger.info('Treasury keypair initialized from base58', { publicKey: this.treasuryKeypair.publicKey.toString() });
        return;
      }
      if (base64) {
        const secret = Buffer.from(base64, 'base64');
        this.treasuryKeypair = Keypair.fromSecretKey(secret);
        logger.info('Treasury keypair initialized from base64', { publicKey: this.treasuryKeypair.publicKey.toString() });
        return;
      }
      // 2) 암시적 기본: ./treasury.json 가 있으면 사용
      try {
        const fs = require('fs');
        const path = require('path');
        const fallback = path.resolve(process.cwd(), 'treasury.json');
        if (fs.existsSync(fallback)) {
          const raw = fs.readFileSync(fallback, 'utf-8');
          const json = JSON.parse(raw);
          if (Array.isArray(json)) {
            const secret = Uint8Array.from(json);
            this.treasuryKeypair = Keypair.fromSecretKey(secret);
            logger.info('Treasury keypair initialized from default ./treasury.json', { publicKey: this.treasuryKeypair.publicKey.toString(), path: fallback });
            return;
          }
        }
      } catch {}

      logger.warn('TREASURY key not configured; treasury-based settlements disabled');
    } catch (error) {
      logger.error('Failed to initialize treasury keypair:', error);
    }
  }

  getTreasuryKeypair(): Keypair {
    if (!this.treasuryKeypair) {
      throw new Error('Treasury keypair not initialized. Set TREASURY_PRIVATE_KEY or TREASURY_PRIVATE_KEY_BASE64');
    }
    return this.treasuryKeypair;
  }

  // 모델 계정 PDA 생성 (model_name 기반) - Anchor 정확한 방식
  async getModelAccountPDA(creatorPubkey: PublicKey, modelName: string): Promise<PublicKey> {
    // lib.rs의 정확한 시드 순서: [b"model", creator_pubkey.as_ref(), model_name.as_bytes()]
    
    // 시드 1: "model" 문자열 (정확히 5바이트)
    const seed0 = Buffer.from('model', 'utf8');
    
    // 시드 2: creator_pubkey (32바이트)
    const seed1 = creatorPubkey.toBuffer();
    
    // 시드 3: model_name (UTF-8 바이트 배열)
    const seed2 = Buffer.from(modelName, 'utf8');
    
    const seeds = [seed0, seed1, seed2];
    
    logger.info('PDA 생성 시드 (정확한 Anchor 방식):', {
      programId: this.programId.toString(),
      seed0: seed0.toString('hex'),
      seed1: seed1.toString('hex'),
      seed2: seed2.toString('hex'),
      creatorPubkey: creatorPubkey.toString(),
      modelName: modelName
    });
    
    // Anchor의 findProgramAddressSync 사용
    const [pda, bump] = PublicKey.findProgramAddressSync(seeds, this.programId);
    
    logger.info('생성된 PDA (정확한 Anchor 방식):', {
      pda: pda.toString(),
      bump: bump,
      expectedPDA: '4uagqxrGxqY1GEJ54ipKvaun3UFCd1JyVYZDHGijmD8H'
    });
    
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

  // 계정 정보 조회 (재시도 로직 포함)
  async getAccountInfo(publicKey: PublicKey, maxRetries: number = 3, delayMs: number = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const accountInfo = await this.connection.getAccountInfo(publicKey);
        if (accountInfo && accountInfo.data) {
          logger.info('Account info retrieved successfully:', {
            publicKey: publicKey.toString(),
            attempt,
            dataLength: accountInfo.data.length
          });
          return accountInfo;
        } else {
          logger.warn('Account not found or no data:', {
            publicKey: publicKey.toString(),
            attempt,
            accountInfo: accountInfo ? 'exists but no data' : 'null'
          });
          if (attempt < maxRetries) {
            logger.info(`Retrying in ${delayMs}ms... (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      } catch (error) {
        logger.error('Failed to get account info:', {
          publicKey: publicKey.toString(),
          attempt,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        if (attempt < maxRetries) {
          logger.info(`Retrying in ${delayMs}ms... (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          throw error;
        }
      }
    }
    return null;
  }

  // 모델 등록 트랜잭션 생성
  // 모델 등록 트랜잭션 생성
async createModelRegistrationTransaction(
  modelData: ModelData,
  developerKeypair: Keypair
): Promise<Transaction> {
  try {
    const treasury = this.getTreasuryKeypair();
    const modelAccountPDA = await this.getModelAccountPDA(
      modelData.developerWallet,
      modelData.modelName
    );

    const transaction = new Transaction();

    // Anchor 디스크리미네이터 동적 계산 및 Borsh 직렬화로 데이터 구성
    const createModelDiscriminator = this.getAnchorDiscriminator('create_model');

    // 새로운 스마트 계약에 맞는 JSON 메타데이터 구조
    const metadataJson = JSON.stringify({
      uploader: modelData.uploader,
      versionName: modelData.versionName,
      modality: modelData.modality,
      license: modelData.license,
      pricing: modelData.pricing,
      walletAddress: modelData.walletAddress.toString(),
      releaseDate: modelData.releaseDate,
      overview: modelData.overview,
      releaseNotes: modelData.releaseNotes,
      thumbnail: modelData.thumbnail,
      metrics: modelData.metrics,
      technicalSpecs: modelData.technicalSpecs,
      sample: modelData.sample,
      cidRoot: modelData.cidRoot,
      encryptionKey: modelData.encryptionKey,
      relationship: modelData.relationship
    });

    // 부모 모델 PDA 처리 (Option<Pubkey>)
    const parentModelPubkey = modelData.parentModelPubkey || null;

    // 새로운 스마트 계약 인스트럭션 데이터 (creator_pubkey 제거)
    const instructionData = Buffer.concat([
      createModelDiscriminator,
      this.encodeBorshString(modelData.modelName),     // model_name: String
      this.encodeBorshString(metadataJson),          // metadata_json: String
      this.encodeBorshString(modelData.cidRoot),     // cid_root: String
      this.encodeBorshOptionPubkey(parentModelPubkey) // parent_model_pubkey: Option<Pubkey>
    ]);

    // 새로운 스마트 계약 디버깅 로깅 (creator_pubkey 제거)
    logger.info('Smart contract instruction data (no creator_pubkey):', {
      discriminator: Array.from(createModelDiscriminator).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', '),
      totalLength: instructionData.length,
      modelName: modelData.modelName,
      metadataJsonLength: metadataJson.length,
      cidRoot: modelData.cidRoot,
      parentModelPubkey: parentModelPubkey?.toString(),
      creator: modelData.developerWallet.toString(),
      optionPubkeySerialized: this.encodeBorshOptionPubkey(parentModelPubkey).toString('hex')
    });

    // 새로운 스마트 계약 컨텍스트에 맞는 키 배열
    // 새로운 스마트 계약 컨텍스트에 맞는 키 배열
    const keys = [
      { pubkey: modelAccountPDA, isSigner: false, isWritable: true }, // model_account
      { pubkey: modelData.developerWallet, isSigner: false, isWritable: false }, // creator (개발환경에서는 서명하지 않음)
      { pubkey: treasury.publicKey, isSigner: true, isWritable: true }, // treasury
    ];

    // parentModelPubkey가 있으면 parent_model_account 위치에 추가
    if (parentModelPubkey) {
      keys.push({ pubkey: parentModelPubkey, isSigner: false, isWritable: false }); // parent_model_account
    } else {
      // parentModelPubkey가 없어도 더미 계정 추가 (스마트계약이 5개 계정을 기대함)
      keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }); // 더미 parent_model_account
    }

    // system_program은 항상 마지막에 추가
    keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }); // system_program
        
    const createModelInstruction = new TransactionInstruction({
      keys,
      programId: this.programId,
      data: instructionData
    });

    transaction.add(createModelInstruction);

    // 수수료 지불자도 트레저리로 설정 (호출부에서 재설정 가능)
    const recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.recentBlockhash = recentBlockhash;
    transaction.feePayer = treasury.publicKey;

    logger.info('Fixed model registration transaction created:', {
      modelAccountPDA: modelAccountPDA.toString(),
      parentModelPubkey: parentModelPubkey?.toString(),
      treasury: treasury.publicKey.toString(),
      creator: modelData.developerWallet.toString(),
      instructionDataLength: instructionData.length,
      keysCount: keys.length,
      hasParentAccount: !!parentModelPubkey
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

      const instructionData = Buffer.concat([
        purchaseSubscriptionDiscriminator
      ]);

      const purchaseSubscriptionInstruction = new TransactionInstruction({
        keys: [
          { pubkey: subscriptionReceiptPDA, isSigner: false, isWritable: true },
          { pubkey: subscriptionData.userWallet, isSigner: true, isWritable: true },
          { pubkey: subscriptionData.modelPubkey, isSigner: false, isWritable: true },
          { pubkey: this.getTreasuryKeypair().publicKey, isSigner: true, isWritable: true },
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

  // 모델 계정 데이터 디코딩 (Anchor/Borsh) - lib.rs의 ModelAccount 레이아웃과 일치
  // 모델 계정 데이터 디코딩 (Anchor/Borsh) - 새로운 스마트 계약 구조에 맞게 수정
private decodeModelAccountData(accountData: Buffer): LineageInfo | null {
  try {
    let offset = 0;

    logger.info('Starting decodeModelAccountData:', {
      dataLength: accountData.length,
      firstBytes: Array.from(accountData.subarray(0, Math.min(50, accountData.length))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')
    });

    // discriminator (8 bytes)
    offset += 8;

    // creator: Pubkey (32 bytes)
    let creator: PublicKey;
    try {
      const creatorBytes = accountData.subarray(offset, offset + 32);
      logger.info('Creator bytes:', {
        offset,
        creatorBytes: Array.from(creatorBytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')
      });
      creator = new PublicKey(creatorBytes);
      offset += 32;
      logger.info('Creator created successfully:', { creator: creator.toString() });
    } catch (error) {
      logger.error('Failed to create creator PublicKey:', error);
      logger.error('Creator bytes:', Array.from(accountData.subarray(offset, offset + 32)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      throw error;
    }

    // model_name: String (4 bytes length + string)
    const modelNameLength = accountData.readUInt32LE(offset);
    offset += 4;
    const modelName = accountData.subarray(offset, offset + modelNameLength).toString('utf8');
    offset += modelNameLength;

    // metadata_json: String (4 bytes length + string)
    const metadataJsonLength = accountData.readUInt32LE(offset);
    offset += 4;
    // metadata_json은 사용하지 않으므로 건너뛰기
    offset += metadataJsonLength;

    // cid_root: String (4 bytes length + string)
    const cidRootLength = accountData.readUInt32LE(offset);
    offset += 4;
    // cid_root는 사용하지 않으므로 건너뛰기
    offset += cidRootLength;

    // parent_model_pubkey: Option<Pubkey> (1 byte tag + 32 if Some)
    const parentTag = accountData.readUInt8(offset);
    offset += 1;
    let parentPDA: PublicKey | undefined;
    if (parentTag === 1) {
      try {
        const parentBytes = accountData.subarray(offset, offset + 32);
        logger.info('Parent PDA bytes:', {
          parentTag,
          parentBytes: Array.from(parentBytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '),
          offset
        });
        parentPDA = new PublicKey(parentBytes);
        offset += 32;
      } catch (error) {
        logger.error('Failed to create parent PDA:', error);
        logger.error('Parent bytes:', Array.from(accountData.subarray(offset, offset + 32)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        throw error;
      }
    }

    // lineage_depth: u16 (2 bytes)
    const depth = accountData.readUInt16LE(offset);
    offset += 2;

    // created_at: i64 (8 bytes)
    offset += 8;

    logger.info('Decoded model account data:', {
      creator: creator.toString(),
      modelName,
      depth,
      parentPDA: parentPDA?.toString(),
      totalOffset: offset,
      dataLength: accountData.length
    });

    // 더미 PublicKey 생성 (System Program ID 사용, 나중에 traceLineage에서 실제 값으로 교체됨)
    const dummyPDA = new PublicKey('11111111111111111111111111111111');
    
    return {
      modelPDA: dummyPDA, // 호출부에서 실제 PDA로 설정됨
      developerWallet: creator,
      modelName,
      depth,
      parentPDA
    };
  } catch (error) {
    logger.error('Failed to decode model account data:', error);
    logger.error('Account data length:', accountData.length);
    logger.error('Account data (first 100 bytes):', Array.from(accountData.subarray(0, Math.min(100, accountData.length))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
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
        logger.info('Tracing lineage:', {
          currentPDA: currentPDA.toString(),
          depth,
          maxDepth
        });

        // 모델 계정 정보 조회
        const accountInfo = await this.getAccountInfo(currentPDA);
        if (!accountInfo || !accountInfo.data) {
          logger.error('Account not found:', {
            currentPDA: currentPDA.toString(),
            accountInfo: accountInfo ? 'exists but no data' : 'null'
          });
          violations.push(`Model account not found: ${currentPDA.toString()}`);
          break;
        }

        logger.info('Account info retrieved:', {
          currentPDA: currentPDA.toString(),
          dataLength: accountInfo.data.length,
          owner: accountInfo.owner?.toString()
        });

        // 계정 데이터 디코딩
        const lineageInfo = this.decodeModelAccountData(accountInfo.data);
        if (!lineageInfo) {
          logger.error('Failed to decode account data:', {
            currentPDA: currentPDA.toString(),
            dataLength: accountInfo.data.length
          });
          violations.push(`Failed to decode model account: ${currentPDA.toString()}`);
          break;
        }

        // PDA 설정
        lineageInfo.modelPDA = currentPDA;
        lineage.push(lineageInfo);

        // 부모 모델로 이동
        if (lineageInfo.parentPDA) {
          logger.info('Moving to parent model:', {
            currentPDA: currentPDA.toString(),
            parentPDA: lineageInfo.parentPDA.toString(),
            depth: depth + 1
          });
          
          // 부모 모델 계정 정보 미리 조회하여 디버깅
          try {
            const parentAccountInfo = await this.getAccountInfo(lineageInfo.parentPDA);
            logger.info('Parent account info preview:', {
              parentPDA: lineageInfo.parentPDA.toString(),
              exists: !!parentAccountInfo,
              dataLength: parentAccountInfo?.data?.length || 0,
              owner: parentAccountInfo?.owner?.toString() || 'unknown'
            });
          } catch (error) {
            logger.error('Failed to get parent account info:', {
              parentPDA: lineageInfo.parentPDA.toString(),
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          
          currentPDA = lineageInfo.parentPDA;
          depth++;
        } else {
          // 루트 모델에 도달 (parentPDA가 undefined)
          logger.info('Reached root model (no parent):', {
            currentPDA: currentPDA.toString(),
            depth,
            parentPDA: lineageInfo.parentPDA
          });
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
      const royaltyAmount = Math.floor(totalLamports * 250 / 10000); // Default 2.5% royalty
      
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
        // royaltyBps removed for new smart contract
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

  // 트레저리에서 계보 및 개발자에게 분배 전송 (플랫폼 몫은 트레저리에 잔류)
  async distributeFromTreasury(
    totalLamports: number,
    modelPDA: PublicKey,
    developerWallet: PublicKey,
    options?: { platformFeeBps?: number; minRoyaltyLamports?: number; commitment?: Commitment }
  ): Promise<{ signature: string; distribution: ReturnType<SolanaService['calculateLineageRoyaltyDistribution']> }> {
    const treasury = this.getTreasuryKeypair();
    // 계보 추적 및 분배 계산
    const lineageTrace = await this.traceLineage(modelPDA);
    const platformFeeBps = options?.platformFeeBps ?? parseInt(process.env.PLATFORM_FEE_BPS || '500');
    const minRoyaltyLamports = options?.minRoyaltyLamports ?? parseInt(process.env.MIN_ROYALTY_LAMPORTS || '1000');
    const distribution = this.calculateLineageRoyaltyDistribution(totalLamports, lineageTrace, platformFeeBps, minRoyaltyLamports);

    // 트랜잭션 구성: 트레저리 -> 각 수취인 전송 (플랫폼 몫은 남김)
    const tx = new Transaction();

    for (const lr of distribution.lineageRoyalties) {
      if (lr.amount > 0) {
        tx.add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: lr.developerWallet, lamports: lr.amount }));
      }
    }
    if (distribution.developerAmount > 0) {
      tx.add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: developerWallet, lamports: distribution.developerAmount }));
    }

    const recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.recentBlockhash = recentBlockhash;
    tx.feePayer = treasury.publicKey;

    const signature = await this.sendTransaction(tx, [treasury]);
    return { signature, distribution };
  }

  // 기존 로열티 분배 계산 (하위 호환성)
  calculateRoyaltyDistribution(
    totalLamports: number,
    // royaltyBps removed for new smart contract
  ): RoyaltyDistribution {
    const platformFeeBps = parseInt(process.env.PLATFORM_FEE_BPS || '500');
    
    const platformAmount = Math.floor(totalLamports * platformFeeBps / 10000);
    const royaltyAmount = Math.floor(totalLamports * 250 / 10000); // Default 2.5% royalty
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

  // 트랜잭션 정보 조회
  async getTransactionInfo(signature: string) {
    try {
      const transaction = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      return transaction;
    } catch (error) {
      logger.error('Failed to get transaction info:', error);
      throw error;
    }
  }

  // ComputeBudget Program ID (필터링용)
  private readonly COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
  
  // Memo Program ID (메타데이터 추출용)
  private readonly MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

  // 트랜잭션에서 구독 영수증 PDA 추출
  async extractSubscriptionReceiptPDAFromTransaction(transactionInfo: any): Promise<PublicKey | null> {
    try {
      if (!transactionInfo || !transactionInfo.transaction) {
        return null;
      }

      const transaction = transactionInfo.transaction;
      const message = transaction.message;
      let accountKeys: any[] = [];
      let instructions: any[] = [];

      try {
        if (typeof message.getAccountKeys === 'function') {
          const result = message.getAccountKeys();
          
          // getAccountKeys()가 배열을 반환하는 경우
          if (Array.isArray(result)) {
            accountKeys = result;
          }
          // getAccountKeys()가 {staticAccountKeys: [...]} 객체를 반환하는 경우
          else if ((result as any)?.staticAccountKeys && Array.isArray((result as any).staticAccountKeys)) {
            accountKeys = (result as any).staticAccountKeys;
          }
          else {
            accountKeys = [];
          }
        } else if ((message as any).accountKeys) {
          const accountKeysObj = (message as any).accountKeys;
          if (accountKeysObj.staticAccountKeys && Array.isArray(accountKeysObj.staticAccountKeys)) {
            accountKeys = accountKeysObj.staticAccountKeys;
          } else if (Array.isArray(accountKeysObj)) {
            accountKeys = accountKeysObj;
          } else {
            accountKeys = [];
          }
        }
        
        if ((message as any).instructions) {
          instructions = (message as any).instructions;
        }
      } catch (error) {
        logger.warn('Failed to get message details for subscription PDA extraction:', error);
        return null;
      }

      logger.info('🔍 Extracting Subscription Receipt PDA from transaction:', {
        instructionsCount: instructions.length,
        accountKeysCount: accountKeys.length
      });
      
      // 우리 프로그램 호출에서 구독 영수증 PDA 찾기 (ComputeBudget instruction 제외)
      for (let i = 0; i < instructions.length; i++) {
        const instruction = instructions[i];
        if (instruction.programIdIndex !== undefined && 
            instruction.programIdIndex >= 0 && 
            instruction.programIdIndex < accountKeys.length) {
          const programId = accountKeys[instruction.programIdIndex];
          
          logger.info(`🔍 Instruction ${i}:`, {
            programId: programId ? programId.toString() : 'undefined',
            isOurProgram: programId ? programId.toString() === this.programId.toString() : false,
            isComputeBudget: programId ? programId.toString() === this.COMPUTE_BUDGET_PROGRAM_ID : false,
            accountsCount: instruction.accounts?.length || 0
          });
          
          // ComputeBudget instruction 건너뛰기
          if (programId && programId.toString() === this.COMPUTE_BUDGET_PROGRAM_ID) {
            logger.info('⏭️  Skipping ComputeBudget instruction');
            continue;
          }
          
          // 우리 프로그램 ID와 일치하는지 확인
          if (programId && programId.toString() === this.programId.toString()) {
            // 구독 트랜잭션의 경우 첫 번째 계정이 subscription_receipt PDA
            if (instruction.accounts && instruction.accounts.length > 0) {
              const subscriptionReceiptPDAIndex = instruction.accounts[0];
              if (subscriptionReceiptPDAIndex !== undefined && subscriptionReceiptPDAIndex < accountKeys.length) {
                const subscriptionReceiptPDA = new PublicKey(accountKeys[subscriptionReceiptPDAIndex]);
                logger.info('✅ Found Subscription Receipt PDA:', {
                  pda: subscriptionReceiptPDA.toString(),
                  instructionIndex: i
                });
                return subscriptionReceiptPDA;
              }
            }
          }
        }
      }

      // 로그에서 구독 PDA 찾기
      if (transactionInfo.meta && transactionInfo.meta.logMessages) {
        for (const logMessage of transactionInfo.meta.logMessages) {
          const subscriptionPDAMatch = logMessage.match(/subscription_receipt|Subscription Receipt|receipt: ([A-Za-z0-9]{32,44})/i);
          if (subscriptionPDAMatch && subscriptionPDAMatch[1]) {
            try {
              const pda = new PublicKey(subscriptionPDAMatch[1]);
              logger.info('✅ Found Subscription Receipt PDA in logs:', pda.toString());
              return pda;
            } catch (error) {
              logger.warn('Invalid subscription PDA in log:', subscriptionPDAMatch[1]);
            }
          }
        }
      }

      logger.warn('⚠️  No subscription receipt PDA found in transaction');
      return null;
    } catch (error) {
      logger.error('Failed to extract subscription receipt PDA from transaction:', error);
      return null;
    }
  }

  // 구독 영수증 PDA에서 모델 정보 추출
  async extractModelInfoFromSubscriptionReceipt(subscriptionReceiptPDA: PublicKey): Promise<{ modelPDA: PublicKey, userWallet: PublicKey } | null> {
    try {
      const accountInfo = await this.getAccountInfo(subscriptionReceiptPDA);
      if (!accountInfo) {
        logger.warn('Subscription receipt account not found:', subscriptionReceiptPDA.toString());
        return null;
      }

      // 구독 영수증 계정 데이터 파싱
      // 구조: discriminator(8) + model_pubkey(32) + user_wallet(32) + ... 
      const data = accountInfo.data;
      if (data.length < 72) { // 최소 8 + 32 + 32 바이트
        logger.warn('Subscription receipt data too short:', data.length);
        return null;
      }

      // discriminator 건너뛰고 모델 PDA와 사용자 지갑 추출
      const modelPDA = new PublicKey(data.slice(8, 40));
      const userWallet = new PublicKey(data.slice(40, 72));

      logger.info('✅ Extracted model info from subscription receipt:', {
        subscriptionReceiptPDA: subscriptionReceiptPDA.toString(),
        modelPDA: modelPDA.toString(),
        userWallet: userWallet.toString()
      });

      return { modelPDA, userWallet };
    } catch (error) {
      logger.error('Failed to extract model info from subscription receipt:', error);
      return null;
    }
  }

  // 트랜잭션에서 모델 PDA 추출 (SPL Token 트랜잭션 포함)
  async extractModelPDAFromTransaction(transactionInfo: any): Promise<PublicKey | null> {
    try {
      if (!transactionInfo || !transactionInfo.transaction) {
        return null;
      }

      const transaction = transactionInfo.transaction;
      const message = transaction.message;
      let accountKeys: any[] = [];
      let instructions: any[] = [];

      try {
        if (typeof message.getAccountKeys === 'function') {
          const result = message.getAccountKeys();
          
          // getAccountKeys()가 배열을 반환하는 경우
          if (Array.isArray(result)) {
            accountKeys = result;
          }
          // getAccountKeys()가 {staticAccountKeys: [...]} 객체를 반환하는 경우
          else if ((result as any)?.staticAccountKeys && Array.isArray((result as any).staticAccountKeys)) {
            accountKeys = (result as any).staticAccountKeys;
          }
          else {
            accountKeys = [];
          }
        } else if ((message as any).accountKeys) {
          const accountKeysObj = (message as any).accountKeys;
          // VersionedTransaction의 경우 staticAccountKeys 속성을 가질 수 있음
          if (accountKeysObj.staticAccountKeys && Array.isArray(accountKeysObj.staticAccountKeys)) {
            accountKeys = accountKeysObj.staticAccountKeys;
          } else if (Array.isArray(accountKeysObj)) {
            accountKeys = accountKeysObj;
          } else {
            accountKeys = [];
          }
        }
        
        if ((message as any).instructions) {
          instructions = (message as any).instructions;
        }
      } catch (error) {
        logger.warn('Failed to get message details for PDA extraction:', error);
        return null;
      }

      logger.info('🔍 Extracting Model PDA from transaction:', {
        instructionsCount: instructions.length,
        accountKeysCount: accountKeys.length,
        accountKeysIsArray: Array.isArray(accountKeys)
      });
      
      // 1) Memo Program instruction에서 모델 PDA 추출 (최우선)
      for (let i = 0; i < instructions.length; i++) {
        const instruction = instructions[i];
        if (instruction.programIdIndex !== undefined && 
            instruction.programIdIndex >= 0 && 
            instruction.programIdIndex < accountKeys.length) {
          const programId = accountKeys[instruction.programIdIndex];
          
          logger.info(`🔍 Instruction ${i}:`, {
            programId: programId ? programId.toString() : 'undefined',
            isMemoProgram: programId ? programId.toString() === this.MEMO_PROGRAM_ID : false,
            isComputeBudget: programId ? programId.toString() === this.COMPUTE_BUDGET_PROGRAM_ID : false,
            hasData: !!instruction.data
          });
          
          // ComputeBudget instruction 건너뛰기
          if (programId && programId.toString() === this.COMPUTE_BUDGET_PROGRAM_ID) {
            logger.info('⏭️  Skipping ComputeBudget instruction');
            continue;
          }
          
          // Memo Program instruction 찾기
          if (programId && programId.toString() === this.MEMO_PROGRAM_ID) {
            logger.info('📝 Found Memo Program instruction, extracting data...');
            
            try {
              // instruction.data는 base58 인코딩된 문자열
              let memoDataStr: string;
              
              if (typeof instruction.data === 'string') {
                // base58 디코딩
                const bs58 = require('bs58');
                const decoded = bs58.decode(instruction.data);
                memoDataStr = Buffer.from(decoded).toString('utf8');
              } else if (Buffer.isBuffer(instruction.data)) {
                memoDataStr = instruction.data.toString('utf8');
              } else if (Array.isArray(instruction.data)) {
                memoDataStr = Buffer.from(instruction.data).toString('utf8');
              } else {
                logger.warn('Unknown instruction data format:', typeof instruction.data);
                continue;
              }
              
              logger.info('📝 Memo data decoded:', { memoDataStr });
              
              // JSON 파싱 시도
              const memoData = JSON.parse(memoDataStr);
              
              // modelPDA 필드 확인
              if (memoData.modelPDA && typeof memoData.modelPDA === 'string') {
                logger.info('✅ Found Model PDA in Memo instruction:', {
                  modelPDA: memoData.modelPDA,
                  memoData
                });
                return new PublicKey(memoData.modelPDA);
              }
              
              // model_pda 필드 확인 (언더스코어 버전)
              if (memoData.model_pda && typeof memoData.model_pda === 'string') {
                logger.info('✅ Found Model PDA in Memo instruction (model_pda):', {
                  modelPDA: memoData.model_pda,
                  memoData
                });
                return new PublicKey(memoData.model_pda);
              }
              
              // pda 필드 확인 (짧은 버전)
              if (memoData.pda && typeof memoData.pda === 'string') {
                logger.info('✅ Found Model PDA in Memo instruction (pda):', {
                  modelPDA: memoData.pda,
                  memoData
                });
                return new PublicKey(memoData.pda);
              }
              
              logger.warn('⚠️  Memo data found but no modelPDA field:', { memoData });
            } catch (error) {
              logger.error('Failed to parse Memo instruction data:', error);
            }
          }
          
          // 우리 프로그램 ID와 일치하는지 확인 (백업 방법)
          if (programId && programId.toString() === this.programId.toString()) {
            if (instruction.accounts && instruction.accounts.length > 1) {
              // 구독 instruction의 경우:
              // accounts[0] = subscription_receipt PDA
              // accounts[1] = model_account PDA ⭐ 이것이 필요!
              const modelPDAIndex = instruction.accounts[1];
              
              if (modelPDAIndex !== undefined && modelPDAIndex < accountKeys.length) {
                const modelPDA = new PublicKey(accountKeys[modelPDAIndex]);
                logger.info('✅ Found Model PDA from subscription instruction:', {
                  pda: modelPDA.toString(),
                  instructionIndex: i,
                  accountIndex: 1,
                  totalAccounts: instruction.accounts.length
                });
                return modelPDA;
              }
            } else if (instruction.accounts && instruction.accounts.length > 0) {
              // 다른 instruction 타입의 경우 첫 번째 계정 시도
              const firstAccountIndex = instruction.accounts[0];
              if (firstAccountIndex !== undefined && firstAccountIndex < accountKeys.length) {
                const firstAccount = new PublicKey(accountKeys[firstAccountIndex]);
                logger.info('✅ Found potential Model PDA (first account):', {
                  pda: firstAccount.toString(),
                  instructionIndex: i,
                  accountIndex: 0
                });
                return firstAccount;
              }
            }
          }
        }
      }

      // 2) Memo 프로그램 로그에서 모델 PDA 추출 (미래 대비)
      if (transactionInfo.meta && transactionInfo.meta.logMessages) {
        for (const logMessage of transactionInfo.meta.logMessages) {
          // Memo 프로그램 로그에서 JSON 추출
          // 예: "Program log: Memo (len 225): {\"modelPDA\":\"EfP4Mp7n...\", ...}"
          const memoMatch = logMessage.match(/Program log: Memo \(len \d+\): (.+)/);
          if (memoMatch) {
            try {
              const memoContent = memoMatch[1];
              // JSON 파싱 시도
              const memoData = JSON.parse(memoContent);
              
              // modelPDA 필드 확인
              if (memoData.modelPDA && typeof memoData.modelPDA === 'string') {
                logger.info('✅ Found Model PDA in Memo:', {
                  modelPDA: memoData.modelPDA,
                  memoData
                });
                return new PublicKey(memoData.modelPDA);
              }
              
              // model_pda 필드 확인 (언더스코어 버전)
              if (memoData.model_pda && typeof memoData.model_pda === 'string') {
                logger.info('✅ Found Model PDA in Memo (model_pda):', {
                  modelPDA: memoData.model_pda,
                  memoData
                });
                return new PublicKey(memoData.model_pda);
              }
              
              // pda 필드 확인 (짧은 버전)
              if (memoData.pda && typeof memoData.pda === 'string') {
                logger.info('✅ Found Model PDA in Memo (pda):', {
                  modelPDA: memoData.pda,
                  memoData
                });
                return new PublicKey(memoData.pda);
              }
              
              logger.info('📝 Memo found but no modelPDA field:', { memoData });
            } catch (error) {
              logger.warn('Failed to parse Memo JSON:', { logMessage, error: error instanceof Error ? error.message : 'Unknown error' });
            }
          }
          
          // 로그에서 직접 모델 PDA 패턴 찾기 (폴백)
          // 예: "Model PDA: 29Gpf7JivkwAHdh8SkTkn4omuAwrAWk7K2ukHzZe4U7m"
          const modelPDAMatch = logMessage.match(/Model PDA: ([A-Za-z0-9]{32,44})/i);
          if (modelPDAMatch) {
            try {
              logger.info('✅ Found Model PDA in log (pattern match):', modelPDAMatch[1]);
              return new PublicKey(modelPDAMatch[1]);
            } catch (error) {
              logger.warn('Invalid model PDA in log:', modelPDAMatch[1]);
            }
          }
          
          // model_account 패턴으로 모델 PDA 찾기
          const pdaMatch = logMessage.match(/model_account: ([A-Za-z0-9]{32,44})/i);
          if (pdaMatch) {
            try {
              logger.info('✅ Found Model PDA in log (model_account):', pdaMatch[1]);
              return new PublicKey(pdaMatch[1]);
            } catch (error) {
              logger.warn('Invalid PDA in log:', pdaMatch[1]);
            }
          }
        }
      }

      // 3) 메타데이터에서 모델 PDA 찾기 (외부 백엔드가 메타데이터에 포함한 경우)
      if (transactionInfo.meta && transactionInfo.meta.innerInstructions) {
        for (const innerInstruction of transactionInfo.meta.innerInstructions) {
          for (const instruction of innerInstruction.instructions) {
            if (instruction.programIdIndex !== undefined && 
                instruction.programIdIndex >= 0 && 
                instruction.programIdIndex < accountKeys.length) {
              const programId = accountKeys[instruction.programIdIndex];
              if (programId.toString() === this.programId.toString()) {
                if (instruction.accounts && instruction.accounts.length > 0) {
                  const modelPDAIndex = instruction.accounts[0];
                  if (modelPDAIndex !== undefined) {
                    return new PublicKey(accountKeys[modelPDAIndex]);
                  }
                }
              }
            }
          }
        }
      }

      logger.warn('No model PDA found in transaction');
      return null;
    } catch (error) {
      logger.error('Failed to extract model PDA from transaction:', error);
      return null;
    }
  }

  // 트랜잭션에서 실제 전송된 SOL 금액 추출 (SPL Token 포함)
  async extractTransferredAmountFromTransaction(transactionInfo: any): Promise<number> {
    try {
      if (!transactionInfo || !transactionInfo.transaction) {
        return 0;
      }

      const transaction = transactionInfo.transaction;
      const message = transaction.message;
      let accountKeys: any[] = [];
      let instructions: any[] = [];
      let totalTransferred = 0;

      try {
        if (typeof message.getAccountKeys === 'function') {
          const result = message.getAccountKeys();
          logger.info('🔍 getAccountKeys() returned:', {
            isArray: Array.isArray(result),
            type: typeof result,
            hasStaticAccountKeys: !!(result as any)?.staticAccountKeys,
            staticAccountKeysIsArray: Array.isArray((result as any)?.staticAccountKeys)
          });
          
          // getAccountKeys()가 배열을 반환하는 경우
          if (Array.isArray(result)) {
            accountKeys = result;
            logger.info('✅ getAccountKeys() returned array', { count: accountKeys.length });
          }
          // getAccountKeys()가 {staticAccountKeys: [...]} 객체를 반환하는 경우
          else if ((result as any)?.staticAccountKeys && Array.isArray((result as any).staticAccountKeys)) {
            accountKeys = (result as any).staticAccountKeys;
            logger.info('✅ Extracted staticAccountKeys from getAccountKeys() result', { count: accountKeys.length });
          }
          else {
            logger.warn('⚠️  getAccountKeys() returned unexpected format');
            accountKeys = [];
          }
        } else if ((message as any).accountKeys) {
          const accountKeysObj = (message as any).accountKeys;
          logger.info('🔍 accountKeysObj structure:', {
            hasStaticAccountKeys: !!accountKeysObj.staticAccountKeys,
            isArray: Array.isArray(accountKeysObj),
            staticAccountKeysIsArray: Array.isArray(accountKeysObj.staticAccountKeys),
            staticAccountKeysLength: accountKeysObj.staticAccountKeys?.length
          });
          
          // VersionedTransaction의 경우 staticAccountKeys 속성을 가질 수 있음
          if (accountKeysObj.staticAccountKeys && Array.isArray(accountKeysObj.staticAccountKeys)) {
            accountKeys = accountKeysObj.staticAccountKeys;
            logger.info('✅ Extracted staticAccountKeys as array', { count: accountKeys.length });
          } else if (Array.isArray(accountKeysObj)) {
            accountKeys = accountKeysObj;
            logger.info('✅ accountKeysObj is already an array', { count: accountKeys.length });
          } else {
            accountKeys = [];
            logger.warn('⚠️  accountKeys is neither array nor has staticAccountKeys');
          }
        }
        
        if ((message as any).instructions) {
          instructions = (message as any).instructions;
        }
      } catch (error) {
        logger.warn('Failed to get message details:', error);
        return 0;
      }

      // 🔍 DEBUG: 인스트럭션 분석 로그
      logger.info('🔍 DEBUG - Analyzing Instructions:', {
        instructionsCount: instructions.length,
        accountKeysCount: accountKeys.length,
        accountKeysType: typeof accountKeys,
        accountKeysIsArray: Array.isArray(accountKeys),
        accountKeys: Array.isArray(accountKeys) ? accountKeys.map((key, index) => ({ index, key: key ? key.toString() : 'undefined' })) : 'Not an array'
      });

      // accountKeys가 배열인지 확인
      if (!Array.isArray(accountKeys)) {
        logger.warn('accountKeys is not an array:', { accountKeys, type: typeof accountKeys });
        return 0;
      }

      // 모든 인스트럭션을 확인하여 SOL/SPL Token 전송 금액 합계 (ComputeBudget instruction 제외)
      for (let i = 0; i < instructions.length; i++) {
        const instruction = instructions[i];
        if (instruction.programIdIndex !== undefined && 
            instruction.programIdIndex >= 0 && 
            instruction.programIdIndex < accountKeys.length) {
          const programId = accountKeys[instruction.programIdIndex];
          
          // 🔍 DEBUG: 각 인스트럭션 정보 로그
          logger.info(`🔍 DEBUG - Instruction ${i}:`, {
            programId: programId ? programId.toString() : 'undefined',
            isSystemProgram: programId ? programId.toString() === SystemProgram.programId.toString() : false,
            isSPLToken: programId ? programId.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' : false,
            isComputeBudget: programId ? programId.toString() === this.COMPUTE_BUDGET_PROGRAM_ID : false,
            dataLength: instruction.data?.length || 0,
            accountsCount: instruction.accounts?.length || 0,
            programIdIndex: instruction.programIdIndex
          });
          
          // ComputeBudget instruction 건너뛰기
          if (programId && programId.toString() === this.COMPUTE_BUDGET_PROGRAM_ID) {
            logger.info('⏭️  Skipping ComputeBudget instruction');
            continue;
          }
          
          // SystemProgram.transfer 인스트럭션인지 확인
          if (programId && programId.toString() === SystemProgram.programId.toString()) {
            try {
              let dataBuffer: Buffer;
              
              // instruction.data를 Buffer로 변환
              if (Buffer.isBuffer(instruction.data)) {
                dataBuffer = instruction.data;
              } else if (typeof instruction.data === 'string') {
                // base58 디코딩
                const bs58 = require('bs58');
                dataBuffer = Buffer.from(bs58.decode(instruction.data));
              } else if (Array.isArray(instruction.data)) {
                dataBuffer = Buffer.from(instruction.data);
              } else {
                logger.warn('Unknown instruction.data format:', typeof instruction.data);
                continue;
              }
              
              // SystemProgram.transfer의 데이터 길이는 4바이트 (discriminator) + 8바이트 (lamports)
              if (dataBuffer.length >= 12) {
                // lamports 값 추출 (8바이트 little-endian)
                const lamportsData = dataBuffer.slice(4, 12);
                const lamports = lamportsData.readBigUInt64LE(0);
                totalTransferred += Number(lamports);
                
                logger.info(`🔍 DEBUG - SystemProgram Transfer Found:`, {
                  lamports: Number(lamports),
                  sol: Number(lamports) / LAMPORTS_PER_SOL,
                  dataType: typeof instruction.data,
                  isBuffer: Buffer.isBuffer(instruction.data)
                });
              }
            } catch (error) {
              logger.error('Failed to parse SystemProgram transfer data:', error);
            }
          }
          
          // SPL Token Program 인스트럭션인지 확인
          else if (programId && programId.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            try {
              let dataBuffer: Buffer;
              
              // instruction.data를 Buffer로 변환
              if (Buffer.isBuffer(instruction.data)) {
                dataBuffer = instruction.data;
              } else if (typeof instruction.data === 'string') {
                // base58 디코딩
                const bs58 = require('bs58');
                dataBuffer = Buffer.from(bs58.decode(instruction.data));
              } else if (Array.isArray(instruction.data)) {
                dataBuffer = Buffer.from(instruction.data);
              } else {
                logger.warn('Unknown SPL Token instruction.data format:', typeof instruction.data);
                continue;
              }
              
              // SPL Token transfer 인스트럭션 (discriminator: 3)
              if (dataBuffer.length >= 1) {
                const discriminator = dataBuffer[0];
                if (discriminator === 3) { // Transfer instruction
                  // SPL Token transfer에서 amount는 8바이트 little-endian
                  if (dataBuffer.length >= 9) {
                    const amountData = dataBuffer.slice(1, 9);
                    const amount = amountData.readBigUInt64LE(0);
                    // SPL Token은 보통 6자리 소수점을 사용하므로 SOL로 변환
                    totalTransferred += Number(amount) / 1000000; // 1 SOL = 1,000,000 micro-SOL
                    
                    logger.info(`🔍 DEBUG - SPL Token Transfer Found:`, {
                      amount: Number(amount),
                      convertedSOL: Number(amount) / 1000000
                    });
                  }
                }
              }
            } catch (error) {
              logger.error('Failed to parse SPL Token transfer data:', error);
            }
          }
        }
      }

      logger.info('🔍 DEBUG - Final Amount Extraction:', {
        totalTransferred,
        totalTransferredSOL: totalTransferred / LAMPORTS_PER_SOL
      });

      return totalTransferred;
    } catch (error) {
      logger.error('Failed to extract transferred amount from transaction:', error);
      return 0;
    }
  }
}

export default new SolanaService();