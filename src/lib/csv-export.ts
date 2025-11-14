export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns: { key: keyof T; label: string }[]
) {
  if (!data || data.length === 0) {
    throw new Error('Nenhum dado para exportar');
  }

  // Header
  const headers = columns.map(col => col.label).join(',');
  
  // Rows
  const rows = data.map(item => {
    return columns.map(col => {
      const value = item[col.key];
      
      // Escapar valores para CSV (aspas duplas, vírgulas, quebras de linha)
      if (value === null || value === undefined) return '';
      
      const strValue = String(value);
      if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      
      return strValue;
    }).join(',');
  });

  // Combine
  const csv = [headers, ...rows].join('\n');
  
  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
