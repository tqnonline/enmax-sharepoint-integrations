import { MessageBar, MessageBarBody, Text, tokens } from "@fluentui/react-components";
import { expectedPdfFileName } from "./sharepointUrls";

interface Props {
  /** From enmax_acdnpresentindropoff on the record. */
  presentInDropOff?: boolean;
  /** From enmax_acdnpresentindestination on the record. */
  presentInDestination?: boolean;
  /** Issued document number used for the deterministic PDF filename. */
  recordNumber?: string;
}

/**
 * WS5 fail-loud indicator: surfaces when the indexer has not linked a matching PDF yet.
 * PDF names follow Heather numbering: …-NNNN.pdf (Standard) or …-NNNN-SSS.pdf (child).
 */
export function SharePointLinkStatus({
  presentInDropOff,
  presentInDestination,
  recordNumber,
}: Props) {
  const linked = presentInDropOff || presentInDestination;
  if (linked) return null;

  const pdfName = recordNumber
    ? expectedPdfFileName(recordNumber)
    : "<issued-number>.pdf";

  return (
    <MessageBar intent="warning">
      <MessageBarBody>
        <Text weight="semibold" block>No linked file found yet</Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
          Upload a PDF named{" "}
          <Text weight="semibold" style={{ fontFamily: "monospace" }}>
            {pdfName}
          </Text>{" "}
          to the drop-off library. Drawing documents and Procedure forms use
          {" "}<Text weight="semibold" style={{ fontFamily: "monospace" }}>…-NNNN-SSS.pdf</Text>;
          Standard Documents use{" "}
          <Text weight="semibold" style={{ fontFamily: "monospace" }}>…-NNNN.pdf</Text>.
          Misnamed files are ignored until the indexer runs.
        </Text>
      </MessageBarBody>
    </MessageBar>
  );
}
