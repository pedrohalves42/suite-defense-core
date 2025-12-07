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
    patterns: ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com', 'snapchat.com', 'pinterest.com', 'reddit.com', 'tumblr.com'],
  },
  {
    key: 'video',
    name: 'Vídeos e Streaming',
    icon: '🎬',
    color: 'bg-red-500/10 text-red-500 border-red-500/20',
    patterns: ['youtube.com', 'netflix.com', 'primevideo.com', 'hbomax.com', 'disneyplus.com', 'twitch.tv', 'vimeo.com', 'dailymotion.com'],
  },
  {
    key: 'news',
    name: 'Notícias',
    icon: '📰',
    color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    patterns: ['g1.globo.com', 'uol.com.br', 'folha.uol.com.br', 'estadao.com.br', 'cnn.com', 'bbc.com', 'nytimes.com', 'theguardian.com'],
  },
  {
    key: 'work',
    name: 'Trabalho',
    icon: '💼',
    color: 'bg-green-500/10 text-green-500 border-green-500/20',
    patterns: ['github.com', 'gitlab.com', 'notion.so', 'trello.com', 'asana.com', 'slack.com', 'teams.microsoft.com', 'zoom.us', 'meet.google.com', 'office.com', 'docs.google.com', 'drive.google.com'],
  },
  {
    key: 'shopping',
    name: 'Compras',
    icon: '🛒',
    color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    patterns: ['amazon.com', 'amazon.com.br', 'mercadolivre.com.br', 'aliexpress.com', 'ebay.com', 'shopee.com.br', 'magalu.com.br'],
  },
  {
    key: 'email',
    name: 'E-mail',
    icon: '✉️',
    color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    patterns: ['mail.google.com', 'outlook.com', 'outlook.live.com', 'yahoo.com', 'protonmail.com', 'zoho.com'],
  },
  {
    key: 'search',
    name: 'Busca',
    icon: '🔍',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    patterns: ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com'],
  },
  {
    key: 'games',
    name: 'Jogos',
    icon: '🎮',
    color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    patterns: ['steam.com', 'epicgames.com', 'roblox.com', 'minecraft.net', 'ea.com', 'ubisoft.com', 'blizzard.com'],
  },
  {
    key: 'adult',
    name: 'Adulto',
    icon: '🔞',
    color: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
    patterns: ['pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com'],
  },
  {
    key: 'gambling',
    name: 'Apostas',
    icon: '🎰',
    color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    patterns: ['bet365.com', 'betfair.com', 'sportingbet.com', 'betano.com', 'pixbet.com', 'blaze.com'],
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
      if (normalizedDomain === pattern || normalizedDomain.endsWith('.' + pattern)) {
        return category;
      }
    }
  }
  
  return WEBSITE_CATEGORIES.find(c => c.key === 'other')!;
}

export function getCategoryByKey(key: string): WebsiteCategory | undefined {
  return WEBSITE_CATEGORIES.find(c => c.key === key);
}
