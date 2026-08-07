import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorFallback } from "./ErrorFallback";
import { captureRenderError } from "./sentry";

/**
 * The last line between a thrown widget and a blank page.
 *
 * Sentry ships a boundary of its own, but using it would mean importing the SDK
 * into the main bundle — the one thing `observability/sentry` exists to avoid.
 * A boundary is a dozen lines of React, so this one is local and reports
 * through the same lazily-loaded path as everything else.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureRenderError(error, info.componentStack ?? undefined);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <ErrorFallback resetError={() => this.setState({ error: null })} />;
  }
}
