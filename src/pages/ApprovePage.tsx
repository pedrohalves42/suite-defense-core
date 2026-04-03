import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ApprovalResult {
  success: boolean;
  message: string;
  playbook_name?: string;
  execution_id?: string;
  error?: string;
}

/**
 * One-Click Approval Page
 * 
 * Handles approval requests via token from email links.
 * Displays loading state, success, or error messages.
 */
export default function ApprovePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [result, setResult] = useState<ApprovalResult | null>(null);
  const [countdown, setCountdown] = useState(5);

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setResult({
        success: false,
        message: 'Token de aprovação não fornecido',
        error: 'MISSING_TOKEN'
      });
      return;
    }

    // Call the approve-via-token edge function
    const approveRequest = async () => {
      try {
        const { callGateway } = await import('@/lib/gateway');
        const data = await callGateway<{ playbook_name?: string; execution_id?: string }>('public', 'approve-via-token', { token });

        setStatus('success');
        setResult({
          success: true,
          message: 'Aprovação realizada com sucesso!',
          playbook_name: data?.playbook_name ?? '',
          execution_id: data?.execution_id ?? ''
        });
      } catch (err) {
        setStatus('error');
        setResult({
          success: false,
          message: err instanceof Error ? err.message : 'Erro desconhecido',
          error: 'UNKNOWN_ERROR'
        });
      }
    };

    approveRequest();
  }, [token]);

  // Countdown and redirect
  useEffect(() => {
    if (status !== 'loading' && countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      navigate('/admin/playbooks');
    }
  }, [status, countdown, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="bg-primary/10 p-4 rounded-full">
            <Shield className="h-12 w-12 text-primary" />
          </div>
        </div>

        {/* Loading State */}
        {status === 'loading' && (
          <>
            <Loader2 className="h-16 w-16 text-primary mx-auto mb-4 animate-spin" />
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Processando Aprovação</h1>
            <p className="text-slate-600">Aguarde enquanto validamos seu token...</p>
          </>
        )}

        {/* Success State */}
        {status === 'success' && result && (
          <>
            <div className="bg-green-100 rounded-full p-4 inline-block mb-4">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <span className="inline-block bg-green-500 text-white text-sm font-semibold px-4 py-1 rounded-full mb-4">
              APROVADO
            </span>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Aprovação Concluída</h1>
            <p className="text-slate-600 mb-6">{result.message}</p>
            
            {result.playbook_name && (
              <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                  <span className="text-slate-500 text-sm">Playbook</span>
                  <span className="text-slate-800 font-medium">{result.playbook_name}</span>
                </div>
                {result.execution_id && (
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-500 text-sm">Execução</span>
                    <span className="text-slate-800 font-mono text-sm">
                      {result.execution_id.substring(0, 8)}...
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500 text-sm">Status</span>
                  <span className="text-green-600 font-medium">Em execução</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Error State */}
        {status === 'error' && result && (
          <>
            <div className="bg-red-100 rounded-full p-4 inline-block mb-4">
              <XCircle className="h-16 w-16 text-red-600" />
            </div>
            <span className="inline-block bg-red-500 text-white text-sm font-semibold px-4 py-1 rounded-full mb-4">
              ERRO
            </span>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Erro na Aprovação</h1>
            <p className="text-slate-600 mb-6">{result.message}</p>
            
            {result.error && (
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500 text-sm">Código</span>
                  <span className="text-slate-800 font-mono">{result.error}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Redirect Notice */}
        {status !== 'loading' && (
          <>
            <button
              onClick={() => navigate('/admin/playbooks')}
              className="w-full bg-primary text-primary-foreground py-3 px-6 rounded-lg font-medium hover:bg-primary/90 transition-colors mb-4"
            >
              Ir para Playbooks
            </button>
            <p className="text-slate-500 text-sm">
              Redirecionando automaticamente em <span className="font-semibold">{countdown}</span> segundos...
            </p>
          </>
        )}

        {/* Footer */}
        <p className="text-slate-400 text-xs mt-6">CyberShield Security Platform</p>
      </div>
    </div>
  );
}
