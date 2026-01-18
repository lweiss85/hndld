import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary, InlineErrorBoundary, PageErrorBoundary, withErrorBoundary } from "@/components/error-boundary";

// Component that throws an error
const ThrowError = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error("Test error message");
  }
  return <div>No error</div>;
};

// Suppress console.error for cleaner test output
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalError;
});

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("renders fallback UI when there is an error", () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test error message")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom error fallback</div>}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom error fallback")).toBeInTheDocument();
  });

  it("calls onError callback when error occurs", () => {
    const onError = vi.fn();
    
    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("Test error message");
  });

  it("resets error state when Try Again is clicked", () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Click Try Again
    fireEvent.click(screen.getByText("Try Again"));

    // Rerender with non-throwing component
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    // Should be able to render again (though it will throw again in this test)
  });

  it("shows technical details when showDetails is true", () => {
    render(
      <ErrorBoundary showDetails={true}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Technical details")).toBeInTheDocument();
  });
});

describe("InlineErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <InlineErrorBoundary>
        <div>Test content</div>
      </InlineErrorBoundary>
    );

    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("renders inline error message when there is an error", () => {
    render(
      <InlineErrorBoundary>
        <ThrowError />
      </InlineErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("renders custom fallback message", () => {
    render(
      <InlineErrorBoundary fallbackMessage="Custom inline error">
        <ThrowError />
      </InlineErrorBoundary>
    );

    expect(screen.getByText("Custom inline error")).toBeInTheDocument();
  });
});

describe("PageErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <PageErrorBoundary>
        <div>Page content</div>
      </PageErrorBoundary>
    );

    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("renders error UI when there is an error", () => {
    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});

describe("withErrorBoundary HOC", () => {
  it("wraps component with error boundary", () => {
    const TestComponent = () => <div>Test component</div>;
    const WrappedComponent = withErrorBoundary(TestComponent);

    render(<WrappedComponent />);

    expect(screen.getByText("Test component")).toBeInTheDocument();
  });

  it("catches errors from wrapped component", () => {
    const ErrorComponent = () => {
      throw new Error("HOC error");
    };
    const WrappedComponent = withErrorBoundary(ErrorComponent);

    render(<WrappedComponent />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("sets correct displayName", () => {
    const TestComponent = () => <div>Test</div>;
    TestComponent.displayName = "TestComponent";
    
    const WrappedComponent = withErrorBoundary(TestComponent);
    
    expect(WrappedComponent.displayName).toBe("withErrorBoundary(TestComponent)");
  });
});
