#!/usr/bin/env python3
"""Google OAuth2 Authentication and Session Management for Trader Skill.
Supports Google Identity Services (GSI), ID token cryptographic verification,
JWT sessions, email whitelisting, and FastAPI route protection.
"""

import json
import os
import secrets
import sys
import time
from typing import Dict, List, Optional
import jwt
import requests
from fastapi import Cookie, Depends, Header, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.trade_manager import TradeManager

# Optional google-auth library
try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    HAS_GOOGLE_AUTH_LIB = True
except ImportError:
    HAS_GOOGLE_AUTH_LIB = False

bearer_scheme = HTTPBearer(auto_error=False)


class GoogleAuthManager:
    SESSION_COOKIE_NAME = "trader_session"

    def __init__(self, trade_mgr: Optional[TradeManager] = None):
        self.trade_mgr = trade_mgr or TradeManager()

    def get_jwt_secret(self) -> str:
        """Retrieves or auto-generates a persistent JWT signing secret."""
        cfg = self.trade_mgr.load_config()
        secret = cfg.get("jwt_secret_key", "").strip()
        if not secret:
            secret = secrets.token_hex(32)
            self.trade_mgr.save_config({"jwt_secret_key": secret})
        return secret

    def verify_google_id_token(self, id_token_str: str) -> Dict:
        """Verifies a Google ID token cryptographically.
        Tries google-auth official library first, then Google tokeninfo endpoint.
        """
        cfg = self.trade_mgr.load_config()
        client_id = cfg.get("google_client_id", "").strip() or None

        idinfo = None
        error_details = []

        # Method 1: Local cryptographic verification via google-auth
        if HAS_GOOGLE_AUTH_LIB:
            try:
                request = google_requests.Request()
                idinfo = google_id_token.verify_oauth2_token(
                    id_token_str, request, client_id
                )
            except Exception as e:
                error_details.append(f"google-auth: {str(e)}")

        # Method 2: Verification via Google TokenInfo HTTPS endpoint
        if not idinfo:
            try:
                resp = requests.get(
                    "https://oauth2.googleapis.com/tokeninfo",
                    params={"id_token": id_token_str},
                    timeout=6
                )
                if resp.status_code == 200:
                    info = resp.json()
                    # Verify audience if client_id is configured
                    if client_id and info.get("aud") != client_id:
                        raise ValueError(f"Audience mismatch: {info.get('aud')} != {client_id}")
                    idinfo = info
                else:
                    error_details.append(f"tokeninfo endpoint status {resp.status_code}: {resp.text}")
            except Exception as e:
                error_details.append(f"tokeninfo: {str(e)}")

        if not idinfo:
            raise ValueError(f"Falha na validação do token Google: {'; '.join(error_details)}")

        # Validate that email is verified by Google
        email_verified = idinfo.get("email_verified")
        if isinstance(email_verified, str):
            email_verified = email_verified.lower() in ("true", "1")
        if not email_verified:
            raise ValueError("O e-mail da conta Google não está verificado.")

        user_email = idinfo.get("email", "").lower().strip()
        if not user_email:
            raise ValueError("Token do Google não contém e-mail válido.")

        # Email whitelist check (if configured)
        allowed_emails = [e.lower().strip() for e in cfg.get("google_allowed_emails", []) if e.strip()]
        if allowed_emails:
            allowed = False
            for rule in allowed_emails:
                if rule.startswith("*@"):
                    domain = rule[2:]
                    if user_email.endswith(f"@{domain}"):
                        allowed = True
                        break
                elif user_email == rule:
                    allowed = True
                    break

            if not allowed:
                raise PermissionError(
                    f"Acesso negado: o e-mail '{user_email}' não está na lista de permissões autorizadas."
                )

        return {
            "id": idinfo.get("sub", ""),
            "email": user_email,
            "name": idinfo.get("name", user_email.split("@")[0]),
            "picture": idinfo.get("picture", ""),
            "provider": "google",
            "verified_at": int(time.time())
        }

    def create_session_token(self, user_info: Dict, duration_hours: int = 24) -> str:
        """Generates a signed JWT session token."""
        secret = self.get_jwt_secret()
        now = int(time.time())
        payload = {
            "sub": user_info.get("id", ""),
            "email": user_info.get("email", ""),
            "name": user_info.get("name", ""),
            "picture": user_info.get("picture", ""),
            "provider": user_info.get("provider", "google"),
            "iat": now,
            "exp": now + (duration_hours * 3600)
        }
        return jwt.encode(payload, secret, algorithm="HS256")

    def verify_session_token(self, token_str: str) -> Optional[Dict]:
        """Decodes and validates a session JWT token."""
        if not token_str:
            return None
        secret = self.get_jwt_secret()
        try:
            payload = jwt.decode(token_str, secret, algorithms=["HS256"])
            return payload
        except Exception:
            return None

    def create_demo_user(self) -> Dict:
        """Creates a demonstration Google user profile for sandbox testing."""
        return {
            "id": "google-demo-user-10928374",
            "email": "luiz.trader@gmail.com",
            "name": "Luiz Trader",
            "picture": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80",
            "provider": "google_demo",
            "verified_at": int(time.time())
        }

    def get_status(self, request: Optional[Request] = None) -> Dict:
        """Returns auth configuration and current session status."""
        cfg = self.trade_mgr.load_config()
        client_id = cfg.get("google_client_id", "").strip()
        auth_enabled = bool(cfg.get("google_auth_enabled", False))

        current_user = None
        if request:
            token = self.extract_token_from_request(request)
            if token:
                current_user = self.verify_session_token(token)

        return {
            "enabled": auth_enabled,
            "has_client_id": bool(client_id),
            "client_id": client_id,
            "allowed_emails_count": len(cfg.get("google_allowed_emails", [])),
            "is_authenticated": current_user is not None,
            "user": current_user
        }

    def extract_token_from_request(self, request: Request) -> Optional[str]:
        """Extracts token from either Authorization header or trader_session cookie."""
        # 1. Bearer header
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:].strip()

        # 2. Cookie
        cookie_val = request.cookies.get(self.SESSION_COOKIE_NAME)
        if cookie_val:
            return cookie_val.strip()

        return None


# Global singleton instance
auth_manager = GoogleAuthManager()


def require_auth(request: Request) -> Dict:
    """Dependency that enforces authentication when Google Auth is enabled."""
    cfg = auth_manager.trade_mgr.load_config()
    auth_enabled = bool(cfg.get("google_auth_enabled", False))

    token = auth_manager.extract_token_from_request(request)
    user = auth_manager.verify_session_token(token) if token else None

    if auth_enabled:
        if not user:
            raise HTTPException(
                status_code=401,
                detail="Acesso protegido: faça login com sua Conta Google para realizar operações."
            )
        return user

    # When auth is disabled, return local authorized identity
    if user:
        return user

    return {
        "sub": "local_dev_user",
        "email": "local@trader.skill",
        "name": "Trader Local",
        "picture": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80",
        "provider": "local"
    }


def optional_auth(request: Request) -> Optional[Dict]:
    """Dependency for endpoints that can benefit from knowing the user if present."""
    token = auth_manager.extract_token_from_request(request)
    return auth_manager.verify_session_token(token) if token else None
