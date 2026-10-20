import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { BookOpen } from "lucide-react";

/* Without this, any render error leaves a blank page and the only way out is
   clearing site data. Reloading fixes the transient cases; signing out clears the
   local state for the ones that do not survive a reload. */
export class ErrorBoundary extends Component<{ children: ReactNode; onSignOut?: () => void }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Ruminate could not render this screen", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="empty">
        <BookOpen />
        <h1>Something went wrong</h1>
        <p>Ruminate could not draw this screen. Your saved verses and progress are untouched.</p>
        <button className="primary" onClick={() => window.location.reload()}>Reload Ruminate</button>
        {this.props.onSignOut && (
          <button className="offline-reading" onClick={this.props.onSignOut}>Sign out on this device</button>
        )}
      </main>
    );
  }
}
