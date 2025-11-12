const fs = require('fs');
const path = require('path');

const viteDist = path.join(process.cwd(), 'dist');
const electronWeb = path.join(process.cwd(), 'electron', 'web');

console.log('🔧 [APEX-BUILD] Iniciando preparação do pacote Electron...');

// Validar se o build do Vite existe
if (!fs.existsSync(viteDist)) {
  console.error('❌ Erro: dist/ do Vite não encontrado.');
  console.error('   Execute: npm run build:web');
  process.exit(1);
}

// Limpar pasta destino
console.log('🧹 Limpando electron/web...');
fs.rmSync(electronWeb, { recursive: true, force: true });
fs.mkdirSync(electronWeb, { recursive: true });

// Copiar recursivamente
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('📦 Copiando build Vite para electron/web...');
copyDir(viteDist, electronWeb);

// Validar index.html
const indexPath = path.join(electronWeb, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('❌ Erro crítico: index.html não encontrado após cópia!');
  process.exit(1);
}

console.log('✅ Build Vite copiado com sucesso!');
console.log(`   Arquivos copiados de: ${viteDist}`);
console.log(`   Para: ${electronWeb}`);
