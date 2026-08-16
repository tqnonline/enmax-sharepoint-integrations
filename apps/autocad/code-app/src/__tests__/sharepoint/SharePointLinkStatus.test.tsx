import { render } from "@testing-library/react";
import { SharePointLinkStatus } from "../../features/sharepoint/SharePointLinkStatus";

test("SharePointLinkStatus never renders the No PDF linked warning", () => {
  const { container } = render(
    <SharePointLinkStatus
      presentInDropOff={false}
      presentInDestination={false}
      recordNumber="GG-CG-00-ECS-AST-DD-0001"
    />,
  );
  expect(container).toBeEmptyDOMElement();
});
