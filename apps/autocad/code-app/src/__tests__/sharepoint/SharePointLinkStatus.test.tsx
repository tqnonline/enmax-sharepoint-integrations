import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { SharePointLinkStatus } from "../../features/sharepoint/SharePointLinkStatus";

test("shows warning when no SharePoint file is linked", () => {
  renderWithProviders(
    <SharePointLinkStatus
      presentInDropOff={false}
      presentInDestination={false}
      recordNumber="GG-CG-00-ECS-AST-DD-0001"
    />,
  );
  expect(screen.getByText(/no linked file found yet/i)).toBeInTheDocument();
  expect(screen.getByText(/GG-CG-00-ECS-AST-DD-0001\.pdf/)).toBeInTheDocument();
  expect(screen.getByText(/…-NNNN-SSS\.pdf/)).toBeInTheDocument();
  expect(screen.getByText(/…-NNNN\.pdf/)).toBeInTheDocument();
});

test("renders nothing when a file is linked", () => {
  renderWithProviders(
    <SharePointLinkStatus presentInDropOff={true} presentInDestination={false} />,
  );
  expect(screen.queryByText(/no linked file found yet/i)).not.toBeInTheDocument();
});
