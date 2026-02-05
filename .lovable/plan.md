
# Plano: Padronização do Logo CyberShield em Todo o Projeto

## Resumo Executivo
O novo logo CyberShield será implementado de forma consistente em todas as páginas e componentes da aplicação, substituindo ícones genéricos de escudo (`Shield`) onde o logo oficial deve aparecer.

---

## Análise Atual

### Locais com Logo Correto
| Componente | Status | Método |
|------------|--------|--------|
| `Login.tsx` | OK | Import ES6 (`@/assets/logo-cybshield.png`) |
| `Navbar.tsx` | Parcial | URL direta (`/logo-cybshield.png?v=2`) |
| `AppSidebar.tsx` | Parcial | URL direta (`/logo-cybshield.png`) |

### Locais que Precisam do Logo (Usando Shield Genérico)
| Componente | Linha | Descrição |
|------------|-------|-----------|
| `Signup.tsx` | ~150 | Header do card de cadastro |
| `ForgotPassword.tsx` | ~73 | Header do card de recuperação |
| `UpdatePassword.tsx` | ~119 | Header do card de nova senha |
| `ClientLayout.tsx` | ~40, ~97 | Header do sidebar e mobile |
| `HeroSection.tsx` | ~22 | Badge no hero da landing |
| `ContactForm.tsx` | ~158 | Header do formulário de contato |

### Arquivos de Ícone PWA (Precisam Atualização Separada)
- `public/pwa-icon-192.png`
- `public/pwa-icon-512.png`
- `public/favicon.ico`

---

## Plano de Implementação

### Fase 1: Copiar Imagem para Assets
Copiar o logo enviado para `src/assets/logo-cybshield.png`, substituindo o arquivo existente com a versão mais recente.

### Fase 2: Páginas de Autenticação

#### 2.1 Signup.tsx
```text
Antes: <Shield className="h-8 w-8 text-primary/80" />
Depois: <img src={logoImage} alt="CyberShield" className="h-12 w-12 object-contain" />
```
- Adicionar import do logo
- Substituir ícone Shield pelo logo com glassmorphism similar ao Login

#### 2.2 ForgotPassword.tsx
```text
Antes: <Shield className="h-8 w-8 text-primary/80" />
Depois: <img src={logoImage} alt="CyberShield" className="h-12 w-12 object-contain" />
```
- Mesma abordagem do Signup

#### 2.3 UpdatePassword.tsx
```text
Antes: <Shield className="h-8 w-8 text-primary/80" />
Depois: <img src={logoImage} alt="CyberShield" className="h-12 w-12 object-contain" />
```
- Mesma abordagem consistente

### Fase 3: Layouts de Aplicação

#### 3.1 ClientLayout.tsx
```text
Desktop Sidebar:
  Antes: <h1>CyberShield</h1>
  Depois: <img src={logoImage} className="h-8" /> + <span>CyberShield</span>

Mobile Header:
  Antes: <h1>CyberShield</h1>
  Depois: <img src={logoImage} className="h-7" /> + <span>CyberShield</span>
```

#### 3.2 AppSidebar.tsx (Melhorar Método)
```text
Antes: src="/logo-cybshield.png" (URL direta)
Depois: import logoImage + src={logoImage}
```
- Migrar para import ES6 para consistência

#### 3.3 Navbar.tsx (Melhorar Método)
```text
Antes: src="/logo-cybshield.png?v=2" (URL com cache bust)
Depois: import logoImage + src={logoImage}
```

### Fase 4: Componentes de Landing

#### 4.1 HeroSection.tsx
O ícone `Shield` no badge é decorativo e pode permanecer como está, pois não representa a identidade da marca diretamente.

#### 4.2 ContactForm.tsx
```text
Antes: <Shield className="w-8 h-8 text-primary" />
Depois: <img src={logoImage} className="h-10 w-10 object-contain" />
```

---

## Estrutura Final de Imports

Todos os componentes que exibem o logo usarão:
```typescript
import logoImage from '@/assets/logo-cybshield.png';
```

---

## Arquivos que Serão Modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/assets/logo-cybshield.png` | Substituído pela nova imagem |
| `src/pages/Signup.tsx` | Adicionar logo no header |
| `src/pages/ForgotPassword.tsx` | Adicionar logo no header |
| `src/pages/UpdatePassword.tsx` | Adicionar logo no header |
| `src/components/client/ClientLayout.tsx` | Adicionar logo no sidebar/header |
| `src/components/AppSidebar.tsx` | Migrar para import ES6 |
| `src/components/Navbar.tsx` | Migrar para import ES6 |
| `src/components/ContactForm.tsx` | Adicionar logo no formulário |

---

## Notas Técnicas

1. **Import ES6 vs URL Direta**: Usar imports garante que o Vite processe corretamente os assets, aplique hash de cache e otimize as imagens.

2. **Ícones PWA**: Os arquivos `pwa-icon-192.png` e `pwa-icon-512.png` precisarão ser atualizados separadamente para manter consistência no PWA. Isso pode ser feito em um passo adicional se desejado.

3. **Favicon**: O `favicon.ico` atualmente aponta para `pwa-icon-192.png`. Pode ser atualizado para o novo logo em formato .ico se necessário.

4. **Tamanhos Consistentes**:
   - Páginas de Auth: `h-12 w-12` a `h-16 w-16`
   - Sidebars: `h-8`
   - Navbar: `h-9`
   - Formulários: `h-10 w-10`
