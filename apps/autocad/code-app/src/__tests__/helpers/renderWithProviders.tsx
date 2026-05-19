import { type ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { enmaxLightTheme } from "../../theme/brand";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
    },
  });
}

interface RenderOptions {
  initialPath?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactNode,
  { initialPath = "/", queryClient = createTestQueryClient() }: RenderOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FluentProvider theme={enmaxLightTheme}>
          <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
        </FluentProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}
