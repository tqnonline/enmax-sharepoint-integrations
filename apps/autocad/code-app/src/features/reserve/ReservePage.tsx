import { Suspense } from "react";
import { Spinner, Title2 } from "@fluentui/react-components";
import { ReserveWizard } from "./ReserveWizard";

export function ReservePage() {
  return (
    <div>
      <Title2 as="h1" style={{ marginBottom: "1.5rem" }}>Reserve Drawing Numbers</Title2>
      <Suspense fallback={<Spinner label="Loading…" />}>
        <ReserveWizard />
      </Suspense>
    </div>
  );
}
