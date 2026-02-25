/**
 * ScriptUploader - Upload agent script directly to agent_releases
 * Prevents corrupted releases by validating version header before upload
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, CheckCircle, AlertTriangle, FileCode, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ScriptUploader() {
  const { toast } = useToast();
  const [version, setVersion] = useState('');
  const [platform, setPlatform] = useState('windows');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [headerVersion, setHeaderVersion] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setFileContent(content);
      
      // Extract version from header
      const match = content.match(/CyberShield\s+Agent\s*[-–]\s*\w+\s+v?([\d]+\.[\d]+\.[\d]+)/i);
      setHeaderVersion(match?.[1] || null);
      
      // Auto-fill version field
      if (match?.[1] && !version) {
        setVersion(`v${match[1]}`);
      }
    };
    reader.readAsText(file);
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!fileContent || !version) throw new Error('Selecione um arquivo e versão');

      const { data, error } = await supabase.functions.invoke('upload-release-content', {
        body: { platform, version, content: fileContent },
      });

      if (error) throw new Error(error.message || 'Erro no upload');
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Release criada com sucesso!',
        description: `${data.platform}/${data.version} - ${data.size} bytes`,
      });
      setFileContent(null);
      setFileName('');
      setHeaderVersion(null);
    },
    onError: (error) => {
      toast({
        title: 'Erro no upload',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const versionMismatch = headerVersion && version && 
    headerVersion.split('.').slice(0, 2).join('.') !== version.replace(/^v/, '').split('.').slice(0, 2).join('.');

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <FileCode className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Upload de Script de Agente</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Plataforma</Label>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="windows">Windows (.ps1)</SelectItem>
              <SelectItem value="linux">Linux (.sh)</SelectItem>
              <SelectItem value="macos">macOS (.sh)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Versão</Label>
          <Input 
            placeholder="v5.0.11" 
            value={version} 
            onChange={(e) => setVersion(e.target.value)} 
          />
        </div>
        <div>
          <Label>Arquivo do Script</Label>
          <Input 
            type="file" 
            accept=".ps1,.sh,.bash" 
            onChange={handleFileSelect}
          />
        </div>
      </div>

      {fileName && (
        <div className="text-sm text-muted-foreground">
          📄 {fileName} {fileContent && `(${(fileContent.length / 1024).toFixed(1)} KB)`}
          {headerVersion && (
            <span className="ml-2">
              — Header: <strong>v{headerVersion}</strong>
            </span>
          )}
        </div>
      )}

      {versionMismatch && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Versão incompatível!</strong> O header do script diz v{headerVersion} mas você está publicando como {version}.
            Isso causará problemas nos agentes.
          </AlertDescription>
        </Alert>
      )}

      {fileContent && !versionMismatch && headerVersion && (
        <Alert>
          <CheckCircle className="h-4 w-4 text-primary" />
          <AlertDescription>
            Script validado: header v{headerVersion} corresponde à versão {version}
          </AlertDescription>
        </Alert>
      )}

      <Button
        onClick={() => uploadMutation.mutate()}
        disabled={!fileContent || !version || !!versionMismatch || uploadMutation.isPending}
        className="w-full"
      >
        {uploadMutation.isPending ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</>
        ) : (
          <><Upload className="h-4 w-4 mr-2" /> Upload Release</>
        )}
      </Button>
    </div>
  );
}
