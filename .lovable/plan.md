## Talk With Fred — Plano do MVP

Plataforma para brasileiros praticarem inglês conversando com **Fred**, uma IA parceira de conversação por texto e voz. Sem pagamento nesta versão.

### Stack
- **Frontend:** TanStack Start + Tailwind + shadcn (já configurado)
- **Backend:** Lovable Cloud (auth, Postgres, RLS, server functions)
- **IA:** Lovable AI Gateway — `google/gemini-3-flash-preview` (chat), `openai/gpt-4o-mini-transcribe` (STT), `openai/gpt-4o-mini-tts` (voz do Fred, voz `ash`)
- **AI Elements** para a UI do chat (conversation, message, prompt-input, shimmer)

### Design
- Visual moderno, escuro com acento quente (azul-escuro + âmbar/dourado para Fred), cards arredondados, tipografia sóbria.
- Fred = avatar digital ilustrado (gerado), com 4 estados visuais: **neutro / ouvindo / pensando / respondendo** (anel pulsante + microcopy de estado).
- Não usar ícone Sparkles como identidade.
- Responsivo mobile-first.

### Rotas
```
/                       Landing (público)
/auth                   Login + cadastro
/_authenticated/onboarding   Questionário inicial (redirect se já respondeu)
/_authenticated/dashboard    Saudação, cards (nível, objetivo), modos, histórico
/_authenticated/chat/$conversationId   Tela do Fred + chat
/_authenticated/admin   Painel admin (somente role 'admin')
/api/chat               Streaming chat (server route)
/api/stt                Speech-to-text (server route)
/api/tts                Text-to-speech (server route)
```

### Banco de dados (Lovable Cloud)
Tabelas conforme spec — `user_profiles`, `conversations`, `messages`, `usage_logs` — com RLS escopada por `auth.uid()`. Roles via tabela separada `user_roles` + função `has_role` (admin para painel). `profiles` simples (name, email) com trigger `handle_new_user`. GRANTs explícitos em todas as tabelas.

### Questionário
7 perguntas conforme spec → grava em `user_profiles`. Layout em passos (1/7…7/7), botão voltar/avançar, opções como cards selecionáveis.

### Chat com Fred
- AI Elements: `Conversation`, `Message`, `MessageResponse`, `PromptInput` + botão microfone customizado.
- Server route `/api/chat` monta system prompt dinâmico a partir do `user_profile` + `mode` (Free / Travel / Job Interview / Business / Daily Life / Beginner) seguindo o prompt-base fornecido.
- Streaming via `useChat` + `DefaultChatTransport`.
- Persistência: cada `sendMessage` grava user+assistant em `messages` ao final do stream (via `onFinish`).
- **Voz entrada:** MediaRecorder → `/api/stt` (Lovable AI transcribe) → preenche input.
- **Voz saída:** botão "Ouvir Fred" em cada mensagem do assistant → `/api/tts` streaming PCM (voz `ash`) → AudioContext.
- Estado visual do Fred derivado de `status` do useChat + estado de gravação/playback.

### Correção embutida
System prompt instrui Fred a, quando houver erro relevante, devolver:
resposta natural → correção curta → frase melhorada → explicação breve → nova pergunta. Idioma da explicação conforme preferência (`explanation_language`). Ritmo e dificuldade ajustados ao nível.

### Dashboard
Saudação "Olá, {name}", 2 cards (nível, objetivo), 6 botões de modo, lista das últimas 5 conversas com link, botão grande "Conversar com Fred" (cria nova conversa em Free Conversation e navega).

### Admin
Rota `/admin` protegida por `has_role(auth.uid(), 'admin')`. Server fn lista usuários com join em profiles + user_profiles + counts de mensagens + max(created_at) de messages como último acesso. Tabela com colunas da spec.

### Entregáveis por fase (mesma resposta)
1. Migration SQL (tabelas + RLS + grants + trigger + roles).
2. Tipos / clientes Supabase já existentes.
3. Server fns + server routes (chat, stt, tts, profile, conversations, admin).
4. Landing page persuasiva.
5. Auth (email/senha) + redirect onboarding.
6. Onboarding multi-step.
7. Dashboard.
8. Tela do Fred com avatar gerado, chat AI Elements, voz in/out, estados.
9. Admin.
10. sitemap.xml + robots.txt + metadata SEO na landing.

### Fora do escopo (confirmado)
Pagamento, assinatura, trial, cobrança, Google OAuth (somente email/senha conforme spec do usuário — pode ser adicionado depois).

Aprovando, começo a construir.