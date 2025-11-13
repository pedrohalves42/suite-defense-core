"""
Gerenciamento de configuração do agente
"""
import json
import os
from dataclasses import dataclass
from typing import Optional

@dataclass
class AgentConfig:
    """Configuração do agente"""
    agent_name: str
    agent_token: str
    hmac_secret: str
    server_url: str
    heartbeat_interval: int = 60  # segundos
    poll_interval: int = 30  # segundos
    max_retries: int = 3
    retry_backoff: int = 2  # multiplicador exponencial
    request_timeout: int = 30  # segundos
    
    def __post_init__(self):
        """Validação pós-inicialização"""
        if not self.agent_name:
            raise ValueError("agent_name não pode estar vazio")
        if not self.agent_token:
            raise ValueError("agent_token não pode estar vazio")
        if not self.hmac_secret or len(self.hmac_secret) != 64:
            raise ValueError("hmac_secret deve ter 64 caracteres (32 bytes em hex)")
        if not self.server_url:
            raise ValueError("server_url não pode estar vazio")
        if self.heartbeat_interval < 10:
            raise ValueError("heartbeat_interval deve ser >= 10 segundos")
        if self.poll_interval < 5:
            raise ValueError("poll_interval deve ser >= 5 segundos")

def load_config(config_path: str) -> AgentConfig:
    """
    Carrega configuração de arquivo JSON
    
    Formato do arquivo:
    {
        "agent_name": "my-agent",
        "agent_token": "token_xyz...",
        "hmac_secret": "64_char_hex_string",
        "server_url": "https://api.example.com",
        "heartbeat_interval": 60,
        "poll_interval": 30
    }
    """
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Arquivo de configuração não encontrado: {config_path}")
    
    with open(config_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Validar campos obrigatórios
    required_fields = ['agent_name', 'agent_token', 'hmac_secret', 'server_url']
    missing = [field for field in required_fields if field not in data]
    if missing:
        raise ValueError(f"Campos obrigatórios faltando no config: {', '.join(missing)}")
    
    return AgentConfig(**data)

def create_default_config(config_path: str):
    """
    Cria arquivo de configuração template
    """
    template = {
        "agent_name": "CHANGE_ME",
        "agent_token": "CHANGE_ME",
        "hmac_secret": "CHANGE_ME_64_HEX_CHARS",
        "server_url": "https://your-server.supabase.co",
        "heartbeat_interval": 60,
        "poll_interval": 30,
        "max_retries": 3,
        "retry_backoff": 2,
        "request_timeout": 30
    }
    
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(template, f, indent=2)
    
    print(f"✅ Arquivo de configuração template criado: {config_path}")
    print("⚠️  IMPORTANTE: Edite o arquivo e substitua os valores CHANGE_ME")
