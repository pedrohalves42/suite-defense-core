import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Save, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statusConfig } from './constants';
import type { FrameworkControl } from './types';

interface ControlRowProps {
  control: FrameworkControl & { notes: string };
  savedNotes: string | null;
  onSave: (controlId: string, status: string, notes: string) => void;
}

export function ControlRow({ control, savedNotes, onSave }: ControlRowProps) {
  const [editing, setEditing] = useState(false);
  const [localNotes, setLocalNotes] = useState(savedNotes ?? control.notes);
  const StatusIcon = statusConfig[control.status].icon;

  const handleSave = () => {
    onSave(control.controlId, control.status, localNotes);
    setEditing(false);
  };

  return (
    <div className="p-3 rounded-lg border hover:bg-muted/50 transition-colors space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <StatusIcon className={cn(
            'h-5 w-5 shrink-0',
            control.status === 'compliant' && 'text-green-600',
            control.status === 'partial' && 'text-amber-600',
            control.status === 'non_compliant' && 'text-red-600',
          )} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{control.controlId}</span>
              <span className="font-medium text-sm">{control.title}</span>
            </div>
            <p className="text-xs text-muted-foreground">{control.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            {control.evidenceCount}
          </Badge>
          <Badge className={cn('text-xs', statusConfig[control.status].color)} variant="outline">
            {statusConfig[control.status].label}
          </Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(!editing)}>
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {(editing || localNotes) && (
        <div className="pl-8 space-y-1">
          {editing ? (
            <div className="space-y-2">
              <Textarea value={localNotes} onChange={(e) => setLocalNotes(e.target.value)} rows={3} className="text-xs" placeholder="Notas de implementação..." />
              <div className="flex gap-2">
                <Button size="sm" variant="default" onClick={handleSave} className="h-7 text-xs">
                  <Save className="h-3 w-3 mr-1" /> Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground whitespace-pre-line border-l-2 border-primary/20 pl-2">
              {localNotes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
