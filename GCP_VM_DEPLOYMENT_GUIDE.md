# GCP VM 인스턴스 배포 가이드

## 🚀 GCP Compute Engine (VM) 배포

### 1. 사전 준비사항

#### 1.1 GCP 프로젝트 설정
```bash
# GCP CLI 설치 및 인증
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 필요한 API 활성화
gcloud services enable compute.googleapis.com
```

#### 1.2 SSH 키 설정
```bash
# SSH 키 생성 (없는 경우)
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# GCP에 SSH 키 추가
gcloud compute config-ssh
```

---

## 🖥️ VM 인스턴스 생성

### 옵션 1: GCP Console 사용 (추천)

```
1. Compute Engine → VM 인스턴스 → 인스턴스 만들기
2. 설정:
   - 이름: solana-backend
   - 리전: asia-northeast3 (서울)
   - 영역: asia-northeast3-a
   - 머신 유형: e2-micro (무료 등급) 또는 e2-small
   - 부팅 디스크:
     * OS: Ubuntu 22.04 LTS
     * 디스크 유형: 표준 영구 디스크
     * 크기: 10GB
   - 방화벽:
     ✅ HTTP 트래픽 허용
     ✅ HTTPS 트래픽 허용
3. "만들기" 클릭
```

### 옵션 2: gcloud CLI 사용

```bash
gcloud compute instances create solana-backend \
  --project=YOUR_PROJECT_ID \
  --zone=asia-northeast3-a \
  --machine-type=e2-small \
  --network-interface=network-tier=PREMIUM,subnet=default \
  --maintenance-policy=MIGRATE \
  --provisioning-model=STANDARD \
  --tags=http-server,https-server \
  --create-disk=auto-delete=yes,boot=yes,device-name=solana-backend,image=projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-v20231030,mode=rw,size=10,type=projects/YOUR_PROJECT_ID/zones/asia-northeast3-a/diskTypes/pd-standard \
  --no-shielded-secure-boot \
  --shielded-vtpm \
  --shielded-integrity-monitoring \
  --labels=environment=production,service=solana-backend \
  --reservation-affinity=any
```

---

## 📌 고정 IP 설정 (중요!)

### 방법 1: GCP Console

#### 1단계: 정적 외부 IP 예약
```
1. VPC 네트워크 → IP 주소
2. "외부 고정 주소 예약" 클릭
3. 설정:
   - 이름: solana-backend-ip
   - 네트워크 서비스 계층: Premium
   - IP 버전: IPv4
   - 유형: 지역
   - 지역: asia-northeast3 (VM과 동일)
   - 연결 대상: 없음
4. "예약" 클릭
```

#### 2단계: VM에 정적 IP 할당
```
1. Compute Engine → VM 인스턴스
2. solana-backend 중지
3. 인스턴스 이름 클릭 → "수정"
4. 네트워크 인터페이스 → 편집
5. 외부 IPv4 주소 → 예약한 IP 선택
6. "완료" → "저장"
7. 인스턴스 시작
```

### 방법 2: gcloud CLI (자동화)

```bash
#!/bin/bash
# static-ip-setup.sh

PROJECT_ID="your-project-id"
REGION="asia-northeast3"
ZONE="asia-northeast3-a"
INSTANCE_NAME="solana-backend"
IP_NAME="solana-backend-ip"

# 1. 정적 IP 예약
echo "📌 정적 IP 예약 중..."
gcloud compute addresses create $IP_NAME \
  --project=$PROJECT_ID \
  --region=$REGION \
  --network-tier=PREMIUM

# 2. 예약된 IP 확인
STATIC_IP=$(gcloud compute addresses describe $IP_NAME \
  --region=$REGION \
  --format="get(address)")
echo "✅ 예약된 IP: $STATIC_IP"

# 3. VM 중지
echo "🛑 VM 중지 중..."
gcloud compute instances stop $INSTANCE_NAME \
  --zone=$ZONE \
  --project=$PROJECT_ID

# 4. 기존 외부 IP 제거
echo "🗑️  기존 IP 제거 중..."
gcloud compute instances delete-access-config $INSTANCE_NAME \
  --access-config-name="External NAT" \
  --zone=$ZONE \
  --project=$PROJECT_ID

# 5. 정적 IP 할당
echo "🔧 정적 IP 할당 중..."
gcloud compute instances add-access-config $INSTANCE_NAME \
  --access-config-name="External NAT" \
  --address=$STATIC_IP \
  --zone=$ZONE \
  --project=$PROJECT_ID

# 6. VM 시작
echo "🚀 VM 시작 중..."
gcloud compute instances start $INSTANCE_NAME \
  --zone=$ZONE \
  --project=$PROJECT_ID

echo ""
echo "✅ 완료!"
echo "🌐 고정 IP: $STATIC_IP"
echo "🔗 백엔드 URL: http://$STATIC_IP:3002"
```

### 실행
```bash
chmod +x static-ip-setup.sh
./static-ip-setup.sh
```

---

## ⚙️ VM 초기 설정

### SSH 접속
```bash
# GCP Console에서 "SSH" 버튼 클릭
# 또는 터미널에서:
gcloud compute ssh solana-backend --zone=asia-northeast3-a
```

### Node.js 설치
```bash
# Node.js 20.x 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 버전 확인
node --version
npm --version
```

### Git 설치
```bash
sudo apt-get update
sudo apt-get install -y git
```

---

## 📦 애플리케이션 배포

### 1. 코드 복사

#### 옵션 A: Git Clone (추천)
```bash
# SSH 키 설정 후
git clone https://github.com/your-username/solana-backend.git
cd solana-backend
```

#### 옵션 B: 파일 직접 업로드
```bash
# 로컬에서 실행
gcloud compute scp --recurse ./solana-backend solana-backend:~/ \
  --zone=asia-northeast3-a
```

### 2. 환경 변수 설정
```bash
cd solana-backend
cp env.production .env

# .env 파일 수정
nano .env
```

```env
PORT=3002
NODE_ENV=production
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=your_program_id
PLATFORM_FEE_BPS=500
PLATFORM_FEE_WALLET=your_wallet_address
FRONTEND_URL=https://your-frontend-domain.com
JWT_SECRET=your_secure_jwt_secret
```

### 3. 의존성 설치 및 빌드
```bash
npm install
npm run build
```

---

## 🔥 방화벽 규칙 설정

### GCP 방화벽 규칙 생성
```bash
# Port 3002 허용
gcloud compute firewall-rules create allow-solana-backend \
  --allow=tcp:3002 \
  --source-ranges=0.0.0.0/0 \
  --target-tags=http-server \
  --description="Allow Solana Backend on port 3002"
```

### GCP Console에서 설정
```
1. VPC 네트워크 → 방화벽
2. "방화벽 규칙 만들기"
3. 설정:
   - 이름: allow-solana-backend
   - 대상: 지정된 대상 태그
   - 대상 태그: http-server
   - 소스 IPv4 범위: 0.0.0.0/0
   - 프로토콜 및 포트: tcp:3002
4. "만들기"
```

---

## 🚀 애플리케이션 실행

### PM2로 프로세스 관리 (추천)

#### 1. PM2 설치
```bash
sudo npm install -g pm2
```

#### 2. 애플리케이션 시작
```bash
# 프로덕션 모드 실행
pm2 start dist/server.js --name solana-backend

# 또는 npm script 사용
pm2 start npm --name solana-backend -- start
```

#### 3. PM2 자동 시작 설정
```bash
# 시스템 재부팅 시 자동 시작
pm2 startup systemd
pm2 save
```

#### 4. PM2 상태 확인
```bash
pm2 status
pm2 logs solana-backend
pm2 monit
```

### PM2 주요 명령어
```bash
pm2 start solana-backend    # 시작
pm2 stop solana-backend     # 중지
pm2 restart solana-backend  # 재시작
pm2 delete solana-backend   # 삭제
pm2 logs solana-backend     # 로그 보기
pm2 monit                   # 모니터링
```

---

## 🔍 배포 확인

### 1. 헬스 체크
```bash
# VM 내부에서
curl http://localhost:3002/health

# 외부에서 (고정 IP 사용)
curl http://YOUR_STATIC_IP:3002/health
```

### 2. API 테스트
```bash
curl http://YOUR_STATIC_IP:3002/api/blockchain/status
```

---

## 🔄 업데이트 및 재배포

### Git Pull 방식
```bash
# VM에 SSH 접속
gcloud compute ssh solana-backend --zone=asia-northeast3-a

# 최신 코드 가져오기
cd solana-backend
git pull origin main

# 빌드 및 재시작
npm install
npm run build
pm2 restart solana-backend
```

### 자동화 스크립트
```bash
#!/bin/bash
# deploy.sh

echo "🔄 최신 코드 가져오는 중..."
git pull origin main

echo "📦 의존성 설치 중..."
npm install

echo "🏗️  빌드 중..."
npm run build

echo "🔄 애플리케이션 재시작 중..."
pm2 restart solana-backend

echo "✅ 배포 완료!"
pm2 status
```

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 📊 모니터링 및 로깅

### PM2 모니터링
```bash
# 실시간 모니터링
pm2 monit

# 로그 확인
pm2 logs solana-backend --lines 100

# 에러 로그만
pm2 logs solana-backend --err
```

### 로그 파일 확인
```bash
# 애플리케이션 로그
tail -f logs/combined.log
tail -f logs/error.log
```

### Cloud Logging 연동 (선택사항)
```bash
# Google Cloud Logging 에이전트 설치
curl -sSO https://dl.google.com/cloudagents/add-logging-agent-repo.sh
sudo bash add-logging-agent-repo.sh --also-install
```

---

## 💰 비용 최적화

### 1. 인스턴스 크기
```
e2-micro (무료 등급):
- vCPU: 0.25-2
- 메모리: 1GB
- 월 730시간 무료 (특정 리전)

e2-small (권장):
- vCPU: 2
- 메모리: 2GB
- 월 ~$13-15
```

### 2. 고정 IP 비용
```
사용 중: 무료 (VM에 연결된 경우)
미사용: $0.01/시간 (~$7.3/월)

⚠️ VM 중지 시 고정 IP 요금 발생!
```

### 3. 비용 절감 팁
```
1. 개발/테스트 시에는 임시 IP 사용
2. 사용하지 않을 때는 VM 중지 + 고정 IP 해제
3. 프리티어 e2-micro 활용 (성능 제한 있음)
4. 필요시 선점형 VM 사용 (최대 80% 할인)
```

---

## 🔒 보안 설정

### 1. 방화벽 강화
```bash
# SSH만 특정 IP에서 허용
gcloud compute firewall-rules update default-allow-ssh \
  --source-ranges=YOUR_IP_ADDRESS/32
```

### 2. 자동 업데이트 설정
```bash
# 자동 보안 업데이트
sudo apt-get install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 3. SSL/TLS 설정 (프로덕션)
```bash
# Nginx 리버스 프록시 + Let's Encrypt
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

---

## 🆘 문제 해결

### VM 접속 안 됨
```bash
# 방화벽 규칙 확인
gcloud compute firewall-rules list

# 인스턴스 상태 확인
gcloud compute instances describe solana-backend --zone=asia-northeast3-a
```

### 애플리케이션 실행 안 됨
```bash
# PM2 로그 확인
pm2 logs solana-backend --lines 100

# 포트 사용 확인
sudo netstat -tulpn | grep 3002

# 프로세스 확인
pm2 status
```

### 고정 IP 변경됨
```bash
# 현재 IP 확인
gcloud compute instances describe solana-backend \
  --zone=asia-northeast3-a \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"

# 정적 IP 목록
gcloud compute addresses list
```

---

## 📚 참고 자료

- [GCP Compute Engine 문서](https://cloud.google.com/compute/docs)
- [PM2 공식 문서](https://pm2.keymetrics.io/)
- [GCP 방화벽 규칙](https://cloud.google.com/vpc/docs/firewalls)
- [GCP 정적 IP 주소](https://cloud.google.com/compute/docs/ip-addresses/reserve-static-external-ip-address)

---

## ✅ 배포 체크리스트

- [ ] VM 인스턴스 생성
- [ ] 고정 IP 예약 및 할당
- [ ] 방화벽 규칙 설정 (port 3002)
- [ ] Node.js 설치
- [ ] 코드 배포
- [ ] 환경 변수 설정
- [ ] 빌드 및 실행
- [ ] PM2로 프로세스 관리
- [ ] 헬스 체크 확인
- [ ] 외부에서 API 테스트
- [ ] 모니터링 설정
- [ ] 백업 계획 수립

---

## 🎉 완료!

이제 GCP VM 인스턴스에서 Solana 백엔드가 실행됩니다!

**접속 URL**: `http://YOUR_STATIC_IP:3002`

프로덕션 환경에서는 도메인 + SSL 설정을 권장합니다!

