"""
Componente de polling e execução de jobs
"""
import time
import logging
import requests
from threading import Event
from typing import List, Dict, Any

from config import AgentConfig
from hmac_utils import generate_hmac_headers

class JobPoller:
    """Faz polling de jobs pendentes e executa"""
    
    def __init__(self, config: AgentConfig, stop_event: Event):
        self.config = config
        self.stop_event = stop_event
        self.logger = logging.getLogger(__name__)
    
    def poll_jobs(self) -> List[Dict[str, Any]]:
        """
        Faz polling de jobs pendentes
        
        Returns:
            Lista de jobs a executar
        """
        url = f"{self.config.server_url}/functions/v1/poll-jobs"
        
        # Preparar headers
        headers = {
            'X-Agent-Token': self.config.agent_token,
            'Content-Type': 'application/json',
        }
        
        # Adicionar HMAC headers (body vazio para GET)
        hmac_headers = generate_hmac_headers(self.config.hmac_secret, "")
        headers.update(hmac_headers)
        
        try:
            response = requests.get(
                url,
                headers=headers,
                timeout=self.config.request_timeout
            )
            
            if response.status_code == 200:
                data = response.json()
                jobs = data.get('jobs', [])
                if jobs:
                    self.logger.info(f"📥 Recebidos {len(jobs)} job(s)")
                return jobs
            elif response.status_code == 401:
                self.logger.error(f"❌ Poll rejeitado: Autenticação falhou")
                return []
            elif response.status_code == 429:
                self.logger.warning(f"⚠️  Rate limit excedido no polling")
                return []
            else:
                self.logger.warning(f"⚠️  Poll falhou: HTTP {response.status_code}")
                return []
                
        except Exception as e:
            self.logger.error(f"❌ Erro ao fazer polling: {e}")
            return []
    
    def execute_job(self, job: Dict[str, Any]) -> bool:
        """
        Executa um job
        
        Args:
            job: Dict com id, type, payload, approved
        
        Returns:
            True se executado com sucesso
        """
        job_id = job.get('id')
        job_type = job.get('type')
        payload = job.get('payload', {})
        
        self.logger.info(f"🔧 Executando job {job_id} ({job_type})")
        
        try:
            # Implementar execução baseada no tipo
            if job_type == 'scan':
                self.logger.info(f"  → Scan de vírus: {payload}")
                # TODO: Implementar scan
                time.sleep(2)  # Simular execução
            elif job_type == 'update':
                self.logger.info(f"  → Update do agente")
                # TODO: Implementar update
                time.sleep(1)
            elif job_type == 'custom':
                self.logger.info(f"  → Job customizado: {payload}")
                # TODO: Implementar custom
                time.sleep(1)
            else:
                self.logger.warning(f"  ⚠️  Tipo de job desconhecido: {job_type}")
                return False
            
            self.logger.info(f"✅ Job {job_id} executado com sucesso")
            return True
            
        except Exception as e:
            self.logger.error(f"❌ Erro ao executar job {job_id}: {e}")
            return False
    
    def acknowledge_job(self, job_id: str) -> bool:
        """
        Envia ACK ao servidor informando conclusão do job
        """
        url = f"{self.config.server_url}/functions/v1/ack-job/{job_id}"
        
        headers = {
            'X-Agent-Token': self.config.agent_token,
            'Content-Type': 'application/json',
        }
        
        hmac_headers = generate_hmac_headers(self.config.hmac_secret, "")
        headers.update(hmac_headers)
        
        try:
            response = requests.post(
                url,
                headers=headers,
                timeout=self.config.request_timeout
            )
            
            if response.status_code == 200:
                self.logger.debug(f"✅ ACK enviado para job {job_id}")
                return True
            else:
                self.logger.warning(f"⚠️  ACK falhou para job {job_id}: HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.logger.error(f"❌ Erro ao enviar ACK para job {job_id}: {e}")
            return False
    
    def run(self):
        """Loop principal de polling"""
        self.logger.info(f"🔄 Job poller iniciado (intervalo: {self.config.poll_interval}s)")
        
        while not self.stop_event.is_set():
            # Fazer polling
            jobs = self.poll_jobs()
            
            # Executar jobs
            for job in jobs:
                if self.stop_event.is_set():
                    break
                
                success = self.execute_job(job)
                
                if success:
                    self.acknowledge_job(job['id'])
            
            # Aguardar próximo poll
            self.stop_event.wait(self.config.poll_interval)
        
        self.logger.info("🔄 Job poller parado")
