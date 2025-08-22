#!/usr/bin/env python3
"""
Mass Log Generator for Index Testing
다양한 도메인에서 대량의 로그를 생성하여 인덱스 수를 빠르게 증가시킵니다.
"""

import subprocess
import time
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
import argparse


class MassLogGenerator:
    def __init__(self, host='localhost', port=514):
        self.host = host
        self.port = port
        self.loggen_path = '../loggen/loggen.py'

    def generate_logs_batch(self, batch_size=10000, batch_id=0):
        """단일 배치로 로그 생성"""
        try:
            cmd = [
                'python3', self.loggen_path,
                '--host', self.host,
                '--port', str(self.port),
                '--count', str(batch_size)
            ]

            print(f"🚀 Starting batch {batch_id} with {batch_size} logs...")
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=300)

            if result.returncode == 0:
                print(f"✅ Batch {batch_id} completed successfully")
                return True
            else:
                print(f"❌ Batch {batch_id} failed: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            print(f"⏰ Batch {batch_id} timed out")
            return False
        except Exception as e:
            print(f"💥 Batch {batch_id} error: {e}")
            return False

    def generate_continuous_logs(self, logs_per_second=1000, duration_minutes=60):
        """연속적으로 로그 생성"""
        print(f"🔄 Starting continuous log generation:")
        print(f"   - Rate: {logs_per_second} logs/second")
        print(f"   - Duration: {duration_minutes} minutes")

        total_logs = 0
        start_time = time.time()
        end_time = start_time + (duration_minutes * 60)

        batch_size = min(logs_per_second, 10000)  # 배치 크기 제한
        sleep_interval = max(batch_size / logs_per_second, 0.1)

        batch_id = 0

        try:
            while time.time() < end_time:
                batch_start = time.time()

                if self.generate_logs_batch(batch_size, batch_id):
                    total_logs += batch_size
                    batch_id += 1

                # 속도 조절
                elapsed = time.time() - batch_start
                if elapsed < sleep_interval:
                    time.sleep(sleep_interval - elapsed)

                # 진행 상황 출력
                if batch_id % 10 == 0:
                    elapsed_minutes = (time.time() - start_time) / 60
                    rate = total_logs / \
                        (elapsed_minutes * 60) if elapsed_minutes > 0 else 0
                    print(
                        f"📊 Progress: {batch_id} batches, {total_logs:,} logs, {rate:.0f} logs/sec")

        except KeyboardInterrupt:
            print("🛑 Generation stopped by user")

        total_time = time.time() - start_time
        final_rate = total_logs / total_time if total_time > 0 else 0

        print(f"\n🏁 Generation completed:")
        print(f"   - Total logs: {total_logs:,}")
        print(f"   - Total time: {total_time:.1f} seconds")
        print(f"   - Average rate: {final_rate:.0f} logs/sec")

    def generate_burst_logs(self, total_logs=1000000, concurrent_batches=5):
        """대량 로그를 병렬로 빠르게 생성"""
        print(f"💥 Starting burst log generation:")
        print(f"   - Total logs: {total_logs:,}")
        print(f"   - Concurrent batches: {concurrent_batches}")

        batch_size = 10000
        num_batches = (total_logs + batch_size - 1) // batch_size

        completed_batches = 0
        failed_batches = 0
        start_time = time.time()

        def worker(batch_id):
            nonlocal completed_batches, failed_batches
            actual_batch_size = min(
                batch_size, total_logs - (batch_id * batch_size))

            if actual_batch_size <= 0:
                return

            if self.generate_logs_batch(actual_batch_size, batch_id):
                completed_batches += 1
            else:
                failed_batches += 1

            if (completed_batches + failed_batches) % 10 == 0:
                elapsed = time.time() - start_time
                rate = (completed_batches * batch_size) / \
                    elapsed if elapsed > 0 else 0
                print(
                    f"📈 Progress: {completed_batches}/{num_batches} batches, {rate:.0f} logs/sec")

        try:
            with ThreadPoolExecutor(max_workers=concurrent_batches) as executor:
                futures = [executor.submit(worker, i)
                           for i in range(num_batches)]

                # 모든 작업 완료 대기
                for future in futures:
                    future.result()

        except KeyboardInterrupt:
            print("🛑 Generation stopped by user")

        total_time = time.time() - start_time
        total_generated = completed_batches * batch_size
        final_rate = total_generated / total_time if total_time > 0 else 0

        print(f"\n🎯 Burst generation completed:")
        print(f"   - Completed batches: {completed_batches}/{num_batches}")
        print(f"   - Failed batches: {failed_batches}")
        print(f"   - Total logs: {total_generated:,}")
        print(f"   - Total time: {total_time:.1f} seconds")
        print(f"   - Average rate: {final_rate:.0f} logs/sec")


def main():
    parser = argparse.ArgumentParser(
        description='Mass Log Generator for Index Testing')
    parser.add_argument('--host', default='localhost',
                        help='Target host (default: localhost)')
    parser.add_argument('--port', type=int, default=514,
                        help='Target port (default: 514)')

    subparsers = parser.add_subparsers(dest='mode', help='Generation mode')

    # Continuous mode
    continuous_parser = subparsers.add_parser(
        'continuous', help='Generate logs continuously')
    continuous_parser.add_argument(
        '--rate', type=int, default=1000, help='Logs per second (default: 1000)')
    continuous_parser.add_argument(
        '--duration', type=int, default=60, help='Duration in minutes (default: 60)')

    # Burst mode
    burst_parser = subparsers.add_parser(
        'burst', help='Generate logs in burst mode')
    burst_parser.add_argument('--total', type=int, default=1000000,
                              help='Total logs to generate (default: 1,000,000)')
    burst_parser.add_argument('--concurrent', type=int,
                              default=5, help='Concurrent batches (default: 5)')

    # Quick test mode
    test_parser = subparsers.add_parser(
        'test', help='Quick test with small batch')
    test_parser.add_argument(
        '--count', type=int, default=1000, help='Number of test logs (default: 1000)')

    args = parser.parse_args()

    if not args.mode:
        parser.print_help()
        return

    generator = MassLogGenerator(args.host, args.port)

    try:
        if args.mode == 'continuous':
            generator.generate_continuous_logs(args.rate, args.duration)
        elif args.mode == 'burst':
            generator.generate_burst_logs(args.total, args.concurrent)
        elif args.mode == 'test':
            generator.generate_logs_batch(args.count, 0)
            print(f"✅ Test completed with {args.count} logs")

    except KeyboardInterrupt:
        print("\n🛑 Generation stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"💥 Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
