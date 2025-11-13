"""
Configuração de logging estruturado
"""
import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

def setup_logging(level: str = "INFO"):
    """
    Configura logging estruturado com rotação
    
    Args:
        level: Nível de logging (DEBUG, INFO, WARNING, ERROR)
    """
    # Criar diretório de logs
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    # Formato de log
    log_format = '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s'
    date_format = '%Y-%m-%d %H:%M:%S'
    
    # Configurar root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    
    # Remover handlers existentes
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Handler para console (stdout)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(
        logging.Formatter(log_format, date_format)
    )
    root_logger.addHandler(console_handler)
    
    # Handler para arquivo com rotação (10MB, 5 backups)
    file_handler = RotatingFileHandler(
        log_dir / "agent.log",
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setLevel(level)
    file_handler.setFormatter(
        logging.Formatter(log_format, date_format)
    )
    root_logger.addHandler(file_handler)
    
    # Silenciar logs verbose de bibliotecas externas
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)
