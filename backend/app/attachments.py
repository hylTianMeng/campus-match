"""Shared validation for recruitment and profile uploads."""
import base64
import binascii
from pathlib import PurePath
from fastapi import HTTPException

MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024
ATTACHMENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain; charset=utf-8",
}


def decode_attachment(data):
    filename = data.filename.strip()
    if filename in (".", "..") or any(c in filename for c in "/\\\r\n\x00"):
        raise HTTPException(422, "文件名无效")
    suffix = PurePath(filename).suffix.lower()
    if suffix not in ATTACHMENT_TYPES:
        raise HTTPException(422, "仅支持 PDF、DOCX、PNG、JPG 和 TXT 文件")
    try:
        content = base64.b64decode(data.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "文件内容无效")
    if not content or len(content) > MAX_ATTACHMENT_SIZE:
        raise HTTPException(422, "附件大小需在 5 MB 以内")
    if suffix == ".txt":
        try:
            valid = bool(content.decode("utf-8").strip()) and b"\x00" not in content
        except UnicodeDecodeError:
            valid = False
    else:
        valid = (
            content.startswith(b"%PDF-") if suffix == ".pdf" else
            content.startswith(b"PK\x03\x04") if suffix == ".docx" else
            content.startswith(b"\x89PNG\r\n\x1a\n") if suffix == ".png" else
            content.startswith(b"\xff\xd8\xff")
        )
    if not valid:
        raise HTTPException(422, "文件内容与格式不符")
    return filename, ATTACHMENT_TYPES[suffix], content
