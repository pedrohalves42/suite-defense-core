"""
Utilitários para assinatura HMAC-SHA256
"""
import hmac
import hashlib
import uuid
import time
from typing import Dict

def generate_hmac_headers(
    hmac_secret: str,
    body: str = ""
) -> Dict[str, str]:
    """
    Gera headers HMAC-SHA256 para autenticação
    
    Args:
        hmac_secret: Secret de 64 caracteres (32 bytes em hex)
        body: Corpo da requisição (JSON string ou vazio)
    
    Returns:
        Dict com headers X-HMAC-Signature, X-Timestamp, X-Nonce
    """
    # Gerar timestamp e nonce
    timestamp = str(int(time.time() * 1000))  # milissegundos
    nonce = str(uuid.uuid4())
    
    # Construir payload
    payload = f"{timestamp}:{nonce}:{body}"
    
    # Calcular HMAC-SHA256
    secret_bytes = bytes.fromhex(hmac_secret)
    payload_bytes = payload.encode('utf-8')
    
    signature = hmac.new(
        secret_bytes,
        payload_bytes,
        hashlib.sha256
    ).hexdigest()
    
    return {
        'X-HMAC-Signature': signature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce
    }

def verify_hmac_signature(
    hmac_secret: str,
    signature: str,
    timestamp: str,
    nonce: str,
    body: str = ""
) -> bool:
    """
    Verifica assinatura HMAC (útil para testes)
    
    Returns:
        True se assinatura válida, False caso contrário
    """
    payload = f"{timestamp}:{nonce}:{body}"
    secret_bytes = bytes.fromhex(hmac_secret)
    payload_bytes = payload.encode('utf-8')
    
    expected_signature = hmac.new(
        secret_bytes,
        payload_bytes,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)
