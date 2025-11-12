const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = async (context) => {
  console.log('🔍 [APEX-BUILD] Executando validações pós-empacotamento...');

  const { appOutDir, packager } = context;
  
  // Listar arquivos gerados
  console.log(`📂 Diretório de saída: ${appOutDir}`);
  
  const files = fs.readdirSync(appOutDir);
  console.log(`📄 Arquivos gerados (${files.length}):`);
  files.forEach(file => console.log(`   - ${file}`));

  // Calcular hash do executável principal (se existir)
  const exeName = `${packager.appInfo.productName}.exe`;
  const exePath = path.join(appOutDir, exeName);
  
  if (fs.existsSync(exePath)) {
    const hash = crypto.createHash('sha256');
    const fileBuffer = fs.readFileSync(exePath);
    hash.update(fileBuffer);
    const sha256 = hash.digest('hex');
    
    const sizeInMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
    
    console.log('\n✅ Validação do executável:');
    console.log(`   Arquivo: ${exeName}`);
    console.log(`   Tamanho: ${sizeInMB} MB`);
    console.log(`   SHA256: ${sha256}`);
  }

  console.log('✅ Validações pós-empacotamento concluídas!\n');
};
