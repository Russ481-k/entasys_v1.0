#!/usr/bin/env python3
"""
UDP Packet Loss Analyzer
tcpdump와 logstash 로그를 실시간으로 분석하여 UDP 패킷 손실률을 정확히 측정
"""

import subprocess
import threading
import time
import json
import signal
import sys
from collections import defaultdict, deque
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Dict, List, Optional
import argparse
import re
import os


@dataclass
class PacketLossMetrics:
    """패킷 손실 메트릭"""
    timestamp: datetime
    sent_packets: int
    received_packets: int
    logstash_processed: int
    loss_rate: float
    processing_delay: float
    
    def to_dict(self):
        return {
            'timestamp': self.timestamp.isoformat(),
            'sent_packets': self.sent_packets,
            'received_packets': self.received_packets,
            'logstash_processed': self.logstash_processed,
            'loss_rate': round(self.loss_rate, 2),
            'processing_delay': round(self.processing_delay, 2)
        }


class UDPPacketAnalyzer:
    def __init__(self, config: Dict):
        self.config = config
        self.running = False
        
        # 프로세스 관리
        self.tcpdump_process = None
        self.logstash_monitor_thread = None
        self.loggen_process = None
        
        # 패킷 카운터
        self.sent_count = 0
        self.received_count = 0  # tcpdump로 확인된 패킷
        self.processed_count = 0  # logstash에서 처리된 패킷
        
        # 시간별 통계
        self.metrics_history = deque(maxlen=1000)
        self.time_window = config.get('time_window', 10)  # 10초 윈도우
        
        # 실시간 모니터링
        self.last_report_time = time.time()
        self.report_interval = config.get('report_interval', 5)  # 5초마다 리포트
        
        # 로그 패턴
        self.udp_pattern = re.compile(r'UDP.*length (\d+)')
        self.logstash_pattern = re.compile(r'logstash.*received')

    def start_tcpdump_monitoring(self):
        """tcpdump를 사용한 UDP 패킷 모니터링 시작"""
        interface = self.config.get('interface', 'any')
        port = self.config.get('udp_port', 514)
        
        # tcpdump 명령어 구성
        cmd = [
            'tcpdump', 
            '-i', interface,
            '-n',  # DNS 해석 안함
            '-l',  # 라인 버퍼링
            '-c', '0',  # 무제한 캡처
            f'udp port {port}'
        ]
        
        try:
            print(f"🔍 Starting tcpdump on {interface}:{port}")
            self.tcpdump_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            
            # tcpdump 출력 파싱 스레드 시작
            threading.Thread(
                target=self._parse_tcpdump_output,
                daemon=True
            ).start()
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to start tcpdump: {e}")
            return False

    def _parse_tcpdump_output(self):
        """tcpdump 출력을 파싱하여 패킷 수 카운트"""
        print("📦 tcpdump monitoring started")
        
        while self.running and self.tcpdump_process:
            try:
                line = self.tcpdump_process.stdout.readline()
                if not line:
                    break
                    
                # UDP 패킷 감지
                if 'UDP' in line:
                    self.received_count += 1
                    
                    # 실시간 출력 (100개마다)
                    if self.received_count % 100 == 0:
                        print(f"📥 Received packets: {self.received_count}")
                        
            except Exception as e:
                print(f"❌ tcpdump parsing error: {e}")
                break

    def start_logstash_monitoring(self):
        """Logstash 로그 모니터링"""
        logstash_log_path = self.config.get('logstash_log_path', '/var/log/logstash/logstash-plain.log')
        
        if not os.path.exists(logstash_log_path):
            print(f"⚠️  Logstash log not found: {logstash_log_path}")
            # Docker 환경에서는 컨테이너 로그 사용
            return self._monitor_logstash_docker_logs()
        
        # 파일 모니터링
        threading.Thread(
            target=self._monitor_logstash_file,
            args=(logstash_log_path,),
            daemon=True
        ).start()

    def _monitor_logstash_docker_logs(self):
        """Docker Logstash 로그 모니터링"""
        container_name = self.config.get('logstash_container', 'logstash-producer')
        
        try:
            cmd = ['docker', 'logs', '-f', '--tail', '100', container_name]
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            
            print(f"📋 Monitoring Docker logs for {container_name}")
            
            while self.running:
                line = process.stdout.readline()
                if not line:
                    break
                    
                # Logstash 입력 플러그인 메시지 파싱
                if 'udp' in line.lower() and ('received' in line.lower() or 'message' in line.lower()):
                    self.processed_count += 1
                    
        except Exception as e:
            print(f"❌ Docker logs monitoring error: {e}")

    def _monitor_logstash_file(self, log_path: str):
        """Logstash 로그 파일 모니터링"""
        try:
            with open(log_path, 'r') as f:
                # 파일 끝으로 이동
                f.seek(0, 2)
                
                while self.running:
                    line = f.readline()
                    if line:
                        # Logstash 처리 메시지 감지
                        if self.logstash_pattern.search(line):
                            self.processed_count += 1
                    else:
                        time.sleep(0.1)  # 짧은 대기
                        
        except Exception as e:
            print(f"❌ Logstash file monitoring error: {e}")

    def start_packet_generator(self):
        """패킷 생성기 시작 (테스트용)"""
        if not self.config.get('auto_generate_packets', False):
            return
            
        loggen_path = self.config.get('loggen_path', '../loggen/loggen.py')
        target_host = self.config.get('target_host', 'localhost')
        target_port = self.config.get('udp_port', 514)
        packets_per_batch = self.config.get('packets_per_batch', 1000)
        
        try:
            cmd = [
                'python3', loggen_path,
                '--host', target_host,
                '--port', str(target_port),
                '--count', str(packets_per_batch),
                '--sleep', '1'  # 1초마다 배치 전송
            ]
            
            print(f"🚀 Starting packet generator: {packets_per_batch} packets/batch")
            self.loggen_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # 생성된 패킷 수 추적
            threading.Thread(
                target=self._track_generated_packets,
                daemon=True
            ).start()
            
        except Exception as e:
            print(f"❌ Failed to start packet generator: {e}")

    def _track_generated_packets(self):
        """생성된 패킷 수 추적"""
        batch_size = self.config.get('packets_per_batch', 1000)
        
        while self.running and self.loggen_process:
            if self.loggen_process.poll() is None:  # 프로세스가 실행 중
                self.sent_count += batch_size
                print(f"📤 Sent packets: {self.sent_count}")
                time.sleep(1)  # 1초 대기
            else:
                # 프로세스가 종료되면 다시 시작
                time.sleep(1)
                if self.running:
                    self.start_packet_generator()

    def calculate_metrics(self) -> PacketLossMetrics:
        """현재 메트릭 계산"""
        current_time = datetime.now()
        
        # 손실률 계산
        if self.sent_count > 0:
            loss_rate = ((self.sent_count - self.received_count) / self.sent_count) * 100
        else:
            loss_rate = 0.0
            
        # 처리 지연 계산 (간단히 받은 패킷 vs 처리된 패킷)
        if self.received_count > 0:
            processing_delay = ((self.received_count - self.processed_count) / self.received_count) * 100
        else:
            processing_delay = 0.0
            
        return PacketLossMetrics(
            timestamp=current_time,
            sent_packets=self.sent_count,
            received_packets=self.received_count,
            logstash_processed=self.processed_count,
            loss_rate=loss_rate,
            processing_delay=processing_delay
        )

    def generate_real_time_report(self):
        """실시간 리포트 출력"""
        current_time = time.time()
        
        if current_time - self.last_report_time >= self.report_interval:
            metrics = self.calculate_metrics()
            self.metrics_history.append(metrics)
            
            # 실시간 출력
            print(f"\n{'='*60}")
            print(f"🕒 {metrics.timestamp.strftime('%H:%M:%S')}")
            print(f"📤 Sent: {metrics.sent_packets:,}")
            print(f"📥 Received: {metrics.received_packets:,}")
            print(f"⚙️  Processed: {metrics.logstash_processed:,}")
            print(f"📊 UDP Loss: {metrics.loss_rate:.2f}%")
            print(f"🔄 Processing Delay: {metrics.processing_delay:.2f}%")
            
            # 문제 감지
            if metrics.loss_rate > 5:
                print(f"🚨 HIGH UDP LOSS DETECTED: {metrics.loss_rate:.1f}%")
            if metrics.processing_delay > 10:
                print(f"🚨 HIGH PROCESSING DELAY: {metrics.processing_delay:.1f}%")
                
            self.last_report_time = current_time

    def start_monitoring(self):
        """모니터링 시작"""
        print("🚀 Starting UDP packet loss analysis...")
        self.running = True
        
        # 각 구성요소 시작
        if not self.start_tcpdump_monitoring():
            print("❌ Failed to start tcpdump. Check permissions.")
            return False
            
        self.start_logstash_monitoring()
        
        if self.config.get('auto_generate_packets', False):
            self.start_packet_generator()
            
        print("✅ All monitoring components started")
        print("📊 Press Ctrl+C to stop and generate final report")
        
        # 메인 모니터링 루프
        try:
            while self.running:
                self.generate_real_time_report()
                time.sleep(1)
                
        except KeyboardInterrupt:
            print("\n🛑 Stopping analysis...")
            self.stop_monitoring()
            
        return True

    def stop_monitoring(self):
        """모니터링 중지"""
        self.running = False
        
        # 프로세스들 종료
        if self.tcpdump_process:
            self.tcpdump_process.terminate()
            
        if self.loggen_process:
            self.loggen_process.terminate()
            
        # 최종 리포트 생성
        self.generate_final_report()

    def generate_final_report(self):
        """최종 분석 리포트 생성"""
        print(f"\n{'='*80}")
        print("📋 UDP PACKET LOSS ANALYSIS - FINAL REPORT")
        print(f"{'='*80}")
        
        if not self.metrics_history:
            print("❌ No data collected during monitoring")
            return
            
        # 최종 메트릭
        final_metrics = self.calculate_metrics()
        
        print(f"📊 FINAL STATISTICS:")
        print(f"   Total Sent Packets: {final_metrics.sent_packets:,}")
        print(f"   Total Received Packets: {final_metrics.received_packets:,}")
        print(f"   Total Processed Packets: {final_metrics.logstash_processed:,}")
        print(f"   UDP Loss Rate: {final_metrics.loss_rate:.2f}%")
        print(f"   Processing Loss Rate: {final_metrics.processing_delay:.2f}%")
        
        # 시간대별 분석
        if len(self.metrics_history) > 1:
            time_span = (self.metrics_history[-1].timestamp - self.metrics_history[0].timestamp).total_seconds()
            throughput = final_metrics.sent_packets / time_span if time_span > 0 else 0
            print(f"   Average Throughput: {throughput:.0f} packets/sec")
            
        # 문제점 분석
        print(f"\n🔍 ANALYSIS:")
        
        if final_metrics.loss_rate < 1:
            print("   ✅ UDP packet loss is within acceptable range (<1%)")
        elif final_metrics.loss_rate < 5:
            print("   ⚠️  Moderate UDP packet loss detected (1-5%)")
            print("       - Check network congestion")
            print("       - Consider increasing UDP buffer sizes")
        else:
            print("   🚨 HIGH UDP packet loss detected (>5%)")
            print("       - Immediate attention required")
            print("       - Check logstash queue_size configuration")
            print("       - Monitor system resources")
            
        if final_metrics.processing_delay > 5:
            print("   🚨 High processing delay detected")
            print("       - Check Logstash performance")
            print("       - Monitor Kafka throughput")
            print("       - Check system CPU/Memory usage")
            
        # 권장사항
        print(f"\n💡 RECOMMENDATIONS:")
        print("   • Increase logstash UDP queue_size from 50000 to 100000")
        print("   • Add multiple logstash instances for load balancing")
        print("   • Monitor system resources during peak loads")
        print("   • Consider using multiple UDP ports for distribution")
        
        # JSON 리포트 저장
        self.save_json_report(final_metrics)

    def save_json_report(self, final_metrics: PacketLossMetrics):
        """JSON 형태로 리포트 저장"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"udp_analysis_report_{timestamp}.json"
        
        report_data = {
            "analysis_time": datetime.now().isoformat(),
            "config": self.config,
            "final_metrics": final_metrics.to_dict(),
            "metrics_history": [m.to_dict() for m in list(self.metrics_history)[-50:]],  # 최근 50개
            "summary": {
                "total_monitoring_time": len(self.metrics_history) * self.report_interval,
                "peak_loss_rate": max([m.loss_rate for m in self.metrics_history]) if self.metrics_history else 0,
                "average_loss_rate": sum([m.loss_rate for m in self.metrics_history]) / len(self.metrics_history) if self.metrics_history else 0
            }
        }
        
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(report_data, f, indent=2, ensure_ascii=False)
            print(f"📋 Detailed report saved to: {filename}")
        except Exception as e:
            print(f"❌ Failed to save report: {e}")


def create_default_config():
    """기본 설정 생성"""
    return {
        'interface': 'any',
        'udp_port': 514,
        'time_window': 10,
        'report_interval': 5,
        'logstash_container': 'logstash-producer',
        'logstash_log_path': '/var/log/logstash/logstash-plain.log',
        'auto_generate_packets': False,  # 기본적으로 비활성화
        'loggen_path': '../loggen/loggen.py',
        'target_host': 'localhost',
        'packets_per_batch': 1000
    }


def main():
    parser = argparse.ArgumentParser(description='UDP Packet Loss Analyzer')
    parser.add_argument('--port', type=int, default=514, help='UDP port to monitor (default: 514)')
    parser.add_argument('--interface', default='any', help='Network interface (default: any)')
    parser.add_argument('--duration', type=int, help='Monitoring duration in seconds')
    parser.add_argument('--generate', action='store_true', help='Auto-generate test packets')
    parser.add_argument('--config', help='JSON config file path')
    
    args = parser.parse_args()
    
    # 설정 로드
    if args.config and os.path.exists(args.config):
        with open(args.config, 'r') as f:
            config = json.load(f)
    else:
        config = create_default_config()
        
    # 명령행 인수로 덮어쓰기
    if args.port:
        config['udp_port'] = args.port
    if args.interface:
        config['interface'] = args.interface
    if args.generate:
        config['auto_generate_packets'] = True
        
    # 분석기 시작
    analyzer = UDPPacketAnalyzer(config)
    
    # 시그널 핸들러 등록
    def signal_handler(signum, frame):
        print(f"\n📨 Received signal {signum}")
        analyzer.stop_monitoring()
        sys.exit(0)
        
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 모니터링 시작
    try:
        success = analyzer.start_monitoring()
        if not success:
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Analysis failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()