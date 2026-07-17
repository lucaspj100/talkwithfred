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
