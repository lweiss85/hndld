import React, { Component, ErrorInfo, ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string | null;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the child
 * component tree and displays a fallback UI instead of crashing the whole app.
 * 
 * Usage:
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * 
 * With custom fallback:
 * <ErrorBoundary fallback={<CustomError />}>
 *   <MyComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console in development
    console.error("Error Boundary caught an error:", error, errorInfo);

    // Report to Sentry in production
    if (import.meta.env.PROD) {
      const eventId = Sentry.captureException(error, {
        extra: {
          componentStack: errorInfo.componentStack,
        },
      });
      this.setState({ eventId });
    }

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    this.setState({ errorInfo });
  }

  componentDidUpdate(prevProps: Props): void {
    // Reset error state when resetKeys change
    if (this.state.hasError && this.props.resetKeys) {
      const hasChanged = this.props.resetKeys.some(
        (key, index) => key !== prevProps.resetKeys?.[index]
      );
      if (hasChanged) {
        this.resetError();
      }
    }
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          eventId={this.state.eventId}
          onReset={this.resetError}
          showDetails={this.props.showDetails}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string | null;
  onReset: () => void;
  showDetails?: boolean;
}

/**
 * Default fallback UI for error boundaries.
 * Maintains the luxury "white glove" aesthetic while being helpful.
 */
function ErrorFallback({
  error,
  errorInfo,
  eventId,
  onReset,
  showDetails = false,
}: ErrorFallbackProps) {
  const [showStack, setShowStack] = React.useState(false);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.href = "/";
  };

  const handleReportFeedback = () => {
    if (eventId) {
      Sentry.showReportDialog({ eventId });
    }
  };

  return (
    <div className="min-h-[400px] flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full shadow-luxury-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">Something went wrong</CardTitle>
          <CardDescription className="text-muted-foreground">
            We apologize for the inconvenience. Our team has been notified.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm font-medium text-foreground">
                {error.message || "An unexpected error occurred"}
              </p>
            </div>
          )}

          {showDetails && error && (
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowStack(!showStack)}
                className="text-xs text-muted-foreground"
              >
                <Bug className="w-3 h-3 mr-1" />
                {showStack ? "Hide" : "Show"} technical details
              </Button>

              {showStack && errorInfo && (
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-48 text-muted-foreground">
                  {errorInfo.componentStack}
                </pre>
              )}
            </div>
          )}

          {eventId && (
            <p className="text-xs text-muted-foreground text-center">
              Error ID: {eventId}
            </p>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <Button onClick={onReset} variant="outline" className="flex-1">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={handleGoHome} variant="default" className="flex-1">
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>

          {eventId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReportFeedback}
              className="text-xs"
            >
              Report this issue
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * Lightweight error boundary for smaller components.
 * Shows a minimal error message without the full card UI.
 */
export class InlineErrorBoundary extends Component<
  { children: ReactNode; fallbackMessage?: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallbackMessage?: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("InlineErrorBoundary caught an error:", error, errorInfo);
    if (import.meta.env.PROD) {
      Sentry.captureException(error, {
        extra: { componentStack: errorInfo.componentStack },
      });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{this.props.fallbackMessage || "Something went wrong"}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => this.setState({ hasError: false })}
            className="ml-auto h-7 px-2"
          >
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * HOC to wrap any component with an error boundary.
 * 
 * Usage:
 * const SafeComponent = withErrorBoundary(MyComponent);
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, "children">
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || "Component";

  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

/**
 * Page-level error boundary with navigation options.
 * Use this at the route level for full-page error handling.
 */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      showDetails={import.meta.env.DEV}
      onError={(error, errorInfo) => {
        // Log additional context for page-level errors
        console.error("Page Error:", {
          url: window.location.href,
          timestamp: new Date().toISOString(),
          error: error.message,
          stack: errorInfo.componentStack,
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Async error boundary for handling promise rejections in components.
 * Wraps children and catches unhandled promise rejections.
 */
export function AsyncErrorBoundary({ children }: { children: ReactNode }) {
  React.useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      if (import.meta.env.PROD) {
        Sentry.captureException(event.reason);
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export default ErrorBoundary;
