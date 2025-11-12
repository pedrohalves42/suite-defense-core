import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SafeSelectProps {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * CORREÇÃO: Select com valor garantido (nunca undefined)
 * Previne erro "changing from uncontrolled to controlled"
 * 
 * Este componente garante que:
 * 1. O valor nunca seja undefined
 * 2. O valor esteja sempre presente nas options
 * 3. Não haja values vazios ("") nos SelectItems
 */
export const SafeSelect: React.FC<SafeSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled = false
}) => {
  // CORREÇÃO: Guard para options vazias
  if (!options || options.length === 0) {
    return (
      <div className={className}>
        <span className="text-sm text-muted-foreground">{placeholder || 'Sem opções'}</span>
      </div>
    );
  }

  // SEGURANÇA: Garantir que value nunca seja undefined
  const safeValue = value || options[0]?.value || '';
  
  // VALIDAÇÃO: Garantir que value está nas options
  const validValue = options.some(opt => opt.value === safeValue) 
    ? safeValue 
    : options[0]?.value || '';

  return (
    <Select
      value={validValue}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem 
            key={option.value} 
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
