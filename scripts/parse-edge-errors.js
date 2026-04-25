import { readFileSync } from 'fs';

/**
 * Script de Parsing de Erros para Edge Runtime
 * Filtra ruído e extrai erros fatais e falhas de compilação.
 */

function parseErrors() {
  const input = readFileSync(0, 'utf8'); // Read from stdin
  const lines = input.split('\n');
  const errors = [];

  // Patterns to identify fatal errors and TS compilation failures
  const tsErrorPattern = /Check file:\/\/\/(.+):(\d+):(\d+) - error TS(\d+): (.+)/;
  const denoErrorPattern = /error: (.+)/;
  const testFailurePattern = /FAILED (.+) \((\d+)ms\)/;
  const runtimeErrorPattern = /Uncaught (.+) at (.+):(\d+):(\d+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match TS Check errors
    const tsMatch = line.match(tsErrorPattern);
    if (tsMatch) {
      errors.push({
        file: tsMatch[1],
        line: tsMatch[2],
        description: `[TS${tsMatch[4]}] ${tsMatch[5]}`.trim()
      });
      continue;
    }

    // Match generic Deno errors (fatal)
    const denoMatch = line.match(denoErrorPattern);
    if (denoMatch && !line.includes('Check file:')) {
      errors.push({
        file: 'N/A',
        line: 'N/A',
        description: denoMatch[1].trim()
      });
      continue;
    }

    // Match Runtime errors
    const runtimeMatch = line.match(runtimeErrorPattern);
    if (runtimeMatch) {
      errors.push({
        file: runtimeMatch[2],
        line: runtimeMatch[3],
        description: runtimeMatch[1].trim()
      });
    }
  }

  // Final Output
  if (errors.length === 0) {
    console.log('✅ Nenhum erro fatal detectado.');
    process.exit(0);
  }

  console.log('--- ERROS FATAIS DETECTADOS ---');
  errors.forEach(err => {
    console.log(`${err.file}:${err.line} | ${err.description}`);
  });
  process.exit(1);
}

parseErrors();
