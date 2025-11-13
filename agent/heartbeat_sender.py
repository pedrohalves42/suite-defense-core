"""
Componente de envio de heartbeats
"""
import time
import logging
import requests
import platform
from threading import Event
from typing import Optional

from config import AgentConfig
from hmac_utils import generate_hmac_headers

class HeartbeatSender:
    """Envia heartbeats periódicos ao servidor"""
    
    def __init__(self, config: AgentConfig, stop_event: Event):
        self.config = config
        self.stop_event = stop_event
        self.logger = logging.getLogger(__name__)
        
        # Sistema operacional info
        self.os_info = {
            "os_type": platform.system(),
            "os_version": platform.version(),
            "hostname": platform.node()
        }
    
    def send_heartbeat(self) -> bool:
        """
        Envia um heartbeat ao servidor
        
        Returns:
            True se sucesso, False caso contrário
        """
        url = f"{self.config.server_url}/functions/v1/heartbeat"
        
        # Preparar headers
        headers = {
            'X-Agent-Token': self.config.agent_token,
            'Content-Type': 'application/json',
        }
        
        # Body com informações do SO
        body = self.os_info
        
        # Adicionar HMAC headers
        import json
        body_str = json.dumps(body)
        hmac_headers = generate_hmac_headers(
            self.config.hmac_secret,
            body_str
        )
        headers.update(hmac_headers)
        
        try:
            response = requests.post(
                url,
                json=body,
                headers=headers,
                timeout=self.config.request_timeout
            )
            
            if response.status_code == 200:
                self.logger.debug(f"✅ Heartbeat enviado com sucesso")
                return True
            elif response.status_code == 401:
                self.logger.error(f"❌ Heartbeat rejeitado: Autenticação falhou")
                self.logger.error(f"Response: {response.text}")
                return False
            elif response.status_code == 429:
                self.logger.warning(f"⚠️  Rate limit excedido. Aguardando...")
                return False
            else:
                self.logger.warning(f"⚠️  Heartbeat falhou: HTTP {response.status_code}")
                return False
                
        except requests.exceptions.Timeout:
            self.logger.warning(f"⚠️  Heartbeat timeout")
            return False
        except requests.exceptions.ConnectionError:
            self.logger.warning(f"⚠️  Erro de conexão ao servidor")
            return False
        except Exception as e:
            self.logger.error(f"❌ Erro ao enviar heartbeat: {e}")
            return False
    
    def run(self):
        """Loop principal de heartbeat"""
        self.logger.info(f"💓 Heartbeat sender iniciado (intervalo: {self.config.heartbeat_interval}s)")
        
        retry_count = 0
        
        while not self.stop_event.is_set():
            success = self.send_heartbeat()
            
            if success:
                retry_count = 0
            else:
                retry_count += 1
                if retry_count >= self.config.max_retries:
                    backoff = min(300, self.config.heartbeat_interval * (2 ** retry_count))
                    self.logger.warning(f"⚠️  {retry_count} falhas consecutivas. Aguardando {backoff}s...")
                    self.stop_event.wait(backoff)
                    continue
            
            # Aguardar próximo heartbeat
            self.stop_event.wait(self.config.heartbeat_interval)
        
        self.logger.info("💓 Heartbeat sender parado")
