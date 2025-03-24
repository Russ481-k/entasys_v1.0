#!/bin/bash

# 컨테이너 중지 및 제거
echo "Stopping and removing existing containers..."
docker-compose down

# 컨테이너 시작
echo "Starting containers..."
docker-compose up -d

# OpenSearch가 완전히 시작될 때까지 대기
echo "Waiting for OpenSearch to be ready..."
sleep 30

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