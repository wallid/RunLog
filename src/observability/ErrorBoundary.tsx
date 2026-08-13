import { Component, type ReactNode } from "react";
import { ErrorFallback } from "./ErrorFallback";

/**
 * The last line between a thrown widget and a blank page.
 *
 * It catches and shows a way out; it reports nothing. Crash reporting used to
 * hang off `componentDidCatch` here, and when it was removed the boundary was
 * kept, because the half a reader sees is the half that mattered: a thrown
 * widget leaves a page that says what happened and offers a way back, rather
 * than a white screen.
 *
 * A fault is now visible only to the person in front of it, which is the trade
 * that comes with sending nothing anywhere.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <ErrorFallback resetError={() => this.setState({ error: null })} />;
  }
}
