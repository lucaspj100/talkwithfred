export function translateAuthError(message: string | undefined | null): string {
  if (!message) return "Ocorreu um erro. Tente novamente.";
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Seu e-mail ainda não foi confirmado.";
  if (m.includes("user already registered") || m.includes("already registered") || m.includes("user_already_exists")) return "Já existe uma conta cadastrada com este e-mail.";
  if (m.includes("rate limit") || m.includes("over_email_send_rate_limit") || m.includes("too many requests")) return "Muitas tentativas foram feitas. Aguarde alguns minutos e tente novamente.";
  if (m.includes("password should be at least")) return "A senha deve ter no mínimo 8 caracteres.";
  if (m.includes("weak_password") || m.includes("pwned")) return "Esta senha é muito fraca ou já vazou em outros sites. Escolha outra.";
  if (m.includes("invalid email")) return "E-mail inválido.";
  if (m.includes("token has expired") || m.includes("otp_expired") || m.includes("expired")) return "Este link expirou ou não é mais válido.";
  if (m.includes("email link is invalid") || m.includes("invalid") ) return "Link inválido ou já utilizado.";
  return message;
}

const WEBMAIL: Record<string, string> = {
  "gmail.com": "https://mail.google.com",
  "googlemail.com": "https://mail.google.com",
  "outlook.com": "https://outlook.live.com/mail/",
  "hotmail.com": "https://outlook.live.com/mail/",
  "live.com": "https://outlook.live.com/mail/",
  "msn.com": "https://outlook.live.com/mail/",
  "yahoo.com": "https://mail.yahoo.com",
  "yahoo.com.br": "https://mail.yahoo.com",
  "icloud.com": "https://www.icloud.com/mail",
  "me.com": "https://www.icloud.com/mail",
  "proton.me": "https://mail.proton.me",
  "protonmail.com": "https://mail.proton.me",
};

export function webmailUrlFor(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return WEBMAIL[domain] ?? null;
}
