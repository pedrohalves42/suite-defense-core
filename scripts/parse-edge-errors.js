import { readFileSync } from 'fs';

/**
 * Script de Parsing de Erros para Edge Runtime
 * Filtra ruído e extrai apenas erros reais de TypeScript e Runtime.
 * Formato de saída: arquivo:linha | descrição
 */

function parseErrors() {
  const input = readFileSync(0, 'utf8');
  const lines = input.split('\n');
  const errors = [];

  let currentError = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\x1B\[[0-9;]*[mK]/g, ''); // Strip ANSI colors

    // Pattern 1: Deno 2.x TS [ERROR]
    const tsErrorMatch = line.match(/^TS(\d+) \[ERROR\]: (.+)/);
    if (tsErrorMatch) {
      currentError = { code: tsErrorMatch[1], message: tsErrorMatch[2] };
      continue;
    }

    // Pattern 2: Deno 2.x file location
    const locationMatch = line.match(/at file:\/\/\/(.+):(\d+):(\d+)/);
    if (locationMatch && currentError) {
      errors.push({
        file: locationMatch[1],
        line: locationMatch[2],
        description: `[TS${currentError.code}] ${currentError.message}`
      });
      currentError = null;
      continue;
    }

    // Pattern 3: Standard Deno 1.x / TS error format (file.ts:10:5 - error TS1234: message)
    const standardMatch = line.match(/^(.+):(\d+):(\d+) - error TS(\d+): (.+)/);
    if (standardMatch) {
      errors.push({
        file: standardMatch[1],
        line: standardMatch[2],
        description: `[TS${standardMatch[4]}] ${standardMatch[5]}`
      });
      continue;
    }

    // Pattern 4: Uncaught exceptions
    const uncaughtMatch = line.match(/Uncaught (.+) at (.+):(\d+):(\d+)/);
    if (uncaughtMatch) {
      errors.push({
        file: uncaughtMatch[2],
        line: uncaughtMatch[3],
        description: uncaughtMatch[1].trim()
      });
      continue;
    }

    // Pattern 5: Generic Deno fatal errors
    if (line.startsWith('error: ') && !line.includes('Type checking failed')) {
      errors.push({
        file: 'Runtime',
        line: '0',
        description: line.replace('error: ', '').trim()
      });
    }
    
    // Pattern 6: Test failures (specific to Deno test output)
    const testFailMatch = line.match(/^FAILED (.+) \(file:\/\/\/(.+):(\d+):(\d+)\)/);
    if (testFailMatch) {
      errors.push({
        file: testFailMatch[2],
        line: testFailMatch[3],
        description: `Test Failed: ${testFailMatch[1]}`
      });
    }
  }

  if (errors.length === 0) {
    if (input.includes('FAILED') || input.includes('error:')) {
      console.log('--- ERROS DETECTADOS (Não formatados) ---');
      console.log(input);
      process.exit(1);
    }
    console.log('✅ Nenhum erro fatal detectado.');
    process.exit(0);
  }

  console.log('--- ERROS IDENTIFICADOS ---');
  const uniqueErrors = Array.from(new Set(errors.map(e => `${e.file}:${e.line}|${e.description}`)));
  
  uniqueErrors.forEach(errStr => {
    const [loc, desc] = errStr.split('|');
    console.log(`${loc} | ${desc}`);
  });

  process.exit(1);
}

parseErrors();
