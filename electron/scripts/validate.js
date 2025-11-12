const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('❌ Diretório electron/dist/ não encontrado!');
  console.error('   Execute: npm run build:exe');
  process.exit(1);
}

const exeFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.exe'));

if (exeFiles.length === 0) {
  console.error('❌ Nenhum .exe encontrado em electron/dist/');
  console.error('   Execute: npm run build:exe');
  process.exit(1);
}

console.log('\n📋 RELATÓRIO DE VALIDAÇÃO APEX-BUILD\n');
console.log('='.repeat(60));

exeFiles.forEach(file => {
  const filePath = path.join(distDir, file);
  const stats = fs.statSync(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  
  console.log(`\n📦 Arquivo: ${file}`);
  console.log(`   Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   SHA256: ${hash.digest('hex')}`);
  console.log(`   Criado em: ${stats.birthtime.toISOString()}`);
});

console.log('\n' + '='.repeat(60));
console.log('✅ Validações concluídas!\n');
