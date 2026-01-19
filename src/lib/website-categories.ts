export interface WebsiteCategory {
  key: string;
  name: string;
  icon: string;
  color: string;
  patterns: string[];
}

export const WEBSITE_CATEGORIES: WebsiteCategory[] = [
  {
    key: 'social',
    name: 'Redes Sociais',
    icon: '👥',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    patterns: [
      'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 
      'linkedin.com', 'tiktok.com', 'snapchat.com', 'pinterest.com', 
      'reddit.com', 'tumblr.com', 'threads.net', 'mastodon.social',
    ],
  },
  {
    key: 'video',
    name: 'Vídeos e Streaming',
    icon: '🎬',
    color: 'bg-red-500/10 text-red-500 border-red-500/20',
    patterns: [
      'youtube.com', 'netflix.com', 'primevideo.com', 'hbomax.com', 
      'disneyplus.com', 'twitch.tv', 'vimeo.com', 'dailymotion.com',
      'globoplay.globo.com', 'pluto.tv', 'paramount.com', 'star.com',
    ],
  },
  {
    key: 'news',
    name: 'Notícias',
    icon: '📰',
    color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    patterns: [
      // Internacionais
      'cnn.com', 'bbc.com', 'nytimes.com', 'theguardian.com',
      // Brasil - Grandes Portais
      'g1.globo.com', 'uol.com.br', 'folha.uol.com.br', 'estadao.com.br',
      'terra.com.br', 'r7.com', 'ig.com.br', 'correio24horas.com.br',
      'metropoles.com', 'gazetadopovo.com.br', 'oglobo.globo.com',
      // Brasil - Economia
      'infomoney.com.br', 'valor.com.br', 'exame.com', 'moneytimes.com.br',
      'seudinheiro.com', 'investnews.com.br',
    ],
  },
  {
    key: 'banking',
    name: 'Bancos',
    icon: '🏦',
    color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    patterns: [
      // Bancos Tradicionais
      'itau.com.br', 'bb.com.br', 'bradesco.com.br', 'santander.com.br',
      'caixa.gov.br', 'banrisul.com.br', 'sicredi.com.br', 'sicoob.com.br',
      'banestes.com.br', 'brb.com.br', 'banpara.b.br',
      // Bancos Digitais
      'nubank.com.br', 'inter.co', 'c6bank.com.br', 'original.com.br',
      'neon.com.br', 'next.me', 'modal.com.br', 'btgpactual.com',
      'picpay.com', 'mercadopago.com.br', 'pagseguro.com.br',
      // Bancos de Consignado (dados reais coletados)
      'bancobmg.com.br', 'bmgconsig.com.br', 'daycoval.com.br',
      'safra.com.br', 'bancopan.com.br', 'bv.com.br', 'bancomaster.com.br',
      'bonsucessoconsignado.com.br', 'c6consig.com.br', 'pansolucoes.com.br',
      'oleconsignado.com.br', 'bancoagibank.com.br', 'paraná.bancopan.com.br',
    ],
  },
  {
    key: 'government',
    name: 'Governo',
    icon: '🏛️',
    color: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
    patterns: [
      // Federal
      'gov.br', 'inss.gov.br', 'receita.fazenda.gov.br', 'dataprev.gov.br',
      'sougov.economia.gov.br', 'servidor.gov.br', 'acesso.gov.br',
      'esocial.gov.br', 'conectesus.saude.gov.br', 'gov.br',
      // Estados
      'mg.gov.br', 'sp.gov.br', 'rj.gov.br', 'ba.gov.br', 'pr.gov.br',
      'rs.gov.br', 'sc.gov.br', 'pe.gov.br', 'ce.gov.br', 'df.gov.br',
      // Específicos de MG (encontrados nos dados)
      'ipsm.mg.gov.br', 'ipsemg.mg.gov.br', 'bombeiros.mg.gov.br',
      'portaldoservidor.mg.gov.br', 'fazenda.mg.gov.br',
      // Militares
      'eb.mil.br', 'marinha.mil.br', 'fab.mil.br', 'pm.mg.gov.br',
    ],
  },
  {
    key: 'communication',
    name: 'Comunicação',
    icon: '💬',
    color: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
    patterns: [
      // Mensageiros
      'whatsapp.com', 'web.whatsapp.com', 'api.whatsapp.com',
      'telegram.org', 'web.telegram.org',
      'discord.com', 'signal.org', 'messenger.com',
      // Videoconferência
      'teams.microsoft.com', 'teams.live.com', 'skype.com',
      'zoom.us', 'meet.google.com', 'whereby.com',
    ],
  },
  {
    key: 'work',
    name: 'Trabalho',
    icon: '💼',
    color: 'bg-green-500/10 text-green-500 border-green-500/20',
    patterns: [
      // Desenvolvimento
      'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
      // Produtividade
      'notion.so', 'trello.com', 'asana.com', 'monday.com', 'clickup.com',
      'slack.com', 'basecamp.com', 'airtable.com',
      // Microsoft/Google Office
      'office.com', 'docs.google.com', 'drive.google.com', 'sheets.google.com',
      'outlook.office.com', 'sharepoint.com', 'onedrive.live.com',
    ],
  },
  {
    key: 'tools',
    name: 'Ferramentas',
    icon: '🔧',
    color: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    patterns: [
      // Design
      'canva.com', 'figma.com', 'miro.com', 'photopea.com',
      // Acesso Remoto (encontrados nos dados)
      'anydesk.com', 'ultraviewer.net', 'teamviewer.com', 'rustdesk.com',
      // Utilitários
      'win-rar.com', 'winzip.com', '7-zip.org', 'ccleaner.com',
      // PDF
      'adobe.com', 'ilovepdf.com', 'smallpdf.com', 'pdf24.org',
      // Outros
      'mozilla.org', 'msn.com', 'meuip.com.br', 'speedtest.net',
      'virustotal.com', 'wolframalpha.com',
    ],
  },
  {
    key: 'financial',
    name: 'Sistemas Financeiros',
    icon: '💳',
    color: 'bg-lime-500/10 text-lime-500 border-lime-500/20',
    patterns: [
      // Sistemas de Consignado (dados reais encontrados)
      'ic360.com.br', 'ibconsigweb.com.br', 'consig360.com.br',
      'sistemacorban.com.br', 'icconsig.com.br', 'facta.com.br',
      'agentefacta.com.br', 'happyconsig.com.br', 'lotusmais.com.br',
      'icred.digital', 'promobank.com.br', '3c.plus', 'consiglog.com.br',
      // Análise e Certificação
      'analisedocumentos.com.br', 'certificacaoaneps.com.br',
      'serasa.com.br', 'boavistaservicos.com.br', 'spcbrasil.org.br',
      // Sistemas Financeiros
      'b3.com.br', 'cetip.com.br', 'cvm.gov.br',
    ],
  },
  {
    key: 'shopping',
    name: 'Compras',
    icon: '🛒',
    color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    patterns: [
      // Internacionais
      'amazon.com', 'amazon.com.br', 'aliexpress.com', 'ebay.com',
      'wish.com', 'shein.com', 'temu.com',
      // Brasil - Grandes
      'mercadolivre.com.br', 'shopee.com.br', 'magalu.com.br',
      'americanas.com.br', 'casasbahia.com.br', 'pontofrio.com.br',
      'submarino.com.br', 'extra.com.br',
      // Brasil - Eletrônicos
      'kabum.com.br', 'pichau.com.br', 'terabyteshop.com.br',
      // Brasil - Comparadores
      'zoom.com.br', 'buscape.com.br', 'bondfaro.com.br',
      // Brasil - Marketplaces
      'elo7.com.br', 'olist.com', 'vtex.com', 'nuvemshop.com.br',
    ],
  },
  {
    key: 'email',
    name: 'E-mail',
    icon: '✉️',
    color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    patterns: [
      'mail.google.com', 'gmail.com', 'outlook.com', 'outlook.live.com', 
      'yahoo.com', 'protonmail.com', 'zoho.com', 'icloud.com',
      'uol.com.br', 'bol.com.br', 'terra.com.br',
    ],
  },
  {
    key: 'search',
    name: 'Busca',
    icon: '🔍',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    patterns: [
      'google.com', 'google.com.br', 'bing.com', 'duckduckgo.com', 
      'yahoo.com', 'baidu.com', 'ecosia.org', 'brave.com',
    ],
  },
  {
    key: 'games',
    name: 'Jogos',
    icon: '🎮',
    color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    patterns: [
      'steam.com', 'steampowered.com', 'epicgames.com', 'roblox.com', 
      'minecraft.net', 'ea.com', 'ubisoft.com', 'blizzard.com',
      'riotgames.com', 'playstation.com', 'xbox.com', 'nintendo.com',
    ],
  },
  {
    key: 'adult',
    name: 'Adulto',
    icon: '🔞',
    color: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
    patterns: [
      'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com',
    ],
  },
  {
    key: 'gambling',
    name: 'Apostas',
    icon: '🎰',
    color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    patterns: [
      'bet365.com', 'betfair.com', 'sportingbet.com', 'betano.com', 
      'pixbet.com', 'blaze.com', 'estrela.bet', 'betnacional.com',
      'galera.bet', 'betboo.com', 'rivalo.com', 'betsson.com',
    ],
  },
  {
    key: 'other',
    name: 'Outros',
    icon: '🌐',
    color: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    patterns: [],
  },
];

export function getCategoryForDomain(domain: string): WebsiteCategory {
  const normalizedDomain = domain.toLowerCase();
  
  for (const category of WEBSITE_CATEGORIES) {
    for (const pattern of category.patterns) {
      // Exact match or subdomain match
      if (normalizedDomain === pattern || normalizedDomain.endsWith('.' + pattern)) {
        return category;
      }
      // Also check if domain contains the pattern (for subdomains like web.whatsapp.com)
      if (normalizedDomain.includes(pattern)) {
        return category;
      }
    }
  }
  
  // Check for common TLD patterns
  if (normalizedDomain.endsWith('.gov.br') || normalizedDomain.endsWith('.gov')) {
    return WEBSITE_CATEGORIES.find(c => c.key === 'government')!;
  }
  if (normalizedDomain.endsWith('.mil.br') || normalizedDomain.endsWith('.mil')) {
    return WEBSITE_CATEGORIES.find(c => c.key === 'government')!;
  }
  
  return WEBSITE_CATEGORIES.find(c => c.key === 'other')!;
}

export function getCategoryByKey(key: string): WebsiteCategory | undefined {
  return WEBSITE_CATEGORIES.find(c => c.key === key);
}
