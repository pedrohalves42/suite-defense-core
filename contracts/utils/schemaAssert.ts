import { SupabaseClient } from '@supabase/supabase-js';

export interface SchemaContract {
  table: string;
  requiredColumns: string[];
  forbiddenColumns: string[];
  description?: string;
}

export interface ViewContract {
  view: string;
  requiredColumns: string[];
  forbiddenColumns: string[];
  description?: string;
}

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

/**
 * Fetches table columns using the describe_table RPC
 */
export async function getTableColumns(
  supabase: SupabaseClient,
  tableName: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc('describe_table', {
    p_table_name: tableName
  });

  if (error) {
    throw new Error(`Failed to describe table ${tableName}: ${error.message}`);
  }

  return (data as ColumnInfo[]).map(c => c.column_name);
}

/**
 * Validates a table against its contract
 * Throws an error with details if validation fails
 */
export async function assertTableContract(
  supabase: SupabaseClient,
  contract: SchemaContract
): Promise<void> {
  const columns = await getTableColumns(supabase, contract.table);

  const errors: string[] = [];

  // Check required columns exist
  for (const requiredCol of contract.requiredColumns) {
    if (!columns.includes(requiredCol)) {
      errors.push(`Missing required column: ${requiredCol}`);
    }
  }

  // Check forbidden columns don't exist
  for (const forbiddenCol of contract.forbiddenColumns) {
    if (columns.includes(forbiddenCol)) {
      errors.push(`Forbidden column exists: ${forbiddenCol}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Schema contract violation for table '${contract.table}':\n` +
      errors.map(e => `  - ${e}`).join('\n')
    );
  }
}

/**
 * Validates a view against its contract
 */
export async function assertViewContract(
  supabase: SupabaseClient,
  contract: ViewContract
): Promise<void> {
  // Views can be queried like tables for column info
  const { data, error } = await supabase
    .from(contract.view)
    .select('*')
    .limit(0);

  if (error) {
    throw new Error(`Failed to query view ${contract.view}: ${error.message}`);
  }

  // We can't easily get column names from an empty result
  // So we use a different approach - try to select each required column
  for (const requiredCol of contract.requiredColumns) {
    const { error: colError } = await supabase
      .from(contract.view)
      .select(requiredCol)
      .limit(1);

    if (colError) {
      throw new Error(
        `Schema contract violation for view '${contract.view}': ` +
        `Missing required column: ${requiredCol}`
      );
    }
  }

  // For forbidden columns, we expect the query to fail or return null
  for (const forbiddenCol of contract.forbiddenColumns) {
    const { error: colError } = await supabase
      .from(contract.view)
      .select(forbiddenCol)
      .limit(1);

    // If no error, the column exists (which is forbidden)
    if (!colError) {
      throw new Error(
        `Schema contract violation for view '${contract.view}': ` +
        `Forbidden column exists: ${forbiddenCol}`
      );
    }
  }
}

/**
 * Validates multiple contracts in parallel
 */
export async function assertAllContracts(
  supabase: SupabaseClient,
  contracts: SchemaContract[]
): Promise<{ passed: number; failed: number; errors: string[] }> {
  const results = await Promise.allSettled(
    contracts.map(c => assertTableContract(supabase, c))
  );

  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      passed++;
    } else {
      failed++;
      errors.push(`${contracts[index].table}: ${result.reason.message}`);
    }
  });

  return { passed, failed, errors };
}
