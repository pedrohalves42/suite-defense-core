"""
Auto-updater para o CyberShield Agent
Verifica e aplica atualizações automaticamente com validação SHA256 e rollback
"""
import os
import sys
import time
import shutil
import hashlib
import logging
import platform
import requests
import tempfile
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class AutoUpdater:
    """Gerenciador de auto-atualização do agente"""
    
    def __init__(self, config):
        self.config = config
        self.current_version = self._get_current_version()
        self.platform = "windows" if platform.system() == "Windows" else "linux"
        self.exe_extension = ".exe" if self.platform == "windows" else ""
        self.current_exe = self._get_current_exe_path()
        self.backup_exe = None
        
    def _get_current_version(self) -> str:
        """Obtém versão atual do agente"""
        from main import AGENT_VERSION
        return AGENT_VERSION
    
    def _get_current_exe_path(self) -> Path:
        """Obtém caminho do executável atual"""
        if getattr(sys, 'frozen', False):
            # Executando como executável PyInstaller
            return Path(sys.executable)
        else:
            # Executando como script Python (desenvolvimento)
            return Path(__file__).parent / "main.py"
    
    def check_for_updates(self) -> Optional[Dict[str, Any]]:
        """
        Verifica se há atualizações disponíveis via Edge Function dedicada
        
        Returns:
            Dict com informações da atualização ou None se não houver
        """
        try:
            import json
            from hmac_utils import generate_hmac_headers
            
            logger.info(f"🔍 Verificando atualizações... (versão atual: {self.current_version})")
            
            # Usar Edge Function dedicada ao invés de REST API
            url = f"{self.config.server_url}/functions/v1/check-agent-updates"
            
            # Preparar body vazio (necessário para HMAC)
            body = json.dumps({})
            
            # Gerar headers HMAC para autenticação
            headers = {
                'X-Agent-Token': self.config.agent_token,
                'Content-Type': 'application/json',
                **generate_hmac_headers(self.config.hmac_secret, body)
            }
            
            response = requests.post(url, headers=headers, data=body, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            # Verificar se há atualização disponível
            if not data.get('has_update'):
                logger.info("✅ Nenhuma atualização disponível")
                return None
            
            # Comparar versões
            latest_version = data['version']
            if self._is_newer_version(latest_version, self.current_version):
                logger.info(f"🆕 Nova versão disponível: {latest_version}")
                return data
            else:
                logger.info(f"✅ Versão atual ({self.current_version}) está atualizada")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Erro ao verificar atualizações (rede): {e}")
            return None
        except Exception as e:
            logger.error(f"❌ Erro ao verificar atualizações: {e}")
            return None
    
    def _is_newer_version(self, remote: str, local: str) -> bool:
        """Compara versões (formato: X.Y.Z)"""
        try:
            remote_parts = [int(x) for x in remote.split('.')]
            local_parts = [int(x) for x in local.split('.')]
            return remote_parts > local_parts
        except:
            return False
    
    def download_update(self, update_info: Dict[str, Any]) -> Optional[Path]:
        """
        Baixa a atualização
        
        Args:
            update_info: Informações da atualização
            
        Returns:
            Path do arquivo baixado ou None em caso de erro
        """
        try:
            download_url = update_info['download_url']
            expected_hash = update_info['sha256']
            expected_size = update_info['size_bytes']
            
            logger.info(f"📥 Baixando atualização de {download_url}")
            
            # Criar diretório temporário
            temp_dir = Path(tempfile.gettempdir()) / "cybershield_update"
            temp_dir.mkdir(exist_ok=True)
            
            temp_file = temp_dir / f"cybershield-agent-new{self.exe_extension}"
            
            # Download com progress
            response = requests.get(download_url, stream=True, timeout=300)
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(temp_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        progress = (downloaded / total_size) * 100 if total_size > 0 else 0
                        if downloaded % (1024 * 1024) == 0:  # Log a cada 1MB
                            logger.info(f"📥 Download: {progress:.1f}% ({downloaded}/{total_size})")
            
            logger.info(f"✅ Download concluído: {temp_file}")
            
            # Validar tamanho
            actual_size = temp_file.stat().st_size
            if actual_size != expected_size:
                logger.error(f"❌ Tamanho inválido: esperado {expected_size}, obtido {actual_size}")
                temp_file.unlink()
                return None
            
            # Validar SHA256
            logger.info("🔐 Validando SHA256...")
            actual_hash = self._calculate_sha256(temp_file)
            
            if actual_hash.lower() != expected_hash.lower():
                logger.error(f"❌ Hash SHA256 inválido!")
                logger.error(f"   Esperado: {expected_hash}")
                logger.error(f"   Obtido:   {actual_hash}")
                temp_file.unlink()
                return None
            
            logger.info("✅ Validação SHA256 OK")
            return temp_file
            
        except Exception as e:
            logger.error(f"❌ Erro ao baixar atualização: {e}")
            return None
    
    def _calculate_sha256(self, file_path: Path) -> str:
        """Calcula hash SHA256 de um arquivo"""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def apply_update(self, new_exe: Path) -> bool:
        """
        Aplica a atualização
        
        Args:
            new_exe: Path do novo executável
            
        Returns:
            True se sucesso, False caso contrário
        """
        try:
            logger.info("🔄 Aplicando atualização...")
            
            # Criar backup do executável atual
            backup_dir = self.current_exe.parent / "backup"
            backup_dir.mkdir(exist_ok=True)
            
            self.backup_exe = backup_dir / f"cybershield-agent.backup{self.exe_extension}"
            
            logger.info(f"💾 Criando backup: {self.backup_exe}")
            shutil.copy2(self.current_exe, self.backup_exe)
            
            # Substituir executável
            logger.info(f"📝 Substituindo executável: {self.current_exe}")
            shutil.move(str(new_exe), str(self.current_exe))
            
            # Tornar executável (Linux)
            if self.platform == "linux":
                os.chmod(self.current_exe, 0o755)
            
            logger.info("✅ Atualização aplicada com sucesso")
            return True
            
        except Exception as e:
            logger.error(f"❌ Erro ao aplicar atualização: {e}")
            return False
    
    def rollback(self) -> bool:
        """
        Realiza rollback para versão anterior
        
        Returns:
            True se sucesso, False caso contrário
        """
        try:
            if not self.backup_exe or not self.backup_exe.exists():
                logger.error("❌ Backup não encontrado, rollback impossível")
                return False
            
            logger.warning("⚠️  Iniciando rollback...")
            
            # Restaurar backup
            shutil.copy2(self.backup_exe, self.current_exe)
            
            # Tornar executável (Linux)
            if self.platform == "linux":
                os.chmod(self.current_exe, 0o755)
            
            logger.info("✅ Rollback concluído com sucesso")
            return True
            
        except Exception as e:
            logger.error(f"❌ Erro ao fazer rollback: {e}")
            return False
    
    def restart(self):
        """Reinicia o agente"""
        logger.info("🔄 Reiniciando agente...")
        
        if getattr(sys, 'frozen', False):
            # Executável PyInstaller
            if self.platform == "windows":
                subprocess.Popen([str(self.current_exe)])
            else:
                subprocess.Popen([str(self.current_exe)])
        else:
            # Script Python (desenvolvimento)
            subprocess.Popen([sys.executable, str(self.current_exe)])
        
        sys.exit(0)
    
    def update_if_available(self) -> bool:
        """
        Fluxo completo de atualização
        
        Returns:
            True se atualizou, False caso contrário
        """
        try:
            # Verificar atualizações
            update_info = self.check_for_updates()
            if not update_info:
                return False
            
            # Baixar atualização
            new_exe = self.download_update(update_info)
            if not new_exe:
                logger.error("❌ Falha ao baixar atualização")
                return False
            
            # Aplicar atualização
            if not self.apply_update(new_exe):
                logger.error("❌ Falha ao aplicar atualização")
                return False
            
            # Testar nova versão (basic health check)
            logger.info("🧪 Testando nova versão...")
            time.sleep(2)
            
            if not self._health_check():
                logger.error("❌ Nova versão falhou no health check, fazendo rollback...")
                if self.rollback():
                    logger.info("✅ Rollback concluído")
                return False
            
            logger.info("🎉 Atualização concluída com sucesso!")
            
            # Reiniciar agente
            self.restart()
            return True
            
        except Exception as e:
            logger.error(f"❌ Erro no processo de atualização: {e}")
            return False
    
    def _health_check(self) -> bool:
        """
        Verifica se o executável atualizado está funcionando
        Inclui testes de configuração e conectividade com backend
        
        Returns:
            True se OK, False se houver problemas
        """
        try:
            # 1. Verificar se o arquivo existe e é executável
            if not self.current_exe.exists():
                logger.error("❌ Health check: executável não encontrado")
                return False
            
            # 2. Verificar permissões (Linux)
            if self.platform == "linux" and not os.access(self.current_exe, os.X_OK):
                logger.error("❌ Health check: executável sem permissão de execução")
                return False
            
            # 3. Verificar configuração básica
            if not self.config.agent_name or not self.config.hmac_secret:
                logger.error("❌ Health check: configuração inválida")
                return False
            
            # 4. Testar conectividade com backend (heartbeat test)
            try:
                from hmac_utils import generate_hmac_headers
                
                heartbeat_url = f"{self.config.server_url}/functions/v1/heartbeat"
                body = '{"test_mode": true}'
                
                headers = {
                    'X-Agent-Token': self.config.agent_token,
                    'Content-Type': 'application/json',
                    **generate_hmac_headers(self.config.hmac_secret, body)
                }
                
                response = requests.post(
                    heartbeat_url,
                    headers=headers,
                    data=body,
                    timeout=10
                )
                
                if response.status_code not in [200, 201]:
                    logger.error(f"❌ Health check: backend retornou {response.status_code}")
                    return False
                
                logger.info("✅ Health check: backend conectado com sucesso")
                
            except requests.exceptions.Timeout:
                logger.error("❌ Health check: timeout ao conectar backend")
                return False
            except requests.exceptions.RequestException as e:
                logger.error(f"❌ Health check: erro ao conectar backend - {e}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Health check falhou: {e}")
            return False
