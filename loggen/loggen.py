
#!/usr/bin/env python3
'''
Syslog Generator for PaloAlto Firewall Logs
'''

import socket
import argparse
import random
import sys
from time import sleep
import time as time_module
from datetime import datetime
from collections import deque
from pytz import timezone
import os  # os 모듈 추가

"""
Variable configurations for multiple domains
"""
DOMAINS = [
    {"hostname": "VISION-SEOUL-FW", "domain": ".seoulfw"},
    {"hostname": "BUSAN-OFFICE-FW", "domain": ".busanfw"},
    {"hostname": "DAEGU-BRANCH-FW", "domain": ".daegufw"},
    {"hostname": "INCHEON-HQ-FW", "domain": ".incheonfw"},
    {"hostname": "GWANGJU-SUB-FW", "domain": ".gwangjufw"},
    {"hostname": "DAEJEON-MAIN-FW", "domain": ".daejeonfw"},
    {"hostname": "ULSAN-PLANT-FW", "domain": ".ulsanfw"},
    {"hostname": "JEJU-BRANCH-FW", "domain": ".jejufw"},
    {"hostname": "GANGWON-OFFICE-FW", "domain": ".gangwonfw"},
    {"hostname": "CHUNGBUK-DEPT-FW", "domain": ".chungbukfw"}
]
FACILITY = 14  # Facility number for syslog


def raw_udp_sender(message, host, port):
    """Send message using UDP"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        message = bytes(message, 'UTF-8')
        sock.sendto(message, (host, port))
    finally:
        sock.close()


def generate_palo_message(current_time):
    """Generate PaloAlto traffic log with consistent timestamps"""
    src_ips = ["192.168.199.224", "192.168.199.225", "192.168.199.226"]
    dst_ips = ["8.8.4.4", "8.8.8.8", "1.1.1.1"]
    session_id = random.randint(100000, 999999)

    # Randomly select a domain configuration
    domain_config = random.choice(DOMAINS)
    hostname = domain_config["hostname"]
    domain_name = domain_config["domain"]

    # Format all timestamps consistently
    domain_time = current_time.strftime("%b %d %H:%M:%S")
    received_time = current_time.strftime("%Y/%m/%d %H:%M:%S")
    timezone_time = current_time.strftime("%Y-%m-%dT%H:%M:%S.887+09:00")

    # Generate header and message separately
    syslog_header = f"<{FACILITY}>{domain_time} {hostname}{domain_name}"

    log_message = (
        f"{random.randint(1, 3)},{received_time},023201001129,{random.choice(['TRAFFIC', 'THREAT', 'SYSTEM'])},end,2817,{received_time},"
        f"{random.choice(src_ips)},{random.choice(dst_ips)},118.128.43.82,8.8.4.4,"
        f"ALLOW-OUTBOUND,,,dns-base,vsys1,trust,untrust,ae1,ethernet1/2,"
        f"PaloLog-forward,{timezone_time},{session_id},1,56368,53,2263,53,"
        f"0x400019,udp,allow,298,77,221,2,{timezone_time},0,any,,"
        f"7444489203825238205,0x8000000000000000,192.168.0.0-192.168.255.255,"
        f"United States,,1,1,aged-out,0,0,0,0,,{hostname}-{random.randint(1, 3)},from-policy,,,0,,0,,"
        f"N/A,0,0,0,0,dbd7a6c6-ca36-4398-80b3-5bab8fa733c2,0,0,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,{timezone_time},,,"
        f"infrastructure,networking,network-protocol,3,\"used-by-malware,has-known-vulnerability,pervasive-use\","
        f"dns,dns-base,no,no,0,NonProxyTraffic,"
    )

    return f"{syslog_header} {log_message}"


def syslogs_sender():
    """Send multiple syslog messages with real-time packet rate monitoring"""
    try:
        # 초당 전송량을 측정하기 위한 변수들
        packets_in_last_second = 0
        last_second = int(time_module.time())

        for message_num in range(1, args.count+1):

            current_time = datetime.now(timezone('Asia/Seoul'))
            full_message = generate_palo_message(current_time)
            raw_udp_sender(full_message, args.host, args.port)

            current_second = int(time_module.time())
            if current_second > last_second:
                # 1초가 지날 때마다 전송률만 출력
                sys.stdout.write(f"\r{packets_in_last_second}")
                sys.stdout.flush()
                packets_in_last_second = 0
                last_second = current_second
            else:
                packets_in_last_second += 1

    except Exception as e:
        sys.stdout.write(f"\rError: {str(e)}")
        sys.stdout.flush()
        sys.exit(1)


if __name__ == "__main__":
    import os
    os.environ['PYTHONUNBUFFERED'] = '1'

    parser = argparse.ArgumentParser(
        description='Generate and send PaloAlto format syslog messages')
    parser.add_argument("--host", required=True,
                        help="Remote host to send messages")
    parser.add_argument("--port", type=int, required=True,
                        help="Remote port to send messages")
    parser.add_argument("--count", type=int, required=True,
                        help="Number of messages to send")
    parser.add_argument("--sleep", type=float,
                        help="Sleep time between batches in seconds")

    args = parser.parse_args()

    try:
        if args.sleep:
            while True:
                try:
                    syslogs_sender()
                    sleep(args.sleep)
                except KeyboardInterrupt:
                    raise
                except Exception as e:
                    sleep(5)
        else:
            syslogs_sender()

    except KeyboardInterrupt:
        sys.exit(0)

 # sudo nohup python3 loggen.py --host 192.168.1.47 --port 514 --count 5000 --sleep 1
 # nohup: ignoring input and appending output to 'nohup.out'
