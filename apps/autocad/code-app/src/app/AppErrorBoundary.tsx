import { Component, type ReactNode, type ErrorInfo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Button,
  makeStyles,
  tokens,
} from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
  },
  card: { maxWidth: "540px" },
  pre: {
    fontSize: tokens.fontSizeBase100,
    marginTop: tokens.spacingVerticalS,
    whiteSpace: "pre-wrap",
  },
  retryWrapper: { marginTop: tokens.spacingVerticalM },
});

export interface ErrorFallbackProps {
  error: Error;
  onReset: () => void;
}

export function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();

  function handleRetry() {
    queryClient.resetQueries();
    onReset();
  }

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>App configuration unavailable</MessageBarTitle>
            Could not load application configuration. Contact your admin.
            <pre className={styles.pre}>{error.message}</pre>
            <div className={styles.retryWrapper}>
              <Button appearance="primary" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          </MessageBarBody>
        </MessageBar>
      </div>
    </div>
  );
}

interface ErrorBoundaryState { error: Error | null }
interface ErrorBoundaryProps { children: ReactNode }

export class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
