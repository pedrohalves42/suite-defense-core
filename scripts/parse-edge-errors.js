import { readFileSync } from 'fs';

/**
 * Script de Parsing de Erros para Edge Runtime
 * Filtra ruído e extrai erros fatais e falhas de compilação.
 * Suporta formatos de Deno 1.x e 2.x
 */

function parseErrors() {
  const input = readFileSync(0, 'utf8'); // Read from stdin
  const lines = input.split('\n');
  const errors = [];

  let currentError = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\x1B\[[0-9;]*[mK]/g, ''); // Strip ANSI colors

    // Pattern for Deno 2.x TS Errors
    const tsCodeMatch = line.match(/^TS(\d+) \[ERROR\]: (.+)/);
    if (tsCodeMatch) {
      currentError = {
        code: tsCodeMatch[1],
        message: tsCodeMatch[2],
        file: 'N/A',
        line: 'N/A'
      };
      continue;
    }

    // Pattern for file location in Deno 2.x (at file:///...)
    const locationMatch = line.match(/at file:\/\/\/(.+):(\d+):(\d+)/);
    if (locationMatch && currentError) {
      currentError.file = locationMatch[1];
      currentError.line = locationMatch[2];
      errors.push({
        file: currentError.file,
        line: currentError.line,
        description: `[TS${currentError.code}] ${currentError.message}`
      });
      currentError = null;
      continue;
    }

    // Pattern for Deno 1.x / Standard TS
    const standardTsMatch = line.match(/(.+) - error TS(\d+): (.+)/);
    if (standardTsMatch) {
      // If the line contains coordinates like file.ts:10:5
      const coordMatch = standardTsMatch[1].match(/(.+):(\d+):(\d+)/);
      errors.push({
        file: coordMatch ? coordMatch[1] : standardTsMatch[1],
        line: coordMatch ? coordMatch[2] : 'N/A',
        description: `[TS${standardTsMatch[2]}] ${standardTsMatch[3]}`
      });
      continue;
    }

    // Match generic Deno fatal errors
    if (line.startsWith('error: ') && !line.includes('Type checking failed')) {
      errors.push({
        file: 'Runtime',
        line: 'Fatal',
        description: line.replace('error: ', '').trim()
      });
    }

    // Match Runtime Uncaught exceptions
    const uncaughtMatch = line.match(/Uncaught (.+) at (.+):(\d+):(\d+)/);
    if (uncaughtMatch) {
       errors.push({
        file: uncaughtMatch[2],
        line: uncaughtMatch[3],
        description: uncaughtMatch[1].trim()
      });
    }
  }

  // Final Output
  if (errors.length === 0) {
    // If we have "error: Type checking failed" but no specific TS errors parsed,
    // it might be a format we missed.
    if (input.includes('Type checking failed')) {
       console.log('⚠️ Erro de compilação detectado, mas não foi possível parsear detalhes específicos.');
       process.exit(1);
    }
    console.log('✅ Nenhum erro fatal detectado.');
    process.exit(0);
  }

  console.log('--- ERROS FATAIS DETECTADOS ---');
  // Deduplicate and sort
  const uniqueErrors = Array.from(new Set(errors.map(e => `${e.file}:${e.line}|${e.description}`)))
    .map(s => {
      const [loc, desc] = s.split('|');
      const [file, line] = loc.split(':');
      return { file, line, description: desc };
    });

  uniqueErrors.forEach(err => {
    console.log(`${err.file}:${err.line} | ${err.description}`);
  });
  process.exit(1);
}

parseErrors();
