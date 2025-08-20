#!/usr/bin/env python3
"""
Log Data Loss Analysis Tool
UDP -> Logstash -> Kafka -> OpenSearch 파이프라인에서 데이터 누수를 분석하는 도구
"""

import asyncio
import json
import time
import subprocess
import threading
import signal
import sys
from datetime import datetime, timedelta
from collections import deque, defaultdict
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Tuple
import argparse
import os
import psutil

try:
    import requests
    from kafka import KafkaConsumer
    from elasticsearch import Elasticsearch
    HAS_KAFKA = True
    HAS_ES = True
except ImportError:
    print("Required packages missing. Install with:")
    print("pip install requests kafka-python elasticsearch")
    HAS_KAFKA = False
    HAS_ES = False


@dataclass
class PacketStats:
    timestamp: float
    sent_packets: int = 0
    received_packets: int = 0
    kafka_messages: int = 0
    opensearch_docs: int = 0
    system_cpu: float = 0.0
    system_memory: float = 0.0
    
    @property
    def udp_loss_rate(self) -> float:
        if self.sent_packets == 0:
            return 0.0
        return (self.sent_packets - self.received_packets) / self.sent_packets * 100
    
    @property  
    def total_loss_rate(self) -> float:
        if self.sent_packets == 0:
            return 0.0
        return (self.sent_packets - self.opensearch_docs) / self.sent_packets * 100


class LogMonitoringTool:
    def __init__(self, config: Dict):
        self.config = config
        self.stats_history = deque(maxlen=1000)
        self.running = False
        self.tcpdump_process = None
        self.kafka_consumer = None
        self.es_client = None
        
        # 카운터
        self.packet_counts = defaultdict(int)
        self.last_counts = defaultdict(int)
        
        # 시간 윈도우별 통계
        self.window_size = config.get('window_size', 10)  # 10초 윈도우
        self.time_windows = deque(maxlen=config.get('max_windows', 100))
        
    def setup_clients(self):
        """Kafka와 OpenSearch 클라이언트 설정"""
        try:
            if HAS_KAFKA and self.config.get('kafka_enabled', True):
                self.kafka_consumer = KafkaConsumer(
                    self.config['kafka_topic'],
                    bootstrap_servers=[self.config['kafka_host']],
                    group_id=f"monitor-{int(time.time())}",
                    auto_offset_reset='latest',
                    value_deserializer=lambda x: json.loads(x.decode('utf-8')),
                    consumer_timeout_ms=1000
                )
                print("✅ Kafka consumer connected")
                
            if HAS_ES and self.config.get('opensearch_enabled', True):
                self.es_client = Elasticsearch(
                    [self.config['opensearch_host']],
                    http_auth=(self.config['opensearch_user'], self.config['opensearch_password']),
                    verify_certs=False
                )
                print("✅ OpenSearch client connected")
                
        except Exception as e:
            print(f"⚠️  Client setup warning: {e}")

    def start_tcpdump_monitoring(self) -> bool:
        """tcpdump를 사용하여 UDP 패킷 모니터링 시작"""
        try:
            # UDP 수신 패킷 모니터링 (logstash 포트)
            cmd = [
                'tcpdump', '-i', self.config.get('interface', 'any'),
                '-n', 'port', str(self.config['udp_port']),
                '-c', '0'  # 무제한
            ]
            
            self.tcpdump_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            
            print(f"✅ tcpdump monitoring started on port {self.config['udp_port']}")
            return True
            
        except Exception as e:
            print(f"❌ Failed to start tcpdump: {e}")
            return False

    def count_packets_from_tcpdump(self):
        """tcpdump 출력에서 패킷 수 카운트"""
        packet_count = 0
        if not self.tcpdump_process:
            return
            
        try:
            while self.running and self.tcpdump_process.poll() is None:
                line = self.tcpdump_process.stdout.readline()
                if line:
                    packet_count += 1
                    if packet_count % 100 == 0:
                        print(f"📦 TCP dump packets: {packet_count}")
                        
        except Exception as e:
            print(f"❌ tcpdump monitoring error: {e}")

    def count_kafka_messages(self) -> int:
        """Kafka에서 메시지 수 카운트"""
        if not self.kafka_consumer:
            return 0
            
        message_count = 0
        try:
            for message in self.kafka_consumer:
                message_count += 1
                if not self.running:
                    break
                    
        except Exception as e:
            print(f"⚠️  Kafka monitoring warning: {e}")
            
        return message_count

    def count_opensearch_docs(self) -> int:
        """OpenSearch에서 문서 수 카운트"""
        if not self.es_client:
            return 0
            
        try:
            # 최근 1분간의 문서 수 조회
            now = datetime.now()
            one_minute_ago = now - timedelta(minutes=1)
            
            query = {
                "query": {
                    "range": {
                        "@timestamp": {
                            "gte": one_minute_ago.isoformat(),
                            "lte": now.isoformat()
                        }
                    }
                }
            }
            
            response = self.es_client.search(
                index="alias_*",
                body=query,
                size=0,
                timeout="10s"
            )
            
            return response['hits']['total']['value']
            
        except Exception as e:
            print(f"⚠️  OpenSearch query warning: {e}")
            return 0

    def get_system_stats(self) -> Tuple[float, float]:
        """시스템 리소스 사용률 조회"""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory_percent = psutil.virtual_memory().percent
            return cpu_percent, memory_percent
        except Exception as e:
            print(f"⚠️  System stats warning: {e}")
            return 0.0, 0.0

    def analyze_bottlenecks(self, stats: PacketStats) -> List[str]:
        """병목 구간 분석"""
        issues = []
        
        # UDP 손실률 체크
        if stats.udp_loss_rate > 5.0:
            issues.append(f"🚨 HIGH UDP Loss: {stats.udp_loss_rate:.1f}% - Check UDP buffer size")
            
        # Kafka 백로그 체크
        kafka_gap = stats.received_packets - stats.kafka_messages
        if kafka_gap > 1000:
            issues.append(f"🚨 Kafka Backlog: {kafka_gap} messages - Check Kafka throughput")
            
        # OpenSearch 인덱싱 지연 체크
        es_gap = stats.kafka_messages - stats.opensearch_docs
        if es_gap > 500:
            issues.append(f"🚨 OpenSearch Lag: {es_gap} docs - Check indexing performance")
            
        # 시스템 리소스 체크
        if stats.system_cpu > 80:
            issues.append(f"🚨 HIGH CPU: {stats.system_cpu:.1f}% - System overloaded")
            
        if stats.system_memory > 85:
            issues.append(f"🚨 HIGH Memory: {stats.system_memory:.1f}% - Memory pressure")
            
        return issues

    def generate_report(self) -> Dict:
        """분석 리포트 생성"""
        if not self.stats_history:
            return {"error": "No data collected"}
            
        recent_stats = list(self.stats_history)[-10:]  # 최근 10개 데이터
        
        # 평균 손실률 계산
        avg_udp_loss = sum(s.udp_loss_rate for s in recent_stats) / len(recent_stats)
        avg_total_loss = sum(s.total_loss_rate for s in recent_stats) / len(recent_stats)
        
        # 총 처리량 계산
        if len(recent_stats) > 1:
            time_span = recent_stats[-1].timestamp - recent_stats[0].timestamp
            total_sent = recent_stats[-1].sent_packets - recent_stats[0].sent_packets
            throughput = total_sent / time_span if time_span > 0 else 0
        else:
            throughput = 0
            
        return {
            "summary": {
                "avg_udp_loss_rate": round(avg_udp_loss, 2),
                "avg_total_loss_rate": round(avg_total_loss, 2),
                "throughput_per_sec": round(throughput, 2),
                "total_samples": len(self.stats_history)
            },
            "latest": asdict(recent_stats[-1]) if recent_stats else None,
            "issues": self.analyze_bottlenecks(recent_stats[-1]) if recent_stats else []
        }

    def print_real_time_stats(self, stats: PacketStats):
        """실시간 통계 출력"""
        print(f"\n{'='*80}")
        print(f"⏰ Time: {datetime.fromtimestamp(stats.timestamp).strftime('%H:%M:%S')}")
        print(f"📤 Sent: {stats.sent_packets:,} | 📥 Received: {stats.received_packets:,} | Loss: {stats.udp_loss_rate:.1f}%")
        print(f"🔄 Kafka: {stats.kafka_messages:,} | 💾 OpenSearch: {stats.opensearch_docs:,}")
        print(f"💻 CPU: {stats.system_cpu:.1f}% | 🧠 Memory: {stats.system_memory:.1f}%")
        print(f"📊 Total Loss Rate: {stats.total_loss_rate:.1f}%")
        
        # 병목 이슈 표시
        issues = self.analyze_bottlenecks(stats)
        if issues:
            print("\n⚠️  ISSUES DETECTED:")
            for issue in issues:
                print(f"   {issue}")

    async def monitor_loop(self):
        """메인 모니터링 루프"""
        print("🚀 Starting monitoring loop...")
        
        # 로그 생성 프로세스의 PID 추적 (옵션)
        loggen_pids = []
        
        while self.running:
            try:
                # 현재 시간
                current_time = time.time()
                
                # 각 구간별 데이터 수집
                sent_count = self.get_sent_packet_count()
                received_count = self.get_logstash_received_count()
                kafka_count = self.count_kafka_messages() if self.config.get('kafka_enabled') else 0
                opensearch_count = self.count_opensearch_docs() if self.config.get('opensearch_enabled') else 0
                
                # 시스템 리소스
                cpu_percent, memory_percent = self.get_system_stats()
                
                # 통계 생성
                stats = PacketStats(
                    timestamp=current_time,
                    sent_packets=sent_count,
                    received_packets=received_count,
                    kafka_messages=kafka_count,
                    opensearch_docs=opensearch_count,
                    system_cpu=cpu_percent,
                    system_memory=memory_percent
                )
                
                # 히스토리에 추가
                self.stats_history.append(stats)
                
                # 실시간 출력
                if self.config.get('real_time_output', True):
                    self.print_real_time_stats(stats)
                
                # 모니터링 간격
                await asyncio.sleep(self.config.get('monitor_interval', 5))
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"❌ Monitoring error: {e}")
                await asyncio.sleep(1)

    def get_sent_packet_count(self) -> int:
        """송신 패킷 수 조회 (loggen 출력 파싱 또는 별도 카운터)"""
        # 실제 구현에서는 loggen의 출력을 파싱하거나 별도 카운터 사용
        return self.packet_counts.get('sent', 0)

    def get_logstash_received_count(self) -> int:
        """Logstash가 수신한 패킷 수 조회"""
        # Logstash 메트릭 API 호출 또는 로그 파싱
        return self.packet_counts.get('received', 0)

    def start_monitoring(self):
        """모니터링 시작"""
        self.running = True
        self.setup_clients()
        
        # tcpdump 모니터링 스레드 시작
        if self.config.get('tcpdump_enabled', True):
            if self.start_tcpdump_monitoring():
                threading.Thread(target=self.count_packets_from_tcpdump, daemon=True).start()
        
        print("🔍 Log monitoring started. Press Ctrl+C to stop and generate report.")
        
        # 메인 모니터링 루프 시작
        try:
            asyncio.run(self.monitor_loop())
        except KeyboardInterrupt:
            self.stop_monitoring()

    def stop_monitoring(self):
        """모니터링 중지"""
        print("\n🛑 Stopping monitoring...")
        self.running = False
        
        # tcpdump 프로세스 종료
        if self.tcpdump_process:
            self.tcpdump_process.terminate()
            
        # 클라이언트 정리
        if self.kafka_consumer:
            self.kafka_consumer.close()
            
        # 최종 리포트 생성
        report = self.generate_report()
        self.save_report(report)
        self.print_final_report(report)

    def save_report(self, report: Dict):
        """리포트를 파일로 저장"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"log_monitoring_report_{timestamp}.json"
        
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2, ensure_ascii=False)
            print(f"📋 Report saved to: {filename}")
        except Exception as e:
            print(f"❌ Failed to save report: {e}")

    def print_final_report(self, report: Dict):
        """최종 분석 리포트 출력"""
        print(f"\n{'='*80}")
        print("📋 FINAL ANALYSIS REPORT")
        print(f"{'='*80}")
        
        if "error" in report:
            print(f"❌ {report['error']}")
            return
            
        summary = report.get('summary', {})
        print(f"📊 Average UDP Loss Rate: {summary.get('avg_udp_loss_rate', 0):.2f}%")
        print(f"📊 Average Total Loss Rate: {summary.get('avg_total_loss_rate', 0):.2f}%") 
        print(f"⚡ Average Throughput: {summary.get('throughput_per_sec', 0):.0f} packets/sec")
        print(f"🔢 Total Samples: {summary.get('total_samples', 0)}")
        
        # 주요 이슈 요약
        issues = report.get('issues', [])
        if issues:
            print(f"\n⚠️  KEY ISSUES IDENTIFIED:")
            for i, issue in enumerate(issues, 1):
                print(f"   {i}. {issue}")
        else:
            print(f"\n✅ No critical issues detected")
            
        # 권장사항
        print(f"\n💡 RECOMMENDATIONS:")
        if summary.get('avg_udp_loss_rate', 0) > 3:
            print("   • Increase Logstash UDP queue_size (currently 50000)")
            print("   • Consider multiple Logstash instances for load balancing")
            
        if summary.get('avg_total_loss_rate', 0) > 5:
            print("   • Check Kafka throughput and partition configuration")
            print("   • Optimize OpenSearch indexing performance")
            print("   • Monitor system resources (CPU/Memory)")


def create_default_config() -> Dict:
    """기본 설정 생성"""
    return {
        # 네트워크 설정
        'udp_port': 514,
        'interface': 'any',
        'kafka_host': 'localhost:9092',
        'kafka_topic': 'log_topic_v11.0',
        'opensearch_host': 'http://localhost:9200',
        'opensearch_user': 'admin',
        'opensearch_password': 'PaloLog2024!@#$',
        
        # 모니터링 설정
        'monitor_interval': 5,  # 5초 간격
        'window_size': 10,      # 10초 윈도우
        'max_windows': 100,     # 최대 100개 윈도우 저장
        
        # 기능 활성화
        'tcpdump_enabled': True,
        'kafka_enabled': True,
        'opensearch_enabled': True,
        'real_time_output': True,
    }


def main():
    parser = argparse.ArgumentParser(description='Log Data Loss Analysis Tool')
    parser.add_argument('--config', help='Configuration file path (JSON)')
    parser.add_argument('--udp-port', type=int, default=514, help='UDP port to monitor')
    parser.add_argument('--interval', type=int, default=5, help='Monitoring interval in seconds')
    parser.add_argument('--duration', type=int, help='Monitoring duration in seconds')
    parser.add_argument('--output', help='Output report file path')
    parser.add_argument('--quiet', action='store_true', help='Suppress real-time output')
    
    args = parser.parse_args()
    
    # 설정 로드
    if args.config and os.path.exists(args.config):
        with open(args.config, 'r') as f:
            config = json.load(f)
    else:
        config = create_default_config()
    
    # 명령행 인수로 설정 덮어쓰기
    if args.udp_port:
        config['udp_port'] = args.udp_port
    if args.interval:
        config['monitor_interval'] = args.interval
    if args.quiet:
        config['real_time_output'] = False
        
    # 모니터링 도구 시작
    monitor = LogMonitoringTool(config)
    
    # 시그널 핸들러 등록
    def signal_handler(signum, frame):
        print(f"\n📨 Received signal {signum}")
        monitor.stop_monitoring()
        sys.exit(0)
        
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 모니터링 시작
    try:
        if args.duration:
            print(f"⏱️  Running for {args.duration} seconds...")
            # TODO: 타이머 기반 자동 종료 구현
            
        monitor.start_monitoring()
        
    except Exception as e:
        print(f"❌ Failed to start monitoring: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()