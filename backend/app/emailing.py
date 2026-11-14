"""Campus email validation and verification-code delivery.

Development defaults (``SMTP_ENABLED=0``) print codes to the backend log and let
the API return them as ``dev_code``. Set ``SMTP_ENABLED=1`` to send real mail
through SMTP instead; the code is then never returned to clients.
"""

import hashlib
import os
import secrets
import smtplib
from email.message import EmailMessage

CAMPUS_DOMAINS = [
    domain.strip().lower()
    for domain in os.getenv(
        "ALLOWED_EMAIL_DOMAINS", "mails.tsinghua.edu.cn,tsinghua.edu.cn"
    ).split(",")
    if domain.strip()
]
SMTP_ENABLED = os.getenv("SMTP_ENABLED", "0") == "1"


def is_campus_email(email: str) -> bool:
    """Return True when the mailbox domain is on the campus allow-list."""
    domain = (email or "").lower().strip().partition("@")[2]
    return domain in CAMPUS_DOMAINS


def make_code() -> str:
    """Return a zero-padded 6 digit numeric verification code."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    """SHA-256 hex digest; plaintext codes are never stored in the database."""
    return hashlib.sha256(code.encode()).hexdigest()


def send_code(email: str, code: str, purpose: str) -> None:
    """Deliver a verification or password-reset code."""
    if not SMTP_ENABLED:
        print(f"[DEV] {purpose} code for {email}: {code}")
        return

    host = os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    mail_from = os.getenv("MAIL_FROM", user or "noreply@campuscrew.local")
    subject = "校园认证验证码" if purpose == "verify" else "密码重置验证码"
    body = f"您的 CampusCrew 验证码是：{code}（10 分钟内有效）。"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = mail_from
    message["To"] = email
    message.set_content(body)

    with smtplib.SMTP(host, port, timeout=15) as server:
        server.starttls()
        if user:
            server.login(user, password)
        server.send_message(message)
