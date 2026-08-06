import { Component, ErrorInfo, ReactNode } from "react";

/**
 * Catches render errors so a bug in one view shows a recoverable message
 * instead of a blank white screen.
 *
 * It deliberately does not touch storage. Saved training data is never the
 * thing that gets cleared to "fix" a UI crash.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="app">
        <div className="alert danger" role="alert">
          <strong>Something went wrong displaying this screen.</strong>
          <p>Your saved data has not been changed or deleted.</p>
          <p className="muted">{error.message}</p>
          <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>{" "}
          <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    );
  }
}
