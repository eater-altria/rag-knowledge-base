import { Component, type ErrorInfo, type ReactNode } from 'react';

type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="card max-w-lg">
          <h1 className="mb-2 text-lg font-semibold text-danger">出错了</h1>
          <p className="mb-3 text-sm text-muted">{this.state.error.message}</p>
          <button className="btn-primary" onClick={() => location.reload()}>刷新页面</button>
        </div>
      </div>
    );
  }
}
