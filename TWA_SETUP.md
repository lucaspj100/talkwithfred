# Talk With Fred — Android via Trusted Web Activity (TWA / Bubblewrap)

Este guia gera um APK/AAB para Play Store que abre o site
`https://talkwithfred.live` em uma **Trusted Web Activity** (Custom Tabs em
tela cheia usando o Chrome do próprio aparelho). Não é WebView do Android,
portanto **não sofre com o `NotReadableError` do microfone** que aparece
no wrapper Capacitor no Redmi 9.

O projeto Capacitor em `capacitor.config.ts` / `android/` **permanece
intacto** para referência. A TWA é gerada em uma pasta separada `twa/`.

---

## 1. Requisitos do site (já configurados)

- Manifesto público: **https://talkwithfred.live/manifest.webmanifest**
- Servido em HTTPS (Lovable / Cloudflare) ✅
- Ícones 192×192, 512×512 e 512×512 maskable em `/icon-192.png`,
  `/icon-512.png`, `/icon-maskable-512.png` ✅
- `theme-color` `#0b0f19` no `<head>` ✅
- `display: standalone`, `start_url: /`, `scope: /` ✅

> **Service Worker:** Bubblewrap **não exige** service worker desde
> Chrome/Android recente. Mantemos o site sem SW para não introduzir
> caches instáveis. Se um dia quiser instalação como PWA pelo Chrome
> desktop, aí sim adicionamos SW controlado.

---

## 2. Digital Asset Links

O arquivo público em `public/.well-known/assetlinks.json` fica servido em:

**https://talkwithfred.live/.well-known/assetlinks.json**

Ele contém o `package_name` `live.talkwithfred.app` e um placeholder
`REPLACE_WITH_SHA256_FINGERPRINT_OF_YOUR_SIGNING_KEY`. Depois de gerar
sua keystore de release, substitua pelo fingerprint SHA-256 correto e
publique novamente. Bubblewrap imprime o fingerprint ao final do
`bubblewrap build`, e você também pode obtê-lo com:

```bash
keytool -list -v -keystore android.keystore -alias android \
  | grep "SHA256:" | awk '{print $2}'
```

Sem o `assetlinks.json` correto, a TWA abre com **uma barra de URL do
Chrome no topo** (modo fallback). Com o fingerprint certo, fica em tela
cheia real.

---

## 3. Instalar o Bubblewrap CLI

Requer Node 18+ e JDK 17.

```bash
npm i -g @bubblewrap/cli
bubblewrap doctor
```

O `doctor` baixa JDK/Android SDK automaticamente se faltar.

---

## 4. Gerar o projeto Android da TWA

Em uma pasta separada (não dentro de `android/` do Capacitor):

```bash
mkdir -p twa
cd twa
bubblewrap init --manifest https://talkwithfred.live/manifest.webmanifest
```

Aceite os defaults, com essas respostas específicas:

| Pergunta                    | Resposta                          |
| --------------------------- | --------------------------------- |
| Application ID              | `live.talkwithfred.app`           |
| Display mode                | `standalone`                      |
| Orientation                 | `portrait`                        |
| Status bar color            | `#0b0f19`                         |
| Include splash screen       | `yes` (fundo `#0b0f19`)           |
| Signing key path            | `./android.keystore` (cria nova)  |
| Signing key alias           | `android`                         |

Guarde a **keystore** e as senhas em local seguro — é ela que assina
todas as futuras atualizações da Play Store.

---

## 5. Build do APK/AAB

```bash
cd twa
bubblewrap build
```

Isso gera:

- `app-release-signed.apk` — para instalar em aparelho de teste
- `app-release-bundle.aab` — para upload na Play Store

Ao final, o Bubblewrap imprime o **SHA-256 fingerprint** da sua
keystore. Copie-o para `public/.well-known/assetlinks.json` no lugar
de `REPLACE_WITH_SHA256_FINGERPRINT_OF_YOUR_SIGNING_KEY` e publique
novamente o site.

---

## 6. Instalar o APK de teste no Redmi 9

Com o aparelho conectado por USB e depuração USB habilitada:

```bash
adb uninstall live.talkwithfred.app   # remove o Capacitor antigo se estiver instalado
adb install twa/app-release-signed.apk
```

Abra o app. Deve carregar `https://talkwithfred.live` **em tela cheia
sem barra de URL** (se assetlinks.json já estiver publicado com o
fingerprint correto). O microfone passa a ser gerenciado pelo Chrome
do Android, portanto a permissão é solicitada exatamente como no
navegador — e não bate no bug de WebView `NotReadableError`.

Se aparecer a barra de URL no topo, o `assetlinks.json` ainda não bate
com o fingerprint. Corrija e reinstale o app.

---

## 7. O que fica na Play Store

- Package name: `live.talkwithfred.app` (mesmo do Capacitor — se você
  já publicou o Capacitor, a próxima atualização será a TWA)
- Assine o AAB com a **mesma keystore** usada em produções anteriores
  se estiver atualizando um app já publicado; caso contrário, use a
  nova keystore criada pelo Bubblewrap.

---

## 8. E o Capacitor?

`capacitor.config.ts`, `android/` e `MOBILE_SETUP.md` continuam no
repositório para referência histórica. Não são usados pela TWA. Depois
de validar a TWA em produção, podemos apagar essa pasta em um PR
separado.
