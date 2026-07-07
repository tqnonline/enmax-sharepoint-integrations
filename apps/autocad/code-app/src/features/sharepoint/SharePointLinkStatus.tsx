import { MessageBar, MessageBarBody, Text, tokens } from "@fluentui/react-components";

interface Props {
  /** From enmax_acdnpresentindropoff on the record. */
  presentInDropOff?: boolean;
  /** From enmax_acdnpresentindestination on the record. */
  presentInDestination?: boolean;
  /** Drawing/Document Number used for the deterministic filename hint. */
  recordNumber?: string;
}

/**
 * WS5 fail-loud indicator: surfaces when the indexer has not linked a matching PDF yet.
 */
export function SharePointLinkStatus({
  presentInDropOff,
  presentInDestination,
  recordNumber,
}: Props) {
  const linked = presentInDropOff || presentInDestination;
  if (linked) return null;

  return (
    <MessageBar intent="warning">
      <MessageBarBody>
        <Text weight="semibold" block>No linked file found yet</Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
          Upload a PDF named{" "}
          <Text weight="semibold" style={{ fontFamily: "monospace" }}>
            {recordNumber ? `${recordNumber}.pdf` : "<Drawing/Document Number>.pdf"}
          </Text>{" "}
          to the drop-off library. Misnamed files are ignored until the indexer runs.
        </Text>
      </MessageBarBody>
    </MessageBar>
  );
}
