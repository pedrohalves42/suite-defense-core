#!/usr/bin/env python3
"""
Script de build do agente usando PyInstaller
"""
import os
import sys
import subprocess
import shutil
from pathlib import Path

def build_agent():
    """Build do executável usando PyInstaller"""
    print("🔨 Iniciando build do CyberShield Agent...")
    
    # Verificar se está no diretório correto
    if not Path("main.py").exists():
        print("❌ Erro: main.py não encontrado. Execute este script do diretório 'agent/'")
        sys.exit(1)
    
    # Limpar builds anteriores
    print("🧹 Limpando builds anteriores...")
    for dir_name in ['build', 'dist']:
        if Path(dir_name).exists():
            shutil.rmtree(dir_name)
    
    # Comando PyInstaller
    cmd = [
        sys.executable,
        "-m", "PyInstaller",
        "--onefile",  # Arquivo único
        "--name=cybershield-agent",
        "--clean",
        "--noconfirm",
        # Adicionar dados necessários
        "--add-data=agent_config.json:.",
        # Ícone (se existir)
        # "--icon=icon.ico",
        # Entry point
        "main.py"
    ]
    
    print(f"📦 Executando: {' '.join(cmd)}")
    
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Erro no build: {e}")
        sys.exit(1)
    
    # Verificar se executável foi criado
    exe_path = Path("dist/cybershield-agent.exe" if sys.platform == "win32" else "dist/cybershield-agent")
    
    if exe_path.exists():
        size_mb = exe_path.stat().st_size / (1024 * 1024)
        print(f"✅ Build concluído com sucesso!")
        print(f"📍 Executável: {exe_path}")
        print(f"📊 Tamanho: {size_mb:.2f} MB")
    else:
        print("❌ Erro: Executável não foi gerado")
        sys.exit(1)

if __name__ == "__main__":
    build_agent()
