import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = {
  children: ReactNode;
  onReset?: () => void;
  onGoBack?: () => void;
};

type State = { hasError: boolean };

/**
 * Local boundary around the realtime voice UI so a render error (e.g. a Hook
 * ordering mismatch — React #300) never takes the whole app down. Shows a
 * friendly retry surface and captures diagnostics silently.
 *
 * Internal code: VOICE_SCREEN_RENDER_ERROR.
 */
export class VoiceErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Diagnostic mode: emit the full stack + component stack so Chrome DevTools
    // (with source maps enabled) can resolve the exact component causing #300.
    console.error("[VOICE_SCREEN_RENDER_ERROR]", {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack,
    });
    reportLovableError(error, {
      code: "VOICE_SCREEN_RENDER_ERROR",
      componentStack: info?.componentStack?.slice(0, 2000),
    });
  }

  private reset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-border bg-card/60 p-8 text-center">
        <h2 className="font-display text-xl font-bold">Não foi possível preparar a conversa. Tente novamente.</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={this.reset}>Tentar novamente</Button>
          {this.props.onGoBack && (
            <Button variant="outline" onClick={this.props.onGoBack}>
              Voltar ao início
            </Button>
          )}
        </div>
      </div>
    );
  }
}
