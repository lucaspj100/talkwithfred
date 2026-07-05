# Plano: Simulador de Inglês para Carreira (funil de leads)

Reposicionamento completo do produto: da "IA para praticar inglês" para "Simulador de Inglês para Carreira" com foco em geração de leads para escola executiva (bolsa parcial via WhatsApp).

## 1. Landing page (`src/routes/index.tsx`)

Substituir hero atual pelo novo posicionamento:
- **Headline**: "Você tem capacidade para oportunidades maiores, mas o inglês ainda te faz recuar?"
- **Subheadline**: "Faça uma simulação gratuita com IA, veja onde seu inglês trava e descubra quais oportunidades podem estar ficando fora do seu radar."
- **CTA primário**: "Fazer simulação gratuita" → `/simulacao`
- **CTA secundário**: "Ver como funciona" → âncora `#como-funciona`

Nova seção **Como funciona** (4 passos): Responda seu momento → Simulação com Fred → Mapa de Oportunidades → Continue pelo WhatsApp.

Manter seções sociais existentes (features, depoimentos se houver) reescritas em linguagem carreira.

## 2. Novo fluxo público de simulação (sem login)

Criar rota pública `/simulacao` como funil de 3 etapas:

### Etapa A — Mini diagnóstico (`/simulacao` index)
Perguntas rápidas (multi-step, sem login):
1. Área profissional (Tecnologia, Dados, Produto, Comercial, Financeiro, RH, Engenharia, Gestão, Saúde, Outro)
2. Objetivo principal (Crescer, Promoção, Entrevista, Vaga internacional, Ganhar em dólar/euro, Reuniões, Viagem, Segurança para falar)
3. Nível atual (Básico, Intermediário travado, Intermediário, Avançado sem segurança, Não sei)
4. Onde inglês mais limita (Fala, Escuta, Entrevistas, Reuniões, Apresentações, Vergonha, Constância, Vagas internacionais)
5. Já deixou de avançar por causa do inglês? (Sim, Já pensei mas recuei, Não, Nunca procurei)

Estado do diagnóstico em `sessionStorage` (chave `fred_lead_diag`) para sobreviver ao fluxo sem exigir login.

### Etapa B — Captura de lead + simulação (`/simulacao/pratica`)
Antes de iniciar a conversa: form curto (nome, email, WhatsApp opcional). Persistir em nova tabela `leads`.

Simulação com Fred adaptada ao objetivo:
- Entrevista → simulação de entrevista de emprego em inglês
- Reuniões → daily/reunião profissional
- Vaga internacional → conversa com recrutador internacional
- Promoção/Crescer → conversa com gestor sobre carreira
- Outros → conversa profissional adaptada à área

Reutilizar o motor de chat existente, mas em modo "simulação curta" (limite ~6-8 turnos), usando `buildFredSystemPrompt` estendido com o cenário. Chat público (anon) usa uma variante do endpoint `/api/chat` sem exigir auth para leads.

Ao fim: botão "Ver meu Mapa de Oportunidades".

### Etapa C — Mapa de Oportunidades (`/simulacao/resultado`)
Tela com:
- Resumo do perfil (baseado no diagnóstico)
- Principal trava percebida (do diagnóstico + observação da simulação)
- Oportunidades nacionais (texto padrão adaptado à área)
- Oportunidades internacionais (texto padrão adaptado)
- Estimativa de impacto (faixa, sem promessa)
- Próximo passo sugerido
- Aviso sobre estimativas
- **CTA principal**: "Quero continuar minha análise pelo WhatsApp" → link `wa.me` com mensagem pré-preenchida contendo nome + trava + área

## 3. Banco de dados

Nova tabela `leads` (migration):
- `name`, `email`, `whatsapp`, `area`, `goal`, `level`, `main_block`, `already_lost_opportunity`
- `simulation_summary` (texto gerado ao fim da simulação, opcional)
- `converted_to_whatsapp` (boolean, marcado quando clica no CTA)
- RLS: apenas service_role escreve/lê (endpoint público server-side); admins podem ler via `has_role('admin')`.
- GRANTs para authenticated (admin leitura) e service_role.

## 4. Server functions / API

- `src/lib/leads.functions.ts` — `createLead` (public server fn), `updateLeadSimulation`, `markLeadConverted`. Usa `supabaseAdmin` (server-only).
- `src/lib/simulation-prompt.ts` — builder de prompt Fred para cenário de simulação carreira (curto, focado, objetivo).
- Endpoint `/api/chat` já existe; adicionar variante ou parâmetro `mode: "simulation"` que dispensa auth quando `leadId` é fornecido, ou criar `/api/simulation-chat` público que valida `leadId` server-side.

## 5. Configuração comercial

Adicionar em `.env` (usuário informa depois):
- `VITE_WHATSAPP_NUMBER` — número do WhatsApp comercial (ex: `5511999999999`)

Se não configurado, mostrar aviso mas ainda gerar link genérico.

## 6. O que se mantém

- App autenticado (`/dashboard`, `/chat`, `/practice`, onboarding) permanece intacto para usuários existentes.
- Fred, correções, personalização, modos de conversa, TTS/STT — nenhum toque.
- Landing atual será reescrita, mas o app logado continua igual.

## 7. Detalhes técnicos

- Rotas públicas: `src/routes/simulacao.tsx` (layout), `simulacao.index.tsx` (diagnóstico), `simulacao.pratica.tsx` (lead form + chat), `simulacao.resultado.tsx` (mapa).
- Sessão do lead: `sessionStorage` + `leadId` retornado por `createLead` server fn.
- Componentes reaproveitados: shadcn (Button, Input, Card), design tokens em `src/styles.css`.
- Copy em português, tom empático, sem promessa de salário.
- Aviso legal em rodapé do Mapa: "As estimativas são possibilidades de mercado, não garantias..."

## 8. Fora de escopo (não faremos agora)

- Painel admin de leads (adicionar depois se pedido).
- Integração real com CRM/WhatsApp Business API (apenas link `wa.me`).
- Autenticação obrigatória para simulação gratuita (fluxo é público para maximizar conversão).
- A/B testing de copy.

## Arquivos a criar

- `supabase/migrations/<ts>_leads.sql`
- `src/lib/leads.functions.ts`
- `src/lib/simulation-prompt.ts`
- `src/lib/simulation-options.ts` (perguntas do diagnóstico)
- `src/routes/simulacao.tsx` (layout)
- `src/routes/simulacao.index.tsx` (diagnóstico)
- `src/routes/simulacao.pratica.tsx` (lead + chat)
- `src/routes/simulacao.resultado.tsx` (mapa de oportunidades)
- `src/routes/api/simulation-chat.ts` (endpoint público)
- `src/components/simulacao/*` (Steps, LeadForm, SimulationChat, OpportunityMap)

## Arquivos a editar

- `src/routes/index.tsx` (nova landing)
- `.env` (adicionar `VITE_WHATSAPP_NUMBER` placeholder)

Aprovar para eu implementar em uma sequência de tool calls.
