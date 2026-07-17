import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Talk With Fred — Native Wrapper (Option A: Remote WebView).
 *
 * The Lovable web app runs on TanStack Start (SSR on Cloudflare Workers),
 * so we cannot produce a static `webDir` build. Instead the native app is
 * a thin shell that loads the production URL directly.
 *
 * `webDir` still points at a stub folder because `npx cap sync` requires
 * one to exist — it is intentionally near-empty.
 */
const config: CapacitorConfig = {
  appId: "live.talkwithfred.app",
  appName: "Talk With Fred",
  webDir: "capacitor-webdir",
  server: {
    url: "https://talkwithfred.live",
    cleartext: false,
    // Allow navigating into Supabase auth / Mercado Pago checkout without
    // being kicked out of the WebView.
    allowNavigation: [
      "talkwithfred.live",
      "*.talkwithfred.live",
      "*.lovable.app",
      "*.supabase.co",
      "*.mercadopago.com",
      "*.mercadopago.com.br",
      "*.mercadolibre.com",
      "accounts.google.com",
    ],
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0b0f19",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0b0f19",
    },
  },
};

export default config;
