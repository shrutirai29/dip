import re
import socket
import logging
import ipaddress
import urllib.parse
from typing import Tuple, Optional, Dict, Any, List

from app.core.config import settings

logger = logging.getLogger("crowdguard.rtsp_security")

# Dangerous or internal service ports that must never be targeted by RTSP streams
DISALLOWED_SERVICE_PORTS = {
    20, 21,    # FTP
    22,        # SSH
    23,        # Telnet
    25, 465,   # SMTP
    53,        # DNS
    67, 68,    # DHCP
    80, 443,   # HTTP/HTTPS web servers
    110, 995,  # POP3
    143, 993,  # IMAP
    3306,      # MySQL
    5432,      # PostgreSQL
    6379,      # Redis
    8000,      # CROWDGUARD backend
    5173,      # CROWDGUARD frontend
    27017,     # MongoDB
}


def sanitize_rtsp_url(url: str) -> str:
    """
    Masks embedded username and password credentials in an RTSP URL.
    Example: rtsp://admin:secret123@192.168.1.50:554/stream -> rtsp://****:****@192.168.1.50:554/stream
    """
    if not url or not isinstance(url, str):
        return ""
    try:
        parsed = urllib.parse.urlsplit(url)
        if parsed.username or parsed.password:
            user_masked = "****" if parsed.username else ""
            pass_masked = ":****" if parsed.password else ""
            cred_masked = f"{user_masked}{pass_masked}@"
            
            # Reconstruct netloc without real credentials
            host_port = parsed.hostname or ""
            if parsed.port:
                host_port = f"{host_port}:{parsed.port}"
            
            sanitized_netloc = f"{cred_masked}{host_port}"
            sanitized = urllib.parse.urlunsplit((
                parsed.scheme,
                sanitized_netloc,
                parsed.path,
                parsed.query,
                parsed.fragment
            ))
            return sanitized
    except Exception:
        pass
    
    # Fallback regex masking
    return re.sub(r'(rtsp[s]?://)([^:]+):([^@]+)@', r'\1****:****@', url)


def validate_rtsp_url(
    url: str,
    allowed_subnets: Optional[List[str]] = None,
    allow_loopback: Optional[bool] = None,
    resolve_dns: bool = True
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Strict URL syntax, scheme, port, DNS, and SSRF destination validation for RTSP feeds.
    Returns: (is_valid: bool, error_message: Optional[str], metadata: Optional[Dict])
    """
    if not url or not isinstance(url, str):
        return False, "RTSP source URL cannot be empty.", None

    url_clean = url.strip()
    if len(url_clean) > 512:
        return False, "RTSP URL exceeds maximum permitted length of 512 characters.", None

    # Parse URL
    try:
        parsed = urllib.parse.urlsplit(url_clean)
    except Exception as e:
        return False, f"Malformed URL syntax: {str(e)}", None

    # 1. Scheme Validation: Strictly rtsp or rtsps
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("rtsp", "rtsps"):
        return False, f"Unsupported protocol scheme '{scheme}'. Only 'rtsp://' and 'rtsps://' are permitted.", None

    # 2. Host Validation
    host = parsed.hostname
    if not host:
        return False, "RTSP URL missing valid host or IP address.", None

    # 3. Port Validation
    default_port = 322 if scheme == "rtsps" else 554
    port = parsed.port or default_port

    if not (1 <= port <= 65535):
        return False, f"Invalid port {port}. Must be between 1 and 65535.", None

    if port in DISALLOWED_SERVICE_PORTS:
        return False, f"Port {port} is restricted to prevent unauthorized internal service probing.", None

    allowed_ports = settings.ALLOWED_CAMERA_PORTS
    # Allow explicitly whitelisted RTSP ports or non-privileged dynamic camera ports (1024-65535)
    is_allowed_port = (port in allowed_ports) or (1024 <= port <= 65535)
    if not is_allowed_port:
        return False, f"Port {port} is not in the authorized camera port list ({allowed_ports}).", None

    # 4. Loopback and SSRF IP Resolution Validation
    if allow_loopback is None:
        allow_loopback = settings.ALLOW_LOOPBACK_RTSP_TESTING

    if allowed_subnets is None:
        allowed_subnets = settings.ALLOWED_CAMERA_SUBNETS

    parsed_networks = []
    for subnet_str in allowed_subnets:
        try:
            parsed_networks.append(ipaddress.ip_network(subnet_str, strict=False))
        except ValueError:
            logger.warning(f"Invalid configured camera subnet: {subnet_str}")

    resolved_ips: List[str] = []

    if resolve_dns:
        try:
            addr_info = socket.getaddrinfo(host, port, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
            for item in addr_info:
                sockaddr = item[4]
                ip_str = sockaddr[0]
                if ip_str not in resolved_ips:
                    resolved_ips.append(ip_str)
        except socket.gaierror as ge:
            return False, f"Unable to resolve camera host '{host}': {ge.strerror or str(ge)}", None
        except Exception as e:
            return False, f"DNS resolution failed for '{host}': {str(e)}", None

        if not resolved_ips:
            return False, f"DNS resolution yielded no IP addresses for host '{host}'.", None

        # Validate every resolved IP address
        for ip_str in resolved_ips:
            try:
                ip_obj = ipaddress.ip_address(ip_str)
            except ValueError:
                return False, f"Invalid resolved IP address: {ip_str}", None

            # Strictly reject Multicast, Link-local (cloud metadata 169.254.x.x), Unspecified, and Reserved
            if ip_obj.is_multicast:
                return False, "Multicast camera destinations are disallowed.", None
            if ip_obj.is_link_local:
                return False, "Link-local addresses (e.g. 169.254.x.x) are strictly disallowed.", None
            if ip_obj.is_unspecified:
                return False, "Unspecified 0.0.0.0 addresses are disallowed.", None
            if ip_obj.is_reserved:
                return False, "Reserved IP space destinations are disallowed.", None

            # Loopback Check
            if ip_obj.is_loopback:
                if not allow_loopback:
                    return False, "Loopback addresses (127.0.0.0/8, ::1) are disallowed for security.", None

            # Subnet Membership Check
            if not ip_obj.is_loopback:
                in_allowed_subnet = any(ip_obj in net for net in parsed_networks)
                if not in_allowed_subnet:
                    return False, (
                        f"Resolved destination IP {ip_str} is not within configured camera subnets "
                        f"({', '.join(allowed_subnets)})."
                    ), None

    sanitized = sanitize_rtsp_url(url_clean)

    metadata = {
        "scheme": scheme,
        "host": host,
        "port": port,
        "path": parsed.path or "/",
        "sanitized_url": sanitized,
        "has_embedded_credentials": bool(parsed.username or parsed.password),
        "resolved_ips": resolved_ips
    }

    return True, None, metadata


def build_authenticated_rtsp_url(
    base_url: str,
    username: Optional[str] = None,
    password: Optional[str] = None
) -> str:
    """
    Constructs an authenticated RTSP URL for internal VideoCapture use.
    Handles URL escaping of credentials properly.
    """
    if not username and not password:
        return base_url.strip()

    parsed = urllib.parse.urlsplit(base_url.strip())
    # URL encode credentials
    user_part = urllib.parse.quote(username or "", safe="")
    pass_part = f":{urllib.parse.quote(password or '', safe='')}" if password is not None else ""
    cred = f"{user_part}{pass_part}@"

    host_port = parsed.hostname or ""
    if parsed.port:
        host_port = f"{host_port}:{parsed.port}"

    netloc = f"{cred}{host_port}"
    return urllib.parse.urlunsplit((
        parsed.scheme,
        netloc,
        parsed.path,
        parsed.query,
        parsed.fragment
    ))
