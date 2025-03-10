### **Ubuntu에서 Palolog 2.0 로그 서버 설치 및 설정 방법**

> ⚠️ **사전 요구사항**
> - CPU: I5-13500 이상 권장
> - RAM: DDR5 32GB 이상 권장
> - Storage: SSD 4TB 이상 권장
> - Ubuntu 22.04 LTS
> - 포트: 8000 (웹 서버), 514 (UDP/Syslog)

1. 시스템 의존성 설치
    ```jsx
    # 기본 시스템 의존성 설치
    sudo apt-get update && sudo apt-get install -y \
        build-essential \
        python3 \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg-agent \
        sysstat \
        software-properties-common \
        jq;

    # Docker 설치
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -;
    sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable";
    sudo apt-get update;
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io;

    # Docker 권한 설정
    sudo usermod -aG docker $USER;
    newgrp docker;
    sudo chown $USER /var/run/docker.sock;
    sudo chmod 666 /var/run/docker.sock;

    # Docker Compose 설치 (v2.x)
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose;
    sudo chmod +x /usr/local/bin/docker-compose;
    ```

2. Node.js 환경 설정
    ```jsx
    # NVM 설치
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash;
    export NVM_DIR="$HOME/.nvm";
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # NVM 로드

    # Node.js 설치 (v20.15.0 필수)
    nvm install v20.15.0;
    nvm use v20.15.0;

    # 전역 패키지 설치
    npm install -g npm@10.8.2;
    npm install -g pnpm;
    npm install -g pm2;
    npm install -g node-gyp;  # 네이티브 모듈 빌드에 필요
    ```

3. 프로젝트 설정
    ```jsx
    # 프로젝트 의존성 설치
    pnpm install;

    # .next 디렉토리 권한 설정
    sudo chown -R $USER:$USER ./.next
    sudo chmod -R 755 ./.next

    # bcrypt 모듈 재빌드 (빌드 오류 발생 시)
    cd node_modules/bcrypt && node-gyp rebuild && cd ../..

    # ecosystem.config.cjs 파일 생성
    cat > ecosystem.config.cjs << EOF
    module.exports = {
      apps: [
        {
          name: 'next-app',
          script: 'pnpm',
          args: 'start',
          env: {
            NODE_ENV: 'production',
          },
        },
        {
          name: 'websocket-server',
          script: 'pnpm',
          args: 'start:ws',
          env: {
            NODE_ENV: 'production',
          },
        },
      ],
    };
    EOF
    ```

4. 시스템 성능 최적화 설정
    ```jsx
    # 시스템 레벨의 UDP 버퍼 크기 및 성능 최적화 설정 파일 생성
    sudo tee /etc/sysctl.d/99-network-tune.conf << EOF
    # VM 설정
    vm.max_map_count=262144      # OpenSearch 및 프로세스당 메모리 맵 영역 수 증가
    vm.swappiness=10             # 스왑 사용 최소화
    vm.vfs_cache_pressure=50     # 파일시스템 캐시 균형 조정

    # Network Buffer Sizes (128MB로 설정)
    net.core.rmem_max=134217728
    net.core.rmem_default=134217728
    net.core.wmem_max=134217728
    net.core.wmem_default=134217728

    # Network Backlog
    net.core.netdev_max_backlog=160000    # 네트워크 인터페이스 수신 대기열 크기

    # UDP Memory (128MB로 설정)
    net.ipv4.udp_mem=134217728 134217728 134217728

    # TCP Memory and Settings
    net.ipv4.tcp_rmem=4096 87380 134217728
    net.ipv4.tcp_wmem=4096 87380 134217728
    net.ipv4.tcp_max_syn_backlog=8192     # 동시 연결 요청 처리량 증가
    net.ipv4.tcp_slow_start_after_idle=0  # 유휴 상태 후 성능 저하 방지
    net.ipv4.tcp_tw_reuse=1               # TIME_WAIT 소켓 재사용 활성화
    EOF

    # 설정 적용
    sudo sysctl -p /etc/sysctl.d/99-network-tune.conf
    ```

5. OpenSearch 초기 설정
    ```jsx
    # OpenSearch 초기화 스크립트 생성
    cat > init_opensearch.sh << EOF
    #!/bin/bash
    exec opensearch
    EOF

    # 스크립트 실행 권한 부여
    chmod +x init_opensearch.sh
    ```

6. 데이터베이스 초기화
    ```jsx
    # Prisma 데이터베이스 초기화
    pnpm db:init
    ```

7. 라이선스 생성
    ```jsx
    # 30일 라이선스 생성
    LICENSE_DURATION=30 pnpm generate:license
    ```

8. 서비스 실행 및 설정
    ```jsx
    # 전체 서비스 실행 (클린 -> 빌드 -> 도커 -> 권한 -> 시작)
    pnpm prod:all

    # OpenSearch 및 Logstash가 완전히 시작될 때까지 대기 (약 30초)
    echo "OpenSearch 및 Logstash 시작 대기 중..."
    sleep 30

    # OpenSearch 상태 확인
    curl -s http://localhost:9200/_cluster/health

    # OpenSearch 인덱스 템플릿 설정
    curl -X PUT "http://localhost:9200/_template/logstash" -H 'Content-Type: application/json' -d '{
      "template": "*",
      "settings": {
        "number_of_replicas": 0,
        "number_of_shards": 1,
        "refresh_interval": "5s",
        "index.mapping.total_fields.limit": 2000,
        "index.auto_expand_replicas": false
      }
    }'

    # 기존 인덱스에 replica 설정 적용
    curl -X PUT "http://localhost:9200/_all/_settings" -H 'Content-Type: application/json' -d '{
      "index": {
        "number_of_replicas": 0,
        "auto_expand_replicas": false
      }
    }'

    # Logstash 상태 확인
    docker logs logstash | grep "Successfully started Logstash"
    netstat -nlu | grep 514
    ```

9. 설치 확인
    ```jsx
    # OpenSearch 클러스터 상태 확인
    curl -s http://localhost:9200/_cluster/health

    # Logstash 로그 확인
    docker logs -f logstash

    # 웹 서버 상태 확인
    curl -I http://localhost:8000
    ```

> 💡 **빌드 문제 해결 가이드**
> 1. **bcrypt 빌드 오류**
>    - 증상: `Cannot find module 'bcrypt_lib.node'` 에러
>    - 해결: `cd node_modules/bcrypt && node-gyp rebuild && cd ../..`
> 
> 2. **의존성 문제**
>    - node_modules 삭제 후 재설치: `rm -rf node_modules .next && pnpm install`
>    - bcrypt 재설치: `pnpm remove bcrypt && pnpm add bcrypt@5.1.1`
>
> 3. **권한 문제**
>    - .next 디렉토리: `sudo chown -R $USER:$USER ./.next && sudo chmod -R 755 ./.next`
>    - Docker: `sudo usermod -aG docker $USER && newgrp docker`
>
> 4. **OpenSearch 문제**
>    - 클러스터 상태가 yellow인 경우: 인덱스 템플릿 설정으로 자동 해결
>    - 메모리 설정 오류: vm.max_map_count 설정이 적용되어 있는지 확인
>    - 컨테이너 재시작: `docker compose restart opensearch logstash`
>    - 클러스터 상태 확인: `curl -s http://localhost:9200/_cluster/health`
>    - 설정이 적용되지 않은 경우: 30초 이상 대기 후 다시 시도
>
> 5. **Logstash 문제**
>    - 로그 확인: `docker logs -f logstash`
>    - UDP 포트 확인: `netstat -nlu | grep 514`
>    - 컨테이너 재시작 필요시: `docker compose restart logstash`
>    - 패킷 수신 확인: 아래의 스크립트 실행

    # 514 포트 실시간 수신 패킷 수 확인
    ```jsx
    clear
    declare -a packet_counts
    total_packets=0
    index=0
    array_size=60  # 1분 = 60초

    # 초기 배열 채우기
    for ((i=0; i<array_size; i++)); do
        packet_counts[$i]=0
    done

    while true; do
        # 현재 초당 패킷 수 계산
        current_packets=$(sudo timeout 1s tcpdump -i any 'udp port 514' 2>/dev/null | wc -l)
        
        # 배열 업데이트
        total_packets=$((total_packets - packet_counts[index] + current_packets))
        packet_counts[index]=$current_packets
        index=$(((index + 1) % array_size))
        
        # 평균 계산
        avg_packets=$(echo "scale=2; $total_packets / 60" | bc)
        
        # 결과 출력 (현재 시간, 현재 패킷 수, 1분 평균)
        echo -ne "\r$(date +%H:%M:%S) Current: ${current_packets} packets/sec | 1min Avg: ${avg_packets} packets/sec     "
        
        sleep 1
    done
    ```

    ```
    prod:clean: 기존 PM2 프로세스와 포트 사용 정리
    build: Next.js 앱과 웹소켓 서버를 동시에 빌드
    prod:docker: 도커 컨테이너 재시작
    prod:permissions: .next 디렉토리 권한 설정
    prod:start: PM2로 Next.js 앱과 웹소켓 서버 시작

    prod:clean; build; prod:docker; prod:permissions; prod:start;
    ```

```
    # I/O 성능 최적화 (4TB SSD 활용)
    echo "vm.dirty_ratio=30" | sudo tee -a /etc/sysctl.conf
    echo "vm.dirty_background_ratio=10" | sudo tee -a /etc/sysctl.conf

    # 네트워크 성능 추가 최적화
    echo "net.core.netdev_max_backlog=65536" | sudo tee -a /etc/sysctl.conf

    # 영구 설정 추가
    echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
    echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
    echo "net.core.rmem_max=33554432" | sudo tee -a /etc/sysctl.conf
    echo "net.core.wmem_max=33554432" | sudo tee -a /etc/sysctl.conf

    # 변경된 설정 적용
    sudo sysctl -p
```