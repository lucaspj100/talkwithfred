# Talk With Fred — Aplicativos Nativos (Android / iOS)

Este projeto usa **TanStack Start (SSR)** no Cloudflare Workers, portanto **não** produz um build estático. O app nativo é um **wrapper Capacitor (WebView remota)** que abre `https://talkwithfred.live` — mesma base de código, mesma autenticação, mesmo backend.

> ⚠️ **Apple App Store (Guideline 4.2)** — um app que é apenas uma webview pode ser rejeitado. Para publicar na Apple é altamente recomendado envolver funcionalidade nativa real (áudio de voz nativo, notificações push, deep links, etc.) e/ou migrar para SPA no futuro. Para Google Play o risco é baixo.

---

## 1. Requisitos

- **Android**: Android Studio (Giraffe ou superior), JDK 17, SDK 34+.
- **iOS**: macOS + Xcode 15+, CocoaPods (`sudo gem install cocoapods`).
- **Node**: 20+ e `bun` (ou `npm`) para rodar scripts.

## 2. Setup local

Clone o repositório e instale dependências:

```bash
bun install
```

As dependências do Capacitor **já estão instaladas** (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/app`, `@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/network`).

## 3. Gerar os projetos nativos

O `webDir` já existe (pasta `capacitor-webdir/` com um HTML offline mínimo). Basta adicionar as plataformas:

```bash
# Android
bunx cap add android

# iOS (apenas em macOS)
bunx cap add ios
```

Sincronizar sempre que mudar `capacitor.config.ts` ou plugins:

```bash
bunx cap sync
```

## 4. Abrir nas IDEs

```bash
bunx cap open android   # abre Android Studio
bunx cap open ios       # abre Xcode
```

## 5. Permissões

O app depende de **microfone** (voz em tempo real) e **rede**.

### Android — `android/app/src/main/AndroidManifest.xml`

Adicione dentro de `<manifest>`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

E dentro da `<application>` habilite mixed content de mídia se necessário (já configurado via `allowMixedContent: false` — não altere).

### Android — `MainActivity` (CRÍTICO para o microfone funcionar na WebView)

Mesmo com `RECORD_AUDIO` concedido no sistema, a WebView do Android **não** libera automaticamente `RESOURCE_AUDIO_CAPTURE` — por isso `getUserMedia` retorna `NotAllowedError` mesmo com a permissão nativa marcada como autorizada. É preciso interceptar `onPermissionRequest` da WebChromeClient.

Fornecemos um template pronto em `android-templates/MainActivity.java`. Após rodar `bunx cap add android`:

1. Abra a `MainActivity.java` gerada pelo Capacitor em:
   `android/app/src/main/java/live/talkwithfred/app/MainActivity.java`
2. **Substitua todo o conteúdo** pelo conteúdo de `android-templates/MainActivity.java` (drop-in: mesmo package, ainda estende `BridgeActivity`).
3. Confirme que a primeira linha `package live.talkwithfred.app;` bate com o `appId` do `capacitor.config.ts`.
4. Rode `bunx cap sync android`.

O que a `MainActivity` customizada faz:

- Estende `BridgeActivity` (não substitui o Bridge do Capacitor).
- Instala um `WebChromeClient` que só sobrescreve `onPermissionRequest` e `onPermissionRequestCanceled` — todos os demais callbacks (file chooser, prompts JS, geolocation, console, janelas) continuam com o comportamento padrão do Android.
- Valida a origem contra uma lista fixa (`https://talkwithfred.live`, `https://www.talkwithfred.live`, `https://speakwithlucas.com`, `https://www.speakwithlucas.com`). Origens externas recebem `deny()`.
- Concede **apenas** `PermissionRequest.RESOURCE_AUDIO_CAPTURE`. Nunca usa `request.grant(request.getResources())`, então recursos futuros (câmera, MIDI, etc.) não vazam permissão por acidente.
- Verifica `RECORD_AUDIO` com `ContextCompat.checkSelfPermission`. Se já estiver concedido, libera imediatamente. Se não, pede em runtime com `requestPermissions` e guarda o `PermissionRequest` pendente para responder em `onRequestPermissionsResult` (grant ou deny na UI thread).
- Trata `onPermissionRequestCanceled` e `onDestroy` para não vazar referências.
- Loga com a tag `TalkWithFredMic` (sem tokens, e-mail, áudio ou conteúdo pessoal). Filtre com:
  ```bash
  adb logcat -s TalkWithFredMic
  ```

**Reinstalação obrigatória.** Como a mudança é nativa (Java/Kotlin compilado), `bunx cap sync` não basta — desinstale o app do aparelho e instale novamente via `bunx cap run android` ou build assinado.

### Testes manuais (rodar no dispositivo)

- **A) Permissão já concedida** → toque em "Começar conversa por voz" → conversa inicia sem prompt.
- **B) Instalação limpa** → toque em começar → aceite o prompt Android → conversa inicia (a WebView recebe `AUDIO_CAPTURE` no mesmo clique).
- **C) Permissão negada** → aparece a mensagem "O acesso ao microfone foi negado…" sem crash.
- **D) Negar → autorizar em Configurações → voltar** → o listener `visibilitychange` limpa o erro; toque novamente e funciona.
- **E) Origem externa** (ex.: link para site fora da whitelist) → `request.deny()` é chamado; log mostra `Origin not allowed`.


### iOS — `ios/App/App/Info.plist`

Adicione:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>O Talk With Fred usa o microfone para você conversar por voz com o Fred em inglês.</string>
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <false/>
</dict>
```

## 6. Ícone e Splash Screen

1. Crie um ícone quadrado 1024×1024 e uma splash 2732×2732 (fundo `#0b0f19`).
2. Instale a ferramenta oficial:

   ```bash
   bun add -d @capacitor/assets
   mkdir -p resources
   # coloque icon.png (1024x1024) e splash.png (2732x2732) em resources/
   bunx capacitor-assets generate
   ```

Isto gera automaticamente todos os tamanhos para Android e iOS.

## 7. Rodar em dispositivo

```bash
# Android
bunx cap run android

# iOS
bunx cap run ios
```

## 8. O que já está configurado

- `capacitor.config.ts` aponta para `https://talkwithfred.live` via `server.url`.
- `allowNavigation` autoriza domínios Supabase, Mercado Pago e Google (login).
- Splash com fundo escuro `#0b0f19`, 1.5s.
- StatusBar em tema escuro.
- Fallback offline em `capacitor-webdir/index.html` (recarrega quando a rede volta).

## 9. Auth, voz, exercícios

Como o app é um WebView carregando a produção:

- **Login/OAuth**: funciona pois Supabase e Google estão na `allowNavigation`.
- **Voz em tempo real**: usa `getUserMedia` do WebView — depende da permissão de microfone (passo 5).
- **Assinatura Mercado Pago**: o checkout hospedado abre dentro da mesma WebView e volta ao app via URL de retorno.
- **Exercícios**: 100% já funcionam via web.

## 10. Botão voltar do Android

O plugin `@capacitor/app` já intercepta o botão físico. Se quiser fechar o app na raiz em vez de sair da WebView, adicione em `src/start.ts` (ou em um listener global no cliente):

```ts
import { App } from "@capacitor/app";

App.addListener("backButton", ({ canGoBack }) => {
  if (!canGoBack) App.exitApp();
  else window.history.back();
});
```

## 11. Safe areas

Já respeitadas via `viewport-fit=cover` + CSS `env(safe-area-inset-*)` no projeto web. Nada a fazer.

## 12. Publicação

- **Google Play**: gere um AAB assinado pelo Android Studio (`Build > Generate Signed Bundle`).
- **Apple App Store**: archive pelo Xcode e envie via App Store Connect. **Prepare-se para 4.2** — considere adicionar plugins nativos reais antes de submeter.

---

**Resumo**: `bunx cap add android && bunx cap add ios && bunx cap sync && bunx cap open android`. O app abre `talkwithfred.live` e reaproveita 100% do backend, autenticação e voz.
