# GCP 배포 가이드

## 🚀 GCP Cloud Run 배포

### 1. 사전 준비사항

#### 1.1 GCP 프로젝트 설정
```bash
# GCP CLI 설치 및 인증
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 필요한 API 활성화
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

#### 1.2 환경 변수 설정
```bash
# env.production 파일을 .env로 복사
cp env.production .env

# 실제 값으로 수정
# - PROGRAM_ID: 데브넷 프로그램 ID (기본값: GUrLuMj8yCB2T4NKaJSVqrAWWCMPMf1qtBSnDR8ytYwB)
# - PLATFORM_FEE_WALLET: 플랫폼 수수료 지갑 주소
# - FRONTEND_URL: 실제 프론트엔드 도메인
# - JWT_SECRET: 안전한 JWT 시크릿
```

### 2. 배포 방법

#### 2.1 Cloud Build를 사용한 자동 배포
```bash
# Cloud Build 트리거 설정
gcloud builds submit --config cloudbuild.yaml .

# 또는 GitHub 연동 후 자동 배포 설정
```

#### 2.2 수동 배포
```bash
# Docker 이미지 빌드
docker build -t gcr.io/YOUR_PROJECT_ID/solana-backend .

# Container Registry에 푸시
docker push gcr.io/YOUR_PROJECT_ID/solana-backend

# Cloud Run에 배포
gcloud run deploy solana-backend \
  --image gcr.io/YOUR_PROJECT_ID/solana-backend \
  --region asia-northeast3 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10 \
  --set-env-vars NODE_ENV=production,PORT=8080
```

### 3. 환경 변수 설정

#### 3.1 Cloud Run 환경 변수
```bash
gcloud run services update solana-backend \
  --region asia-northeast3 \
  --set-env-vars \
    NODE_ENV=production,\
    PORT=8080,\
    SOLANA_RPC_URL=https://api.devnet.solana.com,\
    PROGRAM_ID=GUrLuMj8yCB2T4NKaJSVqrAWWCMPMf1qtBSnDR8ytYwB,\
    PLATFORM_FEE_WALLET=YOUR_PLATFORM_WALLET,\
    FRONTEND_URL=https://your-frontend-domain.com,\
    JWT_SECRET=YOUR_SECURE_JWT_SECRET
```

#### 3.2 Secret Manager 사용 (권장)
```bash
# 민감한 정보를 Secret Manager에 저장
gcloud secrets create jwt-secret --data-file=jwt-secret.txt
gcloud secrets create platform-fee-wallet --data-file=platform-wallet.txt

# Cloud Run에서 Secret 참조
gcloud run services update solana-backend \
  --region asia-northeast3 \
  --set-secrets JWT_SECRET=jwt-secret:latest,PLATFORM_FEE_WALLET=platform-fee-wallet:latest
```

### 4. 보안 설정

#### 4.1 IAM 권한 설정
```bash
# Cloud Run 서비스 계정 생성
gcloud iam service-accounts create solana-backend-sa

# 필요한 권한 부여
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:solana-backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### 4.2 VPC 연결 (필요시)
```bash
# VPC Connector 생성
gcloud compute networks vpc-access connectors create solana-backend-connector \
  --region=asia-northeast3 \
  --subnet=default \
  --subnet-project=YOUR_PROJECT_ID

# Cloud Run에 VPC Connector 연결
gcloud run services update solana-backend \
  --region asia-northeast3 \
  --vpc-connector=solana-backend-connector
```

### 5. 모니터링 설정

#### 5.1 로깅 설정
```bash
# Cloud Logging에서 로그 확인
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=solana-backend"
```

#### 5.2 모니터링 대시보드
- Cloud Console > Cloud Run > solana-backend > 모니터링
- 메트릭: 요청 수, 응답 시간, 에러율, CPU/메모리 사용량

### 6. 도메인 설정

#### 6.1 커스텀 도메인 연결
```bash
# 도메인 매핑
gcloud run domain-mappings create \
  --service solana-backend \
  --domain api.your-domain.com \
  --region asia-northeast3
```

#### 6.2 SSL 인증서
- Cloud Run은 자동으로 SSL 인증서를 제공
- 커스텀 도메인 사용 시 Google-managed SSL 인증서 자동 생성

### 7. 배포 후 확인사항

#### 7.1 헬스 체크
```bash
# 서비스 상태 확인
curl https://your-service-url/health

# 예상 응답
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "AI Agent Solana Backend",
  "version": "1.0.0"
}
```

#### 7.2 API 테스트
```bash
# 블록체인 상태 확인
curl https://your-service-url/api/blockchain/status

# 계보 추적 테스트
curl -X POST https://your-service-url/api/blockchain/trace-lineage \
  -H "Content-Type: application/json" \
  -d '{"modelPubkey":"YOUR_MODEL_PDA","maxDepth":32}'
```

### 8. 트러블슈팅

#### 8.1 일반적인 문제
- **메모리 부족**: `--memory` 옵션 증가
- **타임아웃**: `--timeout` 옵션 설정
- **환경 변수 누락**: `--set-env-vars` 확인

#### 8.2 로그 확인
```bash
# 실시간 로그 확인
gcloud run services logs tail solana-backend --region asia-northeast3

# 특정 시간대 로그
gcloud run services logs read solana-backend --region asia-northeast3 --limit 100
```

### 9. 비용 최적화

#### 9.1 인스턴스 설정
- **CPU**: 1 vCPU (기본값)
- **메모리**: 1GB (필요시 조정)
- **최대 인스턴스**: 10개 (트래픽에 따라 조정)

#### 9.2 자동 스케일링
- Cloud Run은 자동으로 0으로 스케일 다운
- 요청이 없을 때 비용 발생하지 않음

---

## 🔒 보안 체크리스트

- [ ] `NODE_ENV=production` 설정
- [ ] `TEST_PRIVATE_KEY` 제거
- [ ] 메인넷 RPC URL 사용
- [ ] 실제 도메인 설정
- [ ] JWT 시크릿 보안 설정
- [ ] Secret Manager 사용
- [ ] IAM 권한 최소화
- [ ] 로그 레벨 조정
- [ ] Rate Limiting 설정
- [ ] CORS 설정 검토

---

**배포 완료 후 반드시 테스트를 수행하고 모니터링을 설정하세요!** 🚀
