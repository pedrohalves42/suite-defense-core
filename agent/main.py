#!/usr/bin/env python3
"""
CyberShield Agent - Main Entry Point
Agente autônomo que se comunica com o servidor via HMAC-signed requests
"""
import sys
import time
import logging
import signal
import argparse
from threading import Thread, Event
from typing import Optional

from config import AgentConfig, load_config
from heartbeat_sender import HeartbeatSender
from job_poller import JobPoller
from logger_config import setup_logging
from auto_updater import AutoUpdater

# Versão do agente
AGENT_VERSION = "1.0.0"

class CyberShieldAgent:
    """Orquestrador principal do agente"""
    
    def __init__(self, config: AgentConfig):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.stop_event = Event()
        
        # Componentes
        self.heartbeat_sender: Optional[HeartbeatSender] = None
        self.job_poller: Optional[JobPoller] = None
        self.auto_updater: Optional[AutoUpdater] = None
        
        # Threads
        self.heartbeat_thread: Optional[Thread] = None
        self.poller_thread: Optional[Thread] = None
        self.update_thread: Optional[Thread] = None
    
    def start(self):
        """Inicia o agente"""
        self.logger.info(f"🚀 CyberShield Agent v{AGENT_VERSION} iniciando...")
        self.logger.info(f"Agent Name: {self.config.agent_name}")
        self.logger.info(f"Server URL: {self.config.server_url}")
        
        # Verificar atualizações ao iniciar
        self.auto_updater = AutoUpdater(self.config)
        if self.auto_updater.update_if_available():
            # Se atualizou, o processo será reiniciado
            return
        
        # Inicializar componentes
        self.heartbeat_sender = HeartbeatSender(
            self.config, 
            self.stop_event
        )
        self.job_poller = JobPoller(
            self.config,
            self.stop_event
        )
        
        # Iniciar threads
        self.heartbeat_thread = Thread(
            target=self.heartbeat_sender.run,
            name="HeartbeatThread",
            daemon=True
        )
        self.poller_thread = Thread(
            target=self.job_poller.run,
            name="PollerThread",
            daemon=True
        )
        self.update_thread = Thread(
            target=self._periodic_update_check,
            name="UpdateThread",
            daemon=True
        )
        
        self.heartbeat_thread.start()
        self.poller_thread.start()
        self.update_thread.start()
        
        self.logger.info("✅ Agente iniciado com sucesso")
        
        # Manter processo ativo
        try:
            while not self.stop_event.is_set():
                time.sleep(1)
        except KeyboardInterrupt:
            self.logger.info("Interrupção do usuário detectada")
            self.stop()
    
    def _periodic_update_check(self):
        """Verifica atualizações periodicamente (a cada 6 horas)"""
        while not self.stop_event.is_set():
            try:
                # Esperar 6 horas
                self.stop_event.wait(timeout=6 * 60 * 60)
                
                if not self.stop_event.is_set():
                    self.logger.info("🔍 Verificação periódica de atualizações...")
                    if self.auto_updater.update_if_available():
                        # Se atualizou, o processo será reiniciado
                        return
            except Exception as e:
                self.logger.error(f"❌ Erro na verificação periódica: {e}")
    
    def stop(self):
        """Para o agente gracefully"""
        self.logger.info("🛑 Parando agente...")
        self.stop_event.set()
        
        # Aguardar threads
        if self.heartbeat_thread and self.heartbeat_thread.is_alive():
            self.heartbeat_thread.join(timeout=5)
        if self.poller_thread and self.poller_thread.is_alive():
            self.poller_thread.join(timeout=5)
        if self.update_thread and self.update_thread.is_alive():
            self.update_thread.join(timeout=5)
        
        self.logger.info("✅ Agente parado")
        sys.exit(0)

def signal_handler(agent: CyberShieldAgent):
    """Handler para sinais SIGTERM/SIGINT"""
    def handler(signum, frame):
        agent.stop()
    return handler

def main():
    """Entry point principal"""
    parser = argparse.ArgumentParser(
        description="CyberShield Agent - Agente autônomo de segurança"
    )
    parser.add_argument(
        '--config',
        type=str,
        default='agent_config.json',
        help='Caminho para arquivo de configuração'
    )
    parser.add_argument(
        '--log-level',
        type=str,
        default='INFO',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        help='Nível de logging'
    )
    parser.add_argument(
        '--version',
        action='version',
        version=f'CyberShield Agent v{AGENT_VERSION}'
    )
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(args.log_level)
    logger = logging.getLogger(__name__)
    
    try:
        # Carregar configuração
        config = load_config(args.config)
        
        # Criar agente
        agent = CyberShieldAgent(config)
        
        # Configurar signal handlers
        signal.signal(signal.SIGTERM, signal_handler(agent))
        signal.signal(signal.SIGINT, signal_handler(agent))
        
        # Iniciar
        agent.start()
        
    except FileNotFoundError as e:
        logger.error(f"❌ Arquivo de configuração não encontrado: {e}")
        sys.exit(1)
    except ValueError as e:
        logger.error(f"❌ Erro na configuração: {e}")
        sys.exit(1)
    except Exception as e:
        logger.exception(f"❌ Erro fatal: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
