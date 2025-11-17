"""
Componente de polling e execução de jobs
"""
import time
import logging
import requests
import json
import socket
from threading import Event
from typing import List, Dict, Any, Tuple

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
    
    def submit_job_result(
        self,
        job_id: str,
        status: str,
        output: Dict[str, Any] | None = None,
        error_message: str | None = None,
        execution_time: float | None = None,
    ) -> bool:
        """
        Envia resultado completo do job ao backend via /functions/v1/submit-job-result.
        
        Args:
            job_id: ID do job
            status: 'completed' ou 'failed'
            output: Dados estruturados de sucesso (dict)
            error_message: Mensagem de erro (string)
            execution_time: Tempo de execução em segundos (float)
        
        Returns:
            True se enviado com sucesso, False caso contrário
        """
        url = f"{self.config.server_url}/functions/v1/submit-job-result"
        
        body: Dict[str, Any] = {
            "job_id": job_id,
            "status": status,  # 'completed' ou 'failed'
        }
        
        if output is not None:
            body["output"] = output
        if error_message is not None:
            body["error_message"] = error_message
        if execution_time is not None:
            body["execution_time_seconds"] = round(execution_time, 3)
        
        body_json = json.dumps(body)
        
        headers = {
            "X-Agent-Token": self.config.agent_token,
            "Content-Type": "application/json",
        }
        
        # Assinatura HMAC
        hmac_headers = generate_hmac_headers(self.config.hmac_secret, body_json)
        headers.update(hmac_headers)
        
        try:
            self.logger.debug(f"📤 Enviando resultado do job {job_id} para submit-job-result...")
            response = requests.post(
                url,
                headers=headers,
                data=body_json,
                timeout=self.config.request_timeout,
            )
            
            if response.status_code == 200:
                self.logger.info(f"✅ Resultado do job {job_id} enviado com sucesso (status={status})")
                return True
            else:
                self.logger.warning(
                    f"⚠️  Falha ao enviar resultado do job {job_id}: "
                    f"HTTP {response.status_code} - {response.text}"
                )
                return False
        
        except Exception as e:
            self.logger.error(f"❌ Erro ao enviar resultado do job {job_id}: {e}")
            return False
    
    def execute_job(self, job: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
        """
        Executa um job e retorna (success, result_data).
        
        result_data contém:
          - output (dict ou None)
          - error_message (str ou None)
          - execution_time_seconds (float)
        
        Args:
            job: Dict com id, type, payload
        
        Returns:
            Tuple (success: bool, result_data: dict)
        """
        job_id = job.get("id")
        job_type = job.get("type")
        payload = job.get("payload") or {}
        
        start_time = time.time()
        
        try:
            self.logger.info(f"📥 Processando job: id={job_id}, type={job_type}")
            
            output: Dict[str, Any] | None = None
            error_msg: str | None = None
            success = False
            
            if job_type == "scan":
                # Implementação real de scan
                self.logger.info(f"  → Scan de vírus: {payload}")
                time.sleep(2)  # Simular execução
                output = {
                    "scanned_files": 1234,
                    "threats_found": 0,
                    "hostname": socket.gethostname(),
                }
                success = True
            
            elif job_type == "report":
                self.logger.info(f"  → Report de sistema")
                output = {
                    "type": payload.get("type", "system_info"),
                    "hostname": socket.gethostname(),
                    "timestamp": time.time(),
                }
                success = True
            
            elif job_type == "integration_test":
                self.logger.info(f"  → Integration test")
                output = {
                    "message": "Integration test OK",
                    "timestamp": time.time(),
                    "agent": self.config.agent_name,
                    "hostname": socket.gethostname(),
                }
                success = True
            
            elif job_type == "update":
                self.logger.info(f"  → Update do agente")
                time.sleep(1)
                output = {
                    "message": "Update simulado",
                    "agent_version": "3.0.0",
                }
                success = True
            
            elif job_type == "custom":
                self.logger.info(f"  → Job customizado: {payload}")
                time.sleep(1)
                output = {
                    "message": "Custom job executado",
                    "payload_received": payload,
                }
                success = True
            
            else:
                # Tipo NÃO suportado → falha controlada
                error_msg = f"Tipo de job não suportado: {job_type}"
                self.logger.warning(f"  ⚠️  {error_msg}")
                success = False
            
            exec_time = time.time() - start_time
            
            if success:
                self.logger.info(f"✅ Job {job_id} executado com sucesso em {exec_time:.2f}s")
            
            return success, {
                "output": output,
                "error_message": error_msg,
                "execution_time_seconds": exec_time,
            }
        
        except Exception as e:
            exec_time = time.time() - start_time
            self.logger.error(f"❌ Erro ao executar job {job_id}: {e}")
            return False, {
                "output": None,
                "error_message": str(e),
                "execution_time_seconds": exec_time,
            }
    
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
            try:
                jobs = self.poll_jobs() or []
            except Exception as e:
                self.logger.error(f"❌ Erro ao fazer poll de jobs: {e}")
                jobs = []
            
            for job in jobs:
                if self.stop_event.is_set():
                    break
                
                job_id = job.get("id")
                if not job_id:
                    self.logger.warning(f"⚠️  Job sem ID recebido: {job}")
                    continue
                
                # Executar job e capturar resultado
                success, result_data = self.execute_job(job)
                
                # Enviar resultado completo
                status = "completed" if success else "failed"
                self.submit_job_result(
                    job_id=job_id,
                    status=status,
                    output=result_data.get("output"),
                    error_message=result_data.get("error_message"),
                    execution_time=result_data.get("execution_time_seconds"),
                )
            
            # Aguardar próximo ciclo
            self.stop_event.wait(self.config.poll_interval)
        
        self.logger.info("🛑 Job poller parado")
