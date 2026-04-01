import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle, Monitor, Search, Laptop, FolderOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RISK_CONFIG, CATEGORY_LABELS } from './constants';

interface Props {
  filteredSoftware: any[];
  softwareLoading: boolean;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedAgent: string;
  setSelectedAgent: (v: string) => void;
  selectedCategory: string | undefined;
  setSelectedCategory: (v: string | undefined) => void;
  selectedRisk: string | undefined;
  setSelectedRisk: (v: string | undefined) => void;
  agentsList: [string, string][];
}

export const SoftwareListTable: React.FC<Props> = ({
  filteredSoftware, softwareLoading, searchTerm, setSearchTerm,
  selectedAgent, setSelectedAgent, selectedCategory, setSelectedCategory,
  selectedRisk, setSelectedRisk, agentsList,
}) => (
  <motion.div id="software-list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                {selectedCategory
                  ? `Programas - ${CATEGORY_LABELS[selectedCategory] || selectedCategory}`
                  : selectedRisk
                    ? `Programas - ${RISK_CONFIG[selectedRisk]?.label || selectedRisk}`
                    : 'Todos os Programas'}
                <Badge variant="secondary" className="ml-2">{filteredSoftware.length}</Badge>
              </CardTitle>
              <CardDescription className="mt-1 flex gap-2">
                {selectedCategory && (
                  <Button variant="link" className="p-0 h-auto text-sm" onClick={() => setSelectedCategory(undefined)}>
                    Limpar filtro de categoria
                  </Button>
                )}
                {selectedRisk && (
                  <Button variant="link" className="p-0 h-auto text-sm" onClick={() => setSelectedRisk(undefined)}>
                    Limpar filtro de risco
                  </Button>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <div className="w-64">
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <Laptop className="h-4 w-4 mr-2 shrink-0" />
                  <SelectValue placeholder="Todos os computadores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🖥️ Todos os computadores</SelectItem>
                  {agentsList.map(([id, name]) => (
                    <SelectItem key={id} value={id}>💻 {name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, fornecedor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {softwareLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : filteredSoftware.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm || selectedAgent !== 'all' ? 'Nenhum resultado para os filtros aplicados' : 'Nenhum software encontrado'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Caminho</TableHead>
                  {selectedAgent === 'all' && <TableHead>Computador</TableHead>}
                  <TableHead>Visto</TableHead>
                  <TableHead>Risco</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSoftware.slice(0, 100).map((item) => {
                  const risk = RISK_CONFIG[item.risk_level || 'unknown'];
                  const Icon = risk?.icon || HelpCircle;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{item.version || '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">{item.vendor || '-'}</TableCell>
                      <TableCell className="max-w-[200px]">
                        {item.install_location ? (
                          <TooltipProvider>
                            <UITooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                                  <FolderOpen className="h-3 w-3 shrink-0" />
                                  <span className="truncate max-w-[160px]">{item.install_location}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-sm">
                                <p className="font-mono text-xs break-all">{item.install_location}</p>
                              </TooltipContent>
                            </UITooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">-</span>
                        )}
                      </TableCell>
                      {selectedAgent === 'all' && (
                        <TableCell>
                          <Badge variant="outline" className="font-normal text-xs">{item.agents?.agent_name || '-'}</Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <TooltipProvider>
                          <UITooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground cursor-help">
                                {formatDistanceToNow(new Date(item.last_seen_at), { addSuffix: true, locale: ptBR })}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Primeiro: {new Date(item.first_seen_at).toLocaleDateString('pt-BR')}</p>
                              <p className="text-xs">Último: {new Date(item.last_seen_at).toLocaleDateString('pt-BR')}</p>
                            </TooltipContent>
                          </UITooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('gap-1', risk?.bgClass)}>
                          <Icon className="h-3 w-3" />
                          {risk?.label || 'Desconhecido'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  </motion.div>
);
