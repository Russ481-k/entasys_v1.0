#!/usr/bin/env python3
"""
Data Storage Success Rate Tracker
OpenSearch와 Kafka의 데이터 저장 성공률을 추적하고 분석하는 도구
"""

import asyncio
import json
import time
from datetime import datetime, timedelta
from collections import defaultdict, deque
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Tuple, Any
import argparse
import signal
import sys
import threading

try:
    import requests
    from kafka import KafkaConsumer, KafkaAdminClient, TopicPartition
    from kafka.structs import TopicPartition
    from elasticsearch import Elasticsearch
    from elasticsearch.exceptions import ConnectionError, RequestError
    HAS_DEPS = True
except ImportError:
    print("Required packages missing. Install with:")
    print("pip install requests kafka-python elasticsearch")
    HAS_DEPS = False


@dataclass
class StorageMetrics:
    """데이터 저장 성공률 메트릭"""
    timestamp: datetime
    kafka_messages_total: int
    kafka_messages_processed: int
    opensearch_docs_indexed: int
    opensearch_docs_failed: int
    storage_success_rate: float
    indexing_rate: float
    error_rate: float
    
    def to_dict(self):
        return {
            'timestamp': self.timestamp.isoformat(),
            'kafka_messages_total': self.kafka_messages_total,
            'kafka_messages_processed': self.kafka_messages_processed,
            'opensearch_docs_indexed': self.opensearch_docs_indexed,
            'opensearch_docs_failed': self.opensearch_docs_failed,
            'storage_success_rate': round(self.storage_success_rate, 2),
            'indexing_rate': round(self.indexing_rate, 2),
            'error_rate': round(self.error_rate, 2)
        }


@dataclass
class IndexStats:
    """인덱스별 통계"""
    index_name: str
    doc_count: int
    size_bytes: int
    last_updated: datetime
    error_count: int = 0


class DataStorageTracker:
    """데이터 저장 성공률 추적기"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.running = False
        
        # 클라이언트
        self.es_client = None
        self.kafka_admin = None
        self.kafka_consumer = None
        
        # 메트릭 저장소
        self.metrics_history = deque(maxlen=1000)
        self.index_stats = {}
        self.error_log = deque(maxlen=500)
        
        # 카운터
        self.counters = defaultdict(int)
        self.last_counters = defaultdict(int)
        
        # 모니터링 간격
        self.monitor_interval = config.get('monitor_interval', 10)  # 10초
        self.detailed_check_interval = config.get('detailed_check_interval', 60)  # 60초
        
        # 마지막 체크 시간
        self.last_detailed_check = 0

    def setup_clients(self):
        """클라이언트 설정 및 연결"""
        try:
            # OpenSearch 클라이언트 설정
            self.es_client = Elasticsearch(
                [self.config['opensearch_host']],
                http_auth=(
                    self.config['opensearch_user'], 
                    self.config['opensearch_password']
                ),
                verify_certs=False,
                timeout=30,
                max_retries=3,
                retry_on_timeout=True
            )
            
            # 연결 테스트
            info = self.es_client.info()
            print(f"✅ OpenSearch connected: {info['version']['number']}")
            
        except Exception as e:
            print(f"❌ OpenSearch connection failed: {e}")
            self.es_client = None
            
        try:
            # Kafka 클라이언트 설정
            self.kafka_admin = KafkaAdminClient(
                bootstrap_servers=[self.config['kafka_host']],
                request_timeout_ms=10000
            )
            
            # Kafka Consumer 설정 (메타데이터 수집용)
            self.kafka_consumer = KafkaConsumer(
                bootstrap_servers=[self.config['kafka_host']],
                group_id=f"storage-tracker-{int(time.time())}",
                auto_offset_reset='latest',
                enable_auto_commit=True,
                consumer_timeout_ms=5000
            )
            
            # 토픽 확인
            topics = self.kafka_consumer.topics()
            if self.config['kafka_topic'] in topics:
                print(f"✅ Kafka connected: topic '{self.config['kafka_topic']}' found")
            else:
                print(f"⚠️  Kafka topic '{self.config['kafka_topic']}' not found")
                
        except Exception as e:
            print(f"❌ Kafka connection failed: {e}")
            self.kafka_admin = None
            self.kafka_consumer = None

    async def get_kafka_message_count(self) -> Tuple[int, int]:
        """Kafka 메시지 수 조회 (총 메시지, 처리된 메시지)"""
        if not self.kafka_consumer:
            return 0, 0
            
        try:
            topic = self.config['kafka_topic']
            
            # 토픽 파티션 정보 가져오기
            partitions = self.kafka_consumer.partitions_for_topic(topic)
            if not partitions:
                return 0, 0
                
            total_messages = 0
            processed_messages = 0
            
            for partition_id in partitions:
                tp = TopicPartition(topic, partition_id)
                
                # 파티션의 최신 오프셋 (총 메시지 수)
                self.kafka_consumer.assign([tp])
                self.kafka_consumer.seek_to_end(tp)
                latest_offset = self.kafka_consumer.position(tp)
                
                # 파티션의 시작 오프셋
                self.kafka_consumer.seek_to_beginning(tp)
                earliest_offset = self.kafka_consumer.position(tp)
                
                partition_total = latest_offset - earliest_offset
                total_messages += partition_total
                
                # 컨슈머 그룹의 처리된 오프셋 (간접적으로 추정)
                # 실제로는 컨슈머 그룹 정보를 조회해야 함
                processed_messages += partition_total  # 임시로 동일하게 설정
                
            return total_messages, processed_messages
            
        except Exception as e:
            print(f"⚠️  Kafka message count error: {e}")
            return 0, 0

    async def get_opensearch_stats(self) -> Tuple[int, int]:
        """OpenSearch 통계 조회 (인덱싱 성공, 실패)"""
        if not self.es_client:
            return 0, 0
            
        try:
            # 클러스터 통계
            cluster_stats = self.es_client.cluster.stats()
            indices_stats = self.es_client.indices.stats()
            
            total_docs = cluster_stats['indices']['count']
            failed_docs = 0
            
            # 인덱스별 상세 정보
            for index_name, stats in indices_stats['indices'].items():
                if index_name.startswith('alias_'):  # PaloLog 인덱스만
                    doc_count = stats['primaries']['docs']['count']
                    size_bytes = stats['primaries']['store']['size_in_bytes']
                    
                    # 인덱스 통계 업데이트
                    self.index_stats[index_name] = IndexStats(
                        index_name=index_name,
                        doc_count=doc_count,
                        size_bytes=size_bytes,
                        last_updated=datetime.now()
                    )
                    
                    # 인덱싱 실패 정보 수집
                    if 'indexing' in stats['primaries']:
                        failed_docs += stats['primaries']['indexing'].get('index_failed', 0)
            
            total_indexed = sum(idx.doc_count for idx in self.index_stats.values())
            
            return total_indexed, failed_docs
            
        except Exception as e:
            print(f"⚠️  OpenSearch stats error: {e}")
            return 0, 0

    async def get_detailed_opensearch_info(self) -> Dict[str, Any]:
        """상세 OpenSearch 정보 수집"""
        if not self.es_client:
            return {}
            
        try:
            # 최근 1분간 인덱싱 활동 조회
            now = datetime.now()
            one_minute_ago = now - timedelta(minutes=1)
            
            # 각 인덱스별 최근 문서 수
            recent_docs = {}
            
            for index_pattern in ['alias_*']:
                try:
                    response = self.es_client.search(
                        index=index_pattern,
                        body={
                            "query": {
                                "range": {
                                    "@timestamp": {
                                        "gte": one_minute_ago.isoformat(),
                                        "lte": now.isoformat()
                                    }
                                }
                            },
                            "aggs": {
                                "by_index": {
                                    "terms": {
                                        "field": "_index",
                                        "size": 100
                                    }
                                }
                            }
                        },
                        size=0,
                        timeout="10s"
                    )
                    
                    # 인덱스별 최근 문서 수 집계
                    for bucket in response['aggregations']['by_index']['buckets']:
                        index_name = bucket['key']
                        doc_count = bucket['doc_count']
                        recent_docs[index_name] = doc_count
                        
                except Exception as e:
                    print(f"⚠️  Search error for {index_pattern}: {e}")
            
            # 클러스터 상태
            cluster_health = self.es_client.cluster.health()
            
            return {
                'recent_docs': recent_docs,
                'cluster_health': cluster_health['status'],
                'active_shards': cluster_health['active_shards'],
                'relocating_shards': cluster_health['relocating_shards'],
                'initializing_shards': cluster_health['initializing_shards'],
                'unassigned_shards': cluster_health['unassigned_shards'],
                'number_of_nodes': cluster_health['number_of_nodes']
            }
            
        except Exception as e:
            print(f"⚠️  Detailed OpenSearch info error: {e}")
            return {}

    def calculate_storage_metrics(self) -> StorageMetrics:
        """저장 메트릭 계산"""
        current_time = datetime.now()
        
        # 카운터 값들
        kafka_total = self.counters['kafka_messages_total']
        kafka_processed = self.counters['kafka_messages_processed']
        opensearch_indexed = self.counters['opensearch_docs_indexed']
        opensearch_failed = self.counters['opensearch_docs_failed']
        
        # 성공률 계산
        if kafka_total > 0:
            storage_success_rate = (opensearch_indexed / kafka_total) * 100
        else:
            storage_success_rate = 0.0
            
        # 인덱싱 처리율 계산
        if kafka_processed > 0:
            indexing_rate = (opensearch_indexed / kafka_processed) * 100
        else:
            indexing_rate = 0.0
            
        # 에러율 계산
        total_operations = opensearch_indexed + opensearch_failed
        if total_operations > 0:
            error_rate = (opensearch_failed / total_operations) * 100
        else:
            error_rate = 0.0
            
        return StorageMetrics(
            timestamp=current_time,
            kafka_messages_total=kafka_total,
            kafka_messages_processed=kafka_processed,
            opensearch_docs_indexed=opensearch_indexed,
            opensearch_docs_failed=opensearch_failed,
            storage_success_rate=storage_success_rate,
            indexing_rate=indexing_rate,
            error_rate=error_rate
        )

    def print_real_time_stats(self, metrics: StorageMetrics, detailed_info: Optional[Dict] = None):
        """실시간 통계 출력"""
        print(f"\n{'='*80}")
        print(f"💾 DATA STORAGE TRACKING - {metrics.timestamp.strftime('%H:%M:%S')}")
        print(f"{'='*80}")
        
        # 기본 메트릭
        print(f"📨 Kafka Messages: {metrics.kafka_messages_total:,} total, {metrics.kafka_messages_processed:,} processed")
        print(f"💾 OpenSearch Docs: {metrics.opensearch_docs_indexed:,} indexed, {metrics.opensearch_docs_failed:,} failed")
        print(f"📊 Storage Success Rate: {metrics.storage_success_rate:.2f}%")
        print(f"⚡ Indexing Rate: {metrics.indexing_rate:.2f}%")
        print(f"❌ Error Rate: {metrics.error_rate:.2f}%")
        
        # 인덱스별 상세 정보
        if self.index_stats:
            print(f"\n📊 INDEX STATISTICS:")
            for idx_name, stats in list(self.index_stats.items())[:5]:  # 상위 5개만 표시
                print(f"   {idx_name}: {stats.doc_count:,} docs ({stats.size_bytes/1024/1024:.1f}MB)")
        
        # 상세 정보 (1분마다)
        if detailed_info:
            print(f"\n🔍 DETAILED ANALYSIS:")
            print(f"   Cluster Health: {detailed_info.get('cluster_health', 'unknown')}")
            print(f"   Active Nodes: {detailed_info.get('number_of_nodes', 0)}")
            
            recent_docs = detailed_info.get('recent_docs', {})
            if recent_docs:
                total_recent = sum(recent_docs.values())
                print(f"   Recent Activity: {total_recent:,} docs in last minute")
                
        # 경고 메시지
        if metrics.storage_success_rate < 90:
            print(f"🚨 LOW STORAGE SUCCESS RATE: {metrics.storage_success_rate:.1f}%")
            
        if metrics.error_rate > 5:
            print(f"🚨 HIGH ERROR RATE: {metrics.error_rate:.1f}%")
            
        if detailed_info and detailed_info.get('cluster_health') == 'red':
            print(f"🚨 CLUSTER HEALTH CRITICAL: {detailed_info.get('cluster_health')}")

    async def monitor_loop(self):
        """메인 모니터링 루프"""
        print("🚀 Starting data storage monitoring...")
        
        while self.running:
            try:
                # Kafka 메시지 수 조회
                kafka_total, kafka_processed = await self.get_kafka_message_count()
                self.counters['kafka_messages_total'] = kafka_total
                self.counters['kafka_messages_processed'] = kafka_processed
                
                # OpenSearch 통계 조회
                opensearch_indexed, opensearch_failed = await self.get_opensearch_stats()
                self.counters['opensearch_docs_indexed'] = opensearch_indexed
                self.counters['opensearch_docs_failed'] = opensearch_failed
                
                # 메트릭 계산
                metrics = self.calculate_storage_metrics()
                self.metrics_history.append(metrics)
                
                # 상세 정보 (1분마다)
                detailed_info = None
                current_time = time.time()
                if current_time - self.last_detailed_check >= self.detailed_check_interval:
                    detailed_info = await self.get_detailed_opensearch_info()
                    self.last_detailed_check = current_time
                
                # 실시간 출력
                if self.config.get('real_time_output', True):
                    self.print_real_time_stats(metrics, detailed_info)
                
                # 모니터링 간격 대기
                await asyncio.sleep(self.monitor_interval)
                
            except Exception as e:
                print(f"❌ Monitoring error: {e}")
                await asyncio.sleep(5)

    def analyze_storage_issues(self, metrics_list: List[StorageMetrics]) -> List[str]:
        """저장 이슈 분석"""
        if not metrics_list:
            return []
            
        issues = []
        recent_metrics = metrics_list[-10:]  # 최근 10개 데이터
        
        # 평균 성공률 계산
        avg_success_rate = sum(m.storage_success_rate for m in recent_metrics) / len(recent_metrics)
        avg_error_rate = sum(m.error_rate for m in recent_metrics) / len(recent_metrics)
        
        # 이슈 감지
        if avg_success_rate < 80:
            issues.append(f"🚨 Critical: Low storage success rate ({avg_success_rate:.1f}%)")
            
        if avg_success_rate < 95:
            issues.append(f"⚠️  Warning: Storage success rate below optimal ({avg_success_rate:.1f}%)")
            
        if avg_error_rate > 5:
            issues.append(f"🚨 High error rate detected ({avg_error_rate:.1f}%)")
            
        # 트렌드 분석
        if len(recent_metrics) >= 5:
            early_avg = sum(m.storage_success_rate for m in recent_metrics[:3]) / 3
            late_avg = sum(m.storage_success_rate for m in recent_metrics[-3:]) / 3
            
            if early_avg - late_avg > 10:
                issues.append("📉 Storage performance is degrading over time")
            elif late_avg - early_avg > 10:
                issues.append("📈 Storage performance is improving")
                
        return issues

    def generate_recommendations(self, issues: List[str]) -> List[str]:
        """개선 권장사항 생성"""
        recommendations = []
        
        if any('Low storage success rate' in issue for issue in issues):
            recommendations.extend([
                "• Check OpenSearch cluster health and resource usage",
                "• Verify Logstash consumer performance and errors",
                "• Consider increasing OpenSearch indexing threads",
                "• Review index mapping and analyzer configurations"
            ])
            
        if any('High error rate' in issue for issue in issues):
            recommendations.extend([
                "• Check OpenSearch logs for indexing errors",
                "• Verify data format compatibility with index mappings",
                "• Monitor disk space and memory usage",
                "• Consider implementing retry logic for failed documents"
            ])
            
        if any('degrading' in issue for issue in issues):
            recommendations.extend([
                "• Monitor system resources (CPU, Memory, Disk I/O)",
                "• Check for index fragmentation and optimization needs",
                "• Review concurrent indexing settings",
                "• Consider implementing data retention policies"
            ])
            
        if not recommendations:
            recommendations = [
                "• Current performance is within acceptable range",
                "• Continue monitoring for trends and patterns",
                "• Consider implementing automated alerting"
            ]
            
        return recommendations

    def generate_final_report(self) -> Dict:
        """최종 리포트 생성"""
        if not self.metrics_history:
            return {"error": "No data collected"}
            
        metrics_list = list(self.metrics_history)
        latest_metrics = metrics_list[-1]
        
        # 전체 기간 통계
        total_kafka_messages = latest_metrics.kafka_messages_total
        total_indexed_docs = latest_metrics.opensearch_docs_indexed
        total_failed_docs = latest_metrics.opensearch_docs_failed
        
        # 평균 성능 지표
        avg_success_rate = sum(m.storage_success_rate for m in metrics_list) / len(metrics_list)
        avg_indexing_rate = sum(m.indexing_rate for m in metrics_list) / len(metrics_list)
        avg_error_rate = sum(m.error_rate for m in metrics_list) / len(metrics_list)
        
        # 이슈 분석
        issues = self.analyze_storage_issues(metrics_list)
        recommendations = self.generate_recommendations(issues)
        
        return {
            "summary": {
                "monitoring_duration": len(metrics_list) * self.monitor_interval,
                "total_kafka_messages": total_kafka_messages,
                "total_indexed_docs": total_indexed_docs,
                "total_failed_docs": total_failed_docs,
                "avg_storage_success_rate": round(avg_success_rate, 2),
                "avg_indexing_rate": round(avg_indexing_rate, 2),
                "avg_error_rate": round(avg_error_rate, 2)
            },
            "index_statistics": {
                name: asdict(stats) for name, stats in self.index_stats.items()
            },
            "issues_identified": issues,
            "recommendations": recommendations,
            "latest_metrics": asdict(latest_metrics),
            "metrics_history": [asdict(m) for m in metrics_list[-20:]]  # 최근 20개
        }

    def save_report(self, report: Dict):
        """리포트 저장"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"storage_tracking_report_{timestamp}.json"
        
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2, ensure_ascii=False, default=str)
            print(f"📋 Report saved to: {filename}")
        except Exception as e:
            print(f"❌ Failed to save report: {e}")

    def print_final_report(self, report: Dict):
        """최종 리포트 출력"""
        print(f"\n{'='*80}")
        print("📋 DATA STORAGE TRACKING - FINAL REPORT")
        print(f"{'='*80}")
        
        if "error" in report:
            print(f"❌ {report['error']}")
            return
            
        summary = report['summary']
        print(f"📊 PERFORMANCE SUMMARY:")
        print(f"   Monitoring Duration: {summary['monitoring_duration']} seconds")
        print(f"   Total Kafka Messages: {summary['total_kafka_messages']:,}")
        print(f"   Total Indexed Documents: {summary['total_indexed_docs']:,}")
        print(f"   Total Failed Documents: {summary['total_failed_docs']:,}")
        print(f"   Average Storage Success Rate: {summary['avg_storage_success_rate']:.2f}%")
        print(f"   Average Indexing Rate: {summary['avg_indexing_rate']:.2f}%")
        print(f"   Average Error Rate: {summary['avg_error_rate']:.2f}%")
        
        # 인덱스 통계
        index_stats = report.get('index_statistics', {})
        if index_stats:
            print(f"\n📊 TOP INDICES:")
            sorted_indices = sorted(
                index_stats.items(), 
                key=lambda x: x[1]['doc_count'], 
                reverse=True
            )
            for idx_name, stats in sorted_indices[:5]:
                print(f"   {idx_name}: {stats['doc_count']:,} docs ({stats['size_bytes']/1024/1024:.1f}MB)")
        
        # 이슈 및 권장사항
        issues = report.get('issues_identified', [])
        if issues:
            print(f"\n⚠️  ISSUES IDENTIFIED:")
            for issue in issues:
                print(f"   {issue}")
                
        recommendations = report.get('recommendations', [])
        print(f"\n💡 RECOMMENDATIONS:")
        for rec in recommendations:
            print(f"   {rec}")

    async def start_monitoring(self):
        """모니터링 시작"""
        self.running = True
        self.setup_clients()
        
        print("🔍 Data storage monitoring started. Press Ctrl+C to stop and generate report.")
        
        try:
            await self.monitor_loop()
        except KeyboardInterrupt:
            await self.stop_monitoring()

    async def stop_monitoring(self):
        """모니터링 중지"""
        print("\n🛑 Stopping data storage monitoring...")
        self.running = False
        
        # 클라이언트 정리
        if self.kafka_consumer:
            self.kafka_consumer.close()
            
        # 최종 리포트 생성
        report = self.generate_final_report()
        self.save_report(report)
        self.print_final_report(report)


def create_default_config():
    """기본 설정"""
    return {
        'kafka_host': 'localhost:9092',
        'kafka_topic': 'log_topic_v11.0',
        'opensearch_host': 'http://localhost:9200',
        'opensearch_user': 'admin',
        'opensearch_password': 'PaloLog2024!@#$',
        'monitor_interval': 10,
        'detailed_check_interval': 60,
        'real_time_output': True
    }


async def main():
    if not HAS_DEPS:
        print("❌ Required dependencies not installed")
        return
        
    parser = argparse.ArgumentParser(description='Data Storage Success Rate Tracker')
    parser.add_argument('--config', help='Configuration file path (JSON)')
    parser.add_argument('--interval', type=int, default=10, help='Monitoring interval in seconds')
    parser.add_argument('--quiet', action='store_true', help='Suppress real-time output')
    
    args = parser.parse_args()
    
    # 설정 로드
    config = create_default_config()
    if args.config:
        try:
            with open(args.config, 'r') as f:
                config.update(json.load(f))
        except Exception as e:
            print(f"⚠️  Config file error: {e}")
            
    # 명령행 인수 적용
    if args.interval:
        config['monitor_interval'] = args.interval
    if args.quiet:
        config['real_time_output'] = False
        
    # 트래커 시작
    tracker = DataStorageTracker(config)
    
    # 시그널 핸들러
    def signal_handler(signum, frame):
        print(f"\n📨 Received signal {signum}")
        asyncio.create_task(tracker.stop_monitoring())
        
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        await tracker.start_monitoring()
    except Exception as e:
        print(f"❌ Tracking failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())