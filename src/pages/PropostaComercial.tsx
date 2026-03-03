import React, { useRef } from 'react';
import { Shield, TrendingUp, Target, Users, DollarSign, Award, Rocket, ChevronRight, Download, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import cybershieldLogo from '@/assets/logo-cybshield-new.png';

const PropostaComercial = () => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top Bar - Hidden on print */}
      <div className="print:hidden sticky top-0 z-50 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Voltar</span>
          </Link>
          <Button onClick={handlePrint} variant="outline" size="sm" className="border-white/10 text-white/80 hover:bg-white/5">
            <Download className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <div ref={printRef} className="max-w-5xl mx-auto px-6 py-12 print:py-4 print:px-8">
        {/* Header */}
        <div className="text-center mb-16 print:mb-8">
          <div className="flex justify-center mb-6">
            <img src={cybershieldLogo} alt="CyberShield" className="w-16 h-16 object-contain" />
          </div>
          <div className="inline-block px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wider uppercase mb-4">
            Confidencial
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3 print:text-3xl">
            Proposta Comercial
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto print:text-base">
            Modelo 100% Comissionado + Caminho Estruturado para Sociedade
          </p>
          <div className="mt-6 text-xs text-white/30">
            CyberShield Segurança Digital • {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </div>
        </div>

        {/* Section: Comissões PRO */}
        <section className="mb-12 print:mb-6">
          <SectionTitle icon={DollarSign} title="Comissões por Venda" accent="emerald" />

          <div className="grid md:grid-cols-2 gap-6 mt-6">
            {/* PRO Card */}
            <div className="relative rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent p-6 print:p-4">
              <div className="absolute -top-3 left-6">
                <span className="px-3 py-1 bg-emerald-500 text-black text-xs font-bold rounded-full uppercase tracking-wide">
                  Foco Principal
                </span>
              </div>
              <h3 className="text-xl font-bold text-emerald-400 mt-2 mb-4">Plano PRO — R$ 599/mês</h3>
              <div className="space-y-3">
                <CommissionRow label="Taxa de instalação (R$ 500)" value="40% = R$ 200" />
                <CommissionRow label="Mensalidade recorrente" value="20% por 6 meses" />
                <CommissionRow label="Addon dispositivos" value="Incluso nos 20%" />
              </div>
              <div className="mt-5 pt-4 border-t border-white/5">
                <p className="text-sm text-white/40 mb-1">Exemplo — 1 cliente PRO em 6 meses:</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-400">~R$ 918</span>
                  <span className="text-white/30 text-sm">por cliente</span>
                </div>
              </div>
            </div>

            {/* Starter Card */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 print:p-4">
              <h3 className="text-xl font-bold text-white/80 mb-4">Plano Starter — R$ 249/mês</h3>
              <div className="space-y-3">
                <CommissionRow label="Taxa de instalação (R$ 500)" value="40% = R$ 200" />
                <CommissionRow label="Mensalidade recorrente" value="20% por 6 meses" />
                <CommissionRow label="Possível reajuste p/ R$ 349" value="Mantém 20%" subtle />
              </div>
              <div className="mt-5 pt-4 border-t border-white/5">
                <p className="text-sm text-white/40 mb-1">Exemplo — 1 cliente Starter em 6 meses:</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white/70">~R$ 498</span>
                  <span className="text-white/30 text-sm">por cliente</span>
                </div>
                <p className="text-xs text-white/30 mt-1">Com reajuste (R$ 349): ~R$ 618</p>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Direcionamento */}
        <section className="mb-12 print:mb-6">
          <SectionTitle icon={Target} title="Direcionamento Comercial" accent="blue" />
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Foco" value="Plano PRO" />
            <MetricCard label="Meta de mix" value="70% PRO" />
            <MetricCard label="Abordagem" value="Consultiva" />
            <MetricCard label="Posição" value="Premium" />
          </div>
          <div className="mt-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
            <p className="text-sm text-white/50">
              <span className="text-blue-400 font-medium">Estratégia:</span> Venda consultiva para PMEs. 
              Não competir por preço — posicionar por <strong className="text-white/70">valor e segurança</strong>.
            </p>
          </div>
        </section>

        {/* Section: Escada de Crescimento */}
        <section className="mb-12 print:mb-6 print:break-before-page">
          <SectionTitle icon={Rocket} title="Escada de Crescimento" accent="violet" />
          <div className="mt-6 space-y-3">
            <GrowthStep
              milestone="10 clientes ativos"
              reward='Bônus R$ 1.000 + título "Closer CyberShield"'
              tier={1}
            />
            <GrowthStep
              milestone="25 clientes ativos"
              reward="Comissão recorrente sobe para 22%"
              tier={2}
            />
            <GrowthStep
              milestone="50 clientes ativos"
              reward="Comissão recorrente sobe para 25%"
              tier={3}
            />
            <GrowthStep
              milestone="100 clientes + 12 meses"
              reward="Elegível para liderança comercial"
              tier={4}
            />
            <GrowthStep
              milestone="24 meses de performance"
              reward="Elegível a avaliação para Head de Vendas"
              tier={5}
              isLast
            />
          </div>
        </section>

        {/* Section: Head de Vendas */}
        <section className="mb-12 print:mb-6">
          <SectionTitle icon={Award} title="Caminho para Head de Vendas e Sociedade" accent="amber" />
          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 print:p-4">
            <p className="text-sm text-white/50 mb-4">
              O cargo de Head de Vendas <strong className="text-amber-400">não é automático</strong>. Requisitos mínimos:
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {[
                '24 meses de empresa',
                'Performance consistente',
                'Carteira ativa saudável (baixo churn)',
                'Estruturação do processo comercial',
                'Capacidade de liderar equipe',
              ].map((req, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-amber-500/60 mt-0.5 shrink-0" />
                  <span className="text-sm text-white/60">{req}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-amber-500/10">
              <p className="text-sm text-white/50">
                Após essa etapa: <strong className="text-white/70">cargo formal</strong>, <strong className="text-white/70">salário fixo</strong> e possível 
                <strong className="text-amber-400"> participação societária progressiva (1% a 3%)</strong> com contrato formal e vesting.
              </p>
            </div>
          </div>
        </section>

        {/* Section: Simulação */}
        <section className="mb-12 print:mb-6">
          <SectionTitle icon={TrendingUp} title="Simulação de Ganhos — Cenário Conservador (Foco PRO)" accent="cyan" />
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left px-5 py-3 text-white/40 font-medium">Mês</th>
                  <th className="text-center px-5 py-3 text-white/40 font-medium">Novos/mês</th>
                  <th className="text-center px-5 py-3 text-white/40 font-medium">Acumulado</th>
                  <th className="text-right px-5 py-3 text-white/40 font-medium">Ganho Mensal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <SimRow month="Mês 1" newClients={5} accumulated={5} earning="R$ 1.599" />
                <SimRow month="Mês 3" newClients={5} accumulated={15} earning="R$ 2.797" />
                <SimRow month="Mês 6" newClients={5} accumulated={30} earning="R$ 4.594" />
                <SimRow month="Mês 12" newClients={5} accumulated={60} earning="R$ 8.188" highlight />
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-white/30 text-center">
            * Valores estimados com base em 5 vendas PRO/mês. Comissões evoluem com as metas atingidas.
          </p>
        </section>

        {/* Section: Potencial */}
        <section className="mb-12 print:mb-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
              <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Ganho médio após maturação</p>
              <p className="text-3xl font-bold text-emerald-400">R$ 5.000 — R$ 10.000</p>
              <p className="text-sm text-white/40 mt-1">por mês</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
              <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Teto estratégico</p>
              <p className="text-3xl font-bold text-white/70">R$ 10.000/mês</p>
              <p className="text-sm text-white/40 mt-1">mantendo sustentabilidade</p>
            </div>
          </div>
        </section>

        {/* Section: Cultura */}
        <section className="mb-16 print:mb-8">
          <SectionTitle icon={Users} title="Cultura e Visão" accent="rose" />
          <div className="mt-6 rounded-2xl bg-gradient-to-br from-rose-500/5 via-transparent to-violet-500/5 border border-white/10 p-6 print:p-4">
            <p className="text-white/50 text-sm leading-relaxed mb-4">
              A CyberShield está construindo algo diferente:
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {[
                'Empresa sólida e sustentável',
                'Time comercial de alta performance',
                'Crescimento estruturado',
                'Oportunidade real de crescimento interno',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-400/60" />
                  <span className="text-sm text-white/60">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-white/5 text-center">
              <p className="text-lg font-medium text-white/70 italic">
                "Quem constrói resultado participa da evolução da empresa."
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center text-xs text-white/20 pb-8 print:pb-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src={cybershieldLogo} alt="CyberShield" className="w-5 h-5 object-contain opacity-30" />
            <span>CyberShield Segurança Digital</span>
          </div>
          <p>Documento confidencial — Uso interno</p>
        </div>
      </div>
    </div>
  );
};

// --- Sub-components ---

function SectionTitle({ icon: Icon, title, accent }: { icon: React.ElementType; title: string; accent: string }) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  };
  const c = colors[accent] || colors.emerald;
  return (
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg border ${c}`}>
        <Icon className="w-5 h-5" />
      </div>
      <h2 className="text-2xl font-bold print:text-xl">{title}</h2>
    </div>
  );
}

function CommissionRow({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${subtle ? 'text-white/30 italic' : 'text-white/50'}`}>{label}</span>
      <span className={`text-sm font-semibold ${subtle ? 'text-white/40' : 'text-white/80'}`}>{value}</span>
    </div>
  );
}

function GrowthStep({ milestone, reward, tier, isLast }: { milestone: string; reward: string; tier: number; isLast?: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-xs font-bold">
          {tier}
        </div>
        {!isLast && <div className="w-px h-6 bg-violet-500/10" />}
      </div>
      <div className="pt-1">
        <p className="text-sm font-medium text-white/70">{milestone}</p>
        <p className="text-sm text-white/40">{reward}</p>
      </div>
    </div>
  );
}

function SimRow({ month, newClients, accumulated, earning, highlight }: { month: string; newClients: number; accumulated: number; earning: string; highlight?: boolean }) {
  return (
    <tr className={highlight ? 'bg-emerald-500/5' : ''}>
      <td className="px-5 py-3 text-white/60 font-medium">{month}</td>
      <td className="px-5 py-3 text-center text-white/50">{newClients}/mês</td>
      <td className="px-5 py-3 text-center text-white/50">{accumulated}</td>
      <td className={`px-5 py-3 text-right font-semibold ${highlight ? 'text-emerald-400' : 'text-white/70'}`}>{earning}</td>
    </tr>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 text-center">
      <p className="text-xs text-white/30 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-bold text-white/70">{value}</p>
    </div>
  );
}

export default PropostaComercial;
