# Legendas sempre visíveis na chamada — Talk With Fred

## Diagnóstico do layout atual

Análise do código de `RealtimeConversation`, `TranscriptPanel` e das telas que os envolvem; ainda não é uma validação em aparelhos reais.

- **Legenda e histórico estão misturados.** A ordem atual é cabeçalho → avatar grande → controles → transcrição. A fala em andamento aparece no final do histórico, abaixo dos controles, em vez de ter um espaço próprio.
- **A tela pode crescer além da altura visível.** A chamada usa altura mínima de `100dvh`, não uma distribuição limitada ao espaço disponível. Cabeçalho, margens, avatar e transcrição somam suas alturas. O cabeçalho também reúne vários botões numa única linha, apertada em celulares.
- **A rolagem pode mover a página inteira.** A cada atualização de transcrição, `scrollIntoView({ behavior: "smooth" })` tenta levar o final do histórico à tela. Isso pode deslocar o avatar e os controles, além de gerar movimentos sucessivos enquanto o texto chega.
- **Há espaço inferior desnecessário.** O layout autenticado reserva 80px para a navegação inferior mesmo em `/chat/`, onde essa navegação está oculta. Não é o rodapé sobrepondo a chamada nessa tela; é uma reserva que aumenta o espaço total.
- **As áreas seguras já são consideradas parcialmente.** Há `viewport-fit=cover` e espaçamento com `safe-area-inset-top/bottom`, mas isso não garante que legenda e controles caibam juntos. `100dvh` sozinho também não resolve todos os comportamentos do teclado virtual.
- **A transcrição progressiva já existe.** `partialUser`, `partialAssistant` e `turns` oferecem os dados necessários; não é preciso alterar o mecanismo de conversação.

## Proposta de alteração mínima

Aplicar uma apresentação específica para celular, mantendo a organização atual do desktop.

### 1. Espaço próprio para a legenda atual

Ordem no celular:

```text
Cabeçalho compacto da chamada
Avatar do Fred
Legenda atual: Você / Fred
Controles da chamada + acesso ao histórico
Área segura inferior
```

- Reservar uma área estável entre avatar e controles: o crescimento do texto não empurra os botões nem muda a altura da página.
- Atualizar o texto usando os mesmos eventos existentes, sem esperar o fim da fala.
- Identificar claramente **Você** e **Fred** por nome e tratamento visual, usando as cores atuais do app; não depender só de cor.
- Manter a última fala visível até a próxima atualização. Durante uma interrupção, dar prioridade à fala do usuário conforme os estados já disponíveis.
- Em falas longas, acompanhar o trecho mais recente dentro da própria área de legenda, sem rolar a página. O texto completo continua disponível no histórico; não prometer que uma fala inteira de qualquer tamanho caberá simultaneamente.

### 2. Histórico secundário, sem disputar espaço

- No celular, abrir **Histórico** em um painel sobreposto ao toque, com rolagem interna e botão de fechar, sem encerrar a chamada.
- Preservar todas as mensagens já exibidas, inclusive a fala em andamento.
- Não puxar o usuário para o fim enquanto ele estiver lendo mensagens antigas. Acompanhamento do final somente dentro do histórico e quando ele já estiver próximo do fim.
- Ao fechar, voltar à legenda atual sem alterar a posição da tela de chamada.

### 3. Ajustes pequenos na tela que envolve a chamada

- Distribuir a chamada na altura realmente visível, com avatar menor em telas baixas; priorizar legenda e controles.
- Reorganizar o cabeçalho apenas no celular, preservando voltar, minutos, modo digitado e encerrar, sem amontoar os botões.
- Remover a reserva da navegação inferior apenas em `/chat/`; manter as demais telas intactas.
- Aplicar as áreas seguras uma única vez e considerar mudanças da barra do navegador e do teclado. Não fixar a legenda sobre os controles nem bloquear globalmente a rolagem do app.
- Manter avisos de erro e de reativação de áudio acessíveis, sem encobrir a legenda.

## Detalhes técnicos e limite de escopo

- `src/components/chat/realtime-conversation.tsx`: separar apresentação da legenda atual e histórico; manter chamada do hook, callbacks, estados de áudio e controles existentes.
- `src/routes/_authenticated/chat.$conversationId.tsx`: ajustar somente o contêiner e o cabeçalho da apresentação por voz no celular.
- `src/routes/_authenticated/route.tsx`: ajuste condicional da reserva inferior para `/chat/`, sem mexer em autenticação.
- `src/styles.css`: somente regras de tamanho, áreas seguras e organização da chamada, se necessárias.
- Se necessário, observar `window.visualViewport` após a montagem apenas para dimensionamento visual, sem modificar áudio ou eventos Realtime. Preservar um fallback com `dvh`.
- No desktop, preservar a apresentação atual. Conter a rolagem do histórico no próprio painel para evitar deslocamento inesperado da página, sem mudar sua organização visual.
- Não alterar `realtime-session.ts`, `use-realtime-voice.ts`, modelo, VAD, WebRTC, prompts, geração/transcrição de áudio, consumo de minutos, autenticação ou banco de dados.
- A simulação pública possui outro `TranscriptPanel`; não alterá-lo nesta proposta.

## Validação após aprovação

- Conferir chamada ativa com legendas progressivas de ambos os participantes, interrupções, falas longas e troca de turno.
- Conferir telas estreitas e baixas, orientação horizontal, áreas seguras e abertura/fechamento do histórico.
- Verificar barra do navegador e teclado virtual, inclusive a troca para modo digitado, sem sobreposições ou saltos de página.
- Comparar o desktop antes/depois e confirmar que controles, áudio e encerramento continuam funcionando.
- Separar o que for comprovado no navegador do que ainda exigir teste em Android/iPhone reais.

**Neste momento:** apenas diagnóstico e proposta para revisão; nenhuma alteração no funcionamento ou na aparência do app e nenhuma publicação.