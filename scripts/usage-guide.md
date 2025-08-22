# 데이터 누수 분석 도구 사용 가이드

UDP → Logstash → Kafka → OpenSearch 파이프라인에서 데이터 누수를 분석하고 측정하는 도구 모음입니다.

## 📋 도구 개요

### 1. 통합 모니터링 도구 (`log-monitoring-tool.py`)
전체 파이프라인의 데이터 흐름을 실시간으로 모니터링하는 종합 분석 도구

### 2. UDP 패킷 분석기 (`udp-packet-analyzer.py`) 
tcpdump를 사용하여 UDP 패킷 송수신 상황을 정밀 분석하는 도구

### 3. 데이터 저장 추적기 (`data-storage-tracker.py`)
Kafka와 OpenSearch의 데이터 저장 성공률을 추적하는 도구

## 🚀 빠른 시작

### 사전 준비(최초 1회)

Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv tcpdump iproute2

# (권장) sudo 없이 tcpdump 사용 가능하도록 Capabilities 부여
sudo setcap cap_net_raw,cap_net_admin+eip $(command -v tcpdump || echo /usr/sbin/tcpdump)

# (선택) 전용 가상환경 생성
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -U pip setuptools wheel
```

RHEL/CentOS/Fedora:
```bash
sudo dnf install -y python3 python3-pip tcpdump
sudo setcap cap_net_raw,cap_net_admin+eip $(command -v tcpdump || echo /usr/sbin/tcpdump)
python3 -m venv .venv && source .venv/bin/activate
python3 -m pip install -U pip setuptools wheel
```

### 필수 패키지 설치
```bash
python3 -m pip install requests kafka-python opensearch-py psutil
```

### 기본 권한 설정
```bash
# tcpdump 실행 권한 (root 또는 sudo 필요)
sudo chmod +x scripts/*.py
# (옵션) sudo 없이 tcpdump 사용: 위 setcap 참고
```

## 📊 도구별 사용법

### 1. 통합 모니터링 도구

전체 시스템의 데이터 흐름을 한눈에 파악:

```bash
# 기본 실행 (모든 구간 모니터링)
sudo python3 scripts/log-monitoring-tool.py

# 특정 포트 모니터링
sudo python3 scripts/log-monitoring-tool.py --udp-port 514

# 조용한 모드 (실시간 출력 없음)
python3 scripts/log-monitoring-tool.py --quiet

# 지정된 시간 동안 모니터링
python3 scripts/log-monitoring-tool.py --duration 300
```

**출력 예시:**
```
⏰ Time: 14:30:25
📤 Sent: 50,000 | 📥 Received: 47,500 | Loss: 5.0%
🔄 Kafka: 47,200 | 💾 OpenSearch: 46,800
💻 CPU: 45.2% | 🧠 Memory: 67.8%
📊 Total Loss Rate: 6.4%

⚠️  ISSUES DETECTED:
   🚨 HIGH UDP Loss: 5.0% - Check UDP buffer size
```

### 2. UDP 패킷 분석기

UDP 레벨에서의 정밀한 패킷 손실 분석:

```bash
# 기본 실행 (패킷 캡처 및 분석)
sudo python3 scripts/udp-packet-analyzer.py

# 특정 인터페이스 모니터링
sudo python3 scripts/udp-packet-analyzer.py --interface eth0

# 테스트 패킷 자동 생성 포함
sudo python3 scripts/udp-packet-analyzer.py --generate

# 300초간 분석 후 자동 종료
sudo python3 scripts/udp-packet-analyzer.py --duration 300
```

**출력 예시:**
```
🕒 14:32:10
📤 Sent: 10,000
📥 Received: 9,750
⚙️  Processed: 9,680
📊 UDP Loss: 2.50%
🔄 Processing Delay: 0.72%

🚨 HIGH UDP LOSS DETECTED: 2.5%
```

### 3. 데이터 저장 추적기

Kafka와 OpenSearch의 저장 성공률 모니터링:

```bash
# 기본 실행
python3 scripts/data-storage-tracker.py

# 10초 간격으로 체크
python3 scripts/data-storage-tracker.py --interval 10

# 조용한 모드
python3 scripts/data-storage-tracker.py --quiet
```

**출력 예시:**
```
💾 DATA STORAGE TRACKING - 14:35:15
📨 Kafka Messages: 45,230 total, 45,100 processed
💾 OpenSearch Docs: 44,850 indexed, 25 failed
📊 Storage Success Rate: 99.16%
⚡ Indexing Rate: 99.45%
❌ Error Rate: 0.06%

📊 INDEX STATISTICS:
   alias_seoulfw: 15,230 docs (45.2MB)
   alias_busanfw: 12,450 docs (38.1MB)
```

## 🔧 설정 파일

각 도구는 JSON 설정 파일을 지원합니다:

### config.json 예시
```json
{
  "udp_port": 514,
  "interface": "any",
  "kafka_host": "localhost:9092",
  "kafka_topic": "log_topic_v11.0",
  "opensearch_host": "http://localhost:9200",
  "opensearch_user": "admin",
  "opensearch_password": "PaloLog2024!@#$",
  "monitor_interval": 5,
  "real_time_output": true
}
```

설정 파일 사용:
```bash
python3 scripts/log-monitoring-tool.py --config config.json
```

## 📈 분석 시나리오

### 시나리오 1: 기본 데이터 누수 측정

1. **전체 시스템 모니터링 시작**
   ```bash
   sudo python3 scripts/log-monitoring-tool.py
   ```

2. **로그 생성기로 테스트 데이터 전송**
   ```bash
   # 별도 터미널에서
   python3 loggen/loggen.py --host localhost --port 514 --count 10000
   ```

3. **실시간으로 누수율 확인**
   - UDP 손실률 모니터링
   - Kafka 백로그 확인
   - OpenSearch 인덱싱 지연 측정

### 시나리오 2: 정밀 UDP 패킷 분석

고부하 상황에서 UDP 레벨의 정확한 손실률 측정:

```bash
# 1단계: UDP 분석기 시작
sudo python3 scripts/udp-packet-analyzer.py --generate

# 2단계: tcpdump로 별도 검증
sudo tcpdump -i any -n port 514 -c 1000

# 3단계: 결과 비교 분석
```

### 시나리오 3: 저장 성능 최적화

OpenSearch 저장 성능 문제 진단:

```bash
# 1단계: 저장 추적기 실행
python3 scripts/data-storage-tracker.py --interval 5

# 2단계: 대량 데이터 전송 테스트
python3 scripts/mass-log-generator.py burst --total 100000

# 3단계: 성능 지표 분석
```

## 📋 리포트 분석

### 생성되는 리포트 파일
- `log_monitoring_report_YYYYMMDD_HHMMSS.json`
- `udp_analysis_report_YYYYMMDD_HHMMSS.json`
- `storage_tracking_report_YYYYMMDD_HHMMSS.json`

### 주요 지표 해석

**UDP 손실률**
- < 1%: 정상
- 1-5%: 주의 (네트워크 혼잡 가능)
- > 5%: 위험 (버퍼 크기 증가 필요)

**저장 성공률**
- > 99%: 우수
- 95-99%: 양호
- < 95%: 개선 필요

**처리 지연률**
- < 5%: 정상
- 5-15%: 모니터링 필요
- > 15%: 성능 이슈

## 🛠️ 문제 해결

### UDP 패킷 손실이 높은 경우
# 초기 설치 에러 해결 가이드

다음 증상 발생 시 아래를 순서대로 실행하세요.

- "tcpdump: not found" 또는 도구에서 tcpdump 실행 실패:
  - Linux 패키지 설치: `sudo apt-get install -y tcpdump` (또는 `sudo dnf install -y tcpdump`)
  - 권한 문제 시: `sudo`로 실행하거나 `sudo setcap cap_net_raw,cap_net_admin+eip $(command -v tcpdump)` 적용

- `pip: command not found` 또는 `pip3: command not found`:
  - `sudo apt-get install -y python3-pip` (또는 `sudo dnf install -y python3-pip`)
  - 이후 항상 `python3 -m pip ...` 형태로 사용 권장

- 가상환경 사용 시 `sudo`와 경로 문제:
  - tcpdump에 Capabilities를 부여해 sudo 없이 실행하거나
  - 불가피하게 sudo가 필요하면 환경을 유지: `sudo -E env PATH="$PATH" python3 scripts/udp-packet-analyzer.py`

- Kafka/OpenSearch 접속 실패:
  - `config.json`의 호스트/계정 정보를 확인하고, 방화벽/도커 네트워크 상태를 점검
  - OpenSearch 헬스체크: `curl -k -u admin:admin http://localhost:9200/_cluster/health?pretty`

```bash
# Logstash UDP 버퍼 크기 증가
# logstash/pipeline/producer/producer.conf 수정
queue_size => 100000  # 기본값: 50000
```

### Kafka 백로그 증가 시
```bash
# Kafka 파티션 확인
docker exec -it kafka kafka-topics.sh --describe --topic log_topic_v11.0 --bootstrap-server localhost:9092

# 컨슈머 그룹 상태 확인
docker exec -it kafka kafka-consumer-groups.sh --describe --group logstash-group-v11.0 --bootstrap-server localhost:9092
```

### OpenSearch 인덱싱 지연 시
```bash
# 클러스터 상태 확인
curl -X GET "localhost:9200/_cluster/health?pretty"

# 인덱스 통계 확인
curl -X GET "localhost:9200/_stats?pretty"
```

## 🚨 알려진 이슈

1. **tcpdump 권한**: `sudo` 권한 필요
2. **Docker 환경**: 컨테이너 내부 네트워크 인터페이스 확인 필요
3. **높은 부하**: 모니터링 도구 자체가 시스템 부하를 증가시킬 수 있음

## 💡 최적화 권장사항

### 1. Logstash 최적화
- `queue_size` 증가: 50000 → 100000
- `pipeline.workers` 조정: 기본값 → CPU 코어 수
- `pipeline.batch.size` 증가: 기본값 → 1000

### 2. Kafka 최적화
- 파티션 수 증가
- `batch_size` 최적화
- `linger_ms` 조정

### 3. OpenSearch 최적화
- 샤드 수 최적화
- 인덱스 템플릿 최적화
- 메모리 할당 증가

## 📞 지원

문제 발생 시:
1. 로그 파일 확인
2. 리포트 파일 검토
3. 시스템 리소스 모니터링
4. 네트워크 상태 점검