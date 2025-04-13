#!/bin/bash

# 컨테이너 중지 및 제거
echo "Stopping and removing existing containers..."
docker-compose down

# 컨테이너 시작
echo "Starting containers..."
docker-compose up -d

# 서비스들이 준비될 때까지 대기하는 함수
wait_for_service() {
  local service=$1
  local port=$2
  local max_attempts=30
  local attempt=1

  echo "Waiting for $service to be ready..."
  while [ $attempt -le $max_attempts ]; do
    # 컨테이너가 실행 중인지 확인
    if ! docker-compose ps $service | grep -q "Up"; then
      echo "Attempt $attempt: $service container is not running. Waiting..."
      sleep 10
      attempt=$((attempt + 1))
      continue
    fi

    # 포트가 열려있는지 확인
    if docker-compose exec $service sh -c "nc -z localhost $port"; then
      echo "$service is ready!"
      return 0
    fi
    echo "Attempt $attempt: $service is not ready yet. Waiting..."
    sleep 10
    attempt=$((attempt + 1))
  done

  echo "Timeout waiting for $service to be ready"
  return 1
}

# 각 서비스의 상태 확인
wait_for_service "zookeeper" "2181" || exit 1
wait_for_service "kafka" "9092" || exit 1
wait_for_service "opensearch" "9200" || exit 1

# Kafka 토픽 생성
echo "Creating Kafka topic..."
docker-compose exec kafka kafka-topics.sh --create --topic log_topic_v11.0 --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1

# OpenSearch 초기화 스크립트 실행
echo "Initializing OpenSearch..."
pnpm tsx src/server/scripts/init-opensearch.ts

# 초기화 결과 확인
if [ $? -eq 0 ]; then
  echo "OpenSearch initialization completed successfully"
else
  echo "OpenSearch initialization failed"
  exit 1
fi

echo "Docker initialization completed" 