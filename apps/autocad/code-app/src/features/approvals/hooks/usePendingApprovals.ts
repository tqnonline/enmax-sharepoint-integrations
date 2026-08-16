import { CheckoutStatus } from "../../checkout/api/checkoutClient";
import { CHECKIN_STATUS_AWAITING, useCheckins } from "./useCheckins";

export function usePendingApprovals(enabled: boolean) {
  const query = useCheckins(enabled);
  const rows = (query.data ?? []).filter(
    (row) => row.status === CheckoutStatus.Requested || row.status === CHECKIN_STATUS_AWAITING,
  );
  const requestedCount = rows.filter((row) => row.status === CheckoutStatus.Requested).length;
  const awaitingValidationCount = rows.filter((row) => row.status === CHECKIN_STATUS_AWAITING).length;
  return {
    ...query,
    rows,
    requestedCount,
    awaitingValidationCount,
  };
}
