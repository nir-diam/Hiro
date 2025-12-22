import React, { Component, ErrorInfo, ReactNode } from 'react';
import FallbackUI from './FallbackUI';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Fix: Define state as a public class property to resolve "Property 'state' does not exist" error
  public state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <FallbackUI />;
    }

    // Fix: Cast this to any to access props if TS fails to infer it correctly
    return (this as any).props.children;
  }
}

export default ErrorBoundary;