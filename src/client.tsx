import { StrictMode, startTransition } from "react";
import { hydrateRoot, type ErrorInfo } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

function logReactRootError(
  label: "REACT_RECOVERABLE_ERROR" | "REACT_CAUGHT_ERROR" | "REACT_UNCAUGHT_ERROR",
  error: unknown,
  errorInfo?: ErrorInfo,
) {
  const err = error instanceof Error ? error : null;
  console.error(`[${label}]`, {
    name: err?.name,
    message: err?.message ?? String(error),
    stack: err?.stack,
    cause: err?.cause,
    componentStack: errorInfo?.componentStack,
  });
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    {
      onRecoverableError: (error, errorInfo) => {
        logReactRootError("REACT_RECOVERABLE_ERROR", error, errorInfo);
      },
      onCaughtError: (error, errorInfo) => {
        logReactRootError("REACT_CAUGHT_ERROR", error, errorInfo);
      },
      onUncaughtError: (error, errorInfo) => {
        logReactRootError("REACT_UNCAUGHT_ERROR", error, errorInfo);
      },
    },
  );
});