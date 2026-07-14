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
  expect(screen.getByText(/no pdf linked yet/i)).toBeInTheDocument();
  expect(screen.getByText(/GG-CG-00-ECS-AST-DD-0001\.pdf/)).toBeInTheDocument();
  expect(screen.getByText(/must match this document number exactly/i)).toBeInTheDocument();
});

test("renders nothing when a file is linked", () => {
  renderWithProviders(
    <SharePointLinkStatus presentInDropOff={true} presentInDestination={false} />,
  );
  expect(screen.queryByText(/no pdf linked yet/i)).not.toBeInTheDocument();
});
