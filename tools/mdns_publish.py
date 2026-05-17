#!/usr/bin/env python3
"""
Cross-platform mDNS publisher for the RAG service.

Announces `<name>.local` pointing at this machine's primary LAN IP so any
device on the same network can reach the RAG service by name. Equivalent
to `tools/mdns-publish.sh` but works on Windows too (the shell script
relies on macOS `dns-sd` / Linux `avahi-publish`, neither of which exist
on Windows).

Requirements:
    pip install zeroconf

Usage:
    python tools/mdns_publish.py                    # default name=rag, port=3000
    python tools/mdns_publish.py my-rag 8080        # custom name + port

Verify from another LAN device:
    ping rag.local
    curl http://rag.local:3000/api/health
"""
from __future__ import annotations

import argparse
import socket
import sys
import time

try:
    from zeroconf import IPVersion, ServiceInfo, Zeroconf
except ImportError:
    print("[mdns] missing dependency: run  pip install zeroconf", file=sys.stderr)
    sys.exit(1)


def get_lan_ip() -> str:
    """Pick the IP of the interface used to reach the outside world.

    No packets are actually sent — connect() on a UDP socket just causes
    the OS to fill in the source address based on the routing table.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Publish <name>.local via mDNS")
    ap.add_argument("name", nargs="?", default="rag", help="hostname to publish (default: rag)")
    ap.add_argument("port", nargs="?", type=int, default=3000, help="service port (default: 3000)")
    args = ap.parse_args()

    ip = get_lan_ip()
    hostname = f"{args.name}.local."
    print(f"[mdns] mapping {hostname[:-1]} -> {ip}:{args.port}", flush=True)

    info = ServiceInfo(
        type_="_http._tcp.local.",
        name=f"{args.name}._http._tcp.local.",
        addresses=[socket.inet_aton(ip)],
        port=args.port,
        server=hostname,
        properties={},
    )

    zc = Zeroconf(ip_version=IPVersion.V4Only)
    try:
        zc.register_service(info)
        print(f"[mdns] broadcasting {hostname[:-1]} on port {args.port} (Ctrl+C to stop)", flush=True)
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n[mdns] stopping…", flush=True)
    finally:
        zc.unregister_service(info)
        zc.close()


if __name__ == "__main__":
    main()
