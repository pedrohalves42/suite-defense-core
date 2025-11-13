import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/hooks/useTenant";
import { Mail, Trash2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function TenantInvites() {
  const { toast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newInviteRole, setNewInviteRole] = useState<"admin" | "operator" | "viewer">("viewer");

  // Fetch invites for current tenant
  const { data: invites, isLoading } = useQuery({
    queryKey: ["tenant-invites", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from("invites")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  // Create invite mutation
  const createInvite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-invite", {
        body: { email: newInviteEmail, role: newInviteRole },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Convite enviado",
        description: `Convite enviado para ${newInviteEmail}`,
      });
      setNewInviteEmail("");
      setNewInviteRole("viewer");
      queryClient.invalidateQueries({ queryKey: ["tenant-invites"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao enviar convite",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    },
  });

  // Delete invite mutation
  const deleteInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from("invites")
        .delete()
        .eq("id", inviteId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Convite excluído",
        description: "O convite foi removido com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["tenant-invites"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao excluir convite",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (tenantLoading || isLoading) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Convites</h1>
        <p className="text-muted-foreground">
          Gerencie convites para novos membros do seu tenant
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enviar Novo Convite</CardTitle>
          <CardDescription>
            Convide um novo membro para sua organização
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@exemplo.com"
                value={newInviteEmail}
                onChange={(e) => setNewInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Função</Label>
              <Select value={newInviteRole} onValueChange={(value: any) => setNewInviteRole(value)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="operator">Operador</SelectItem>
                  <SelectItem value="viewer">Visualizador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => createInvite.mutate()}
                disabled={!newInviteEmail || createInvite.isPending}
                className="w-full"
              >
                <Mail className="mr-2 h-4 w-4" />
                Enviar Convite
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Convites Pendentes</CardTitle>
          <CardDescription>
            Convites aguardando aceitação
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expira em</TableHead>
                <TableHead>Enviado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites && invites.length > 0 ? (
                invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{invite.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          invite.status === "accepted" ? "default" :
                          invite.status === "expired" ? "destructive" :
                          "secondary"
                        }
                      >
                        {invite.status === "pending" ? "Pendente" :
                         invite.status === "accepted" ? "Aceito" :
                         invite.status === "expired" ? "Expirado" :
                         invite.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(invite.expires_at) > new Date() ? (
                        <span className="text-sm">
                          {formatDistanceToNow(new Date(invite.expires_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      ) : (
                        <span className="text-sm text-destructive">Expirado</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(invite.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteInvite.mutate(invite.id)}
                        disabled={deleteInvite.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum convite pendente
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
