import { Fragment, useState } from "react";
import {
  Badge,
  Button,
  Radio,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowSquareUpRightRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  Document16Regular,
} from "@fluentui/react-icons";
import { useDrawingSheets } from "../../approvals/hooks/useDrawingSheets";
import type { ExistingBase } from "../hooks/useSearchExistingBases";
import { documentDisplayNumber } from "../terminology";

const useStyles = makeStyles({
  wrap: {
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  scroll: { maxHeight: "360px", overflowY: "auto" },
  table: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: tokens.colorNeutralBackground3,
    textAlign: "left",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    whiteSpace: "nowrap",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  baseRow: {
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  baseRowSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Selected },
  },
  td: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: tokens.fontSizeBase200,
  },
  colChevron: { width: "32px" },
  colSelect: { width: "40px" },
  number: { fontFamily: "monospace", fontWeight: tokens.fontWeightSemibold },
  childCell: {
    padding: 0,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground2,
  },
  childList: {
    display: "flex",
    flexDirection: "column",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXXL}`,
    gap: tokens.spacingVerticalXXS,
  },
  childRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXXS} 0`,
  },
  childNumber: { minWidth: "130px", flexShrink: 0, fontFamily: "monospace" },
  childName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground2,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  iconBtn: { minWidth: "auto" },
});

interface Props {
  bases: ExistingBase[];
  selectedId: string | null;
  onSelect: (base: ExistingBase) => void;
  createsChildren: boolean;
  childNoun: string;
}

export function ExistingBaseGrid({ bases, selectedId, onSelect, createsChildren, childNoun }: Props) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Base row spans: chevron + select + number + 6 taxonomy + count = 10 (9 without chevron).
  const colSpan = createsChildren ? 10 : 9;

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {createsChildren && <th className={mergeClasses(styles.th, styles.colChevron)} aria-label="Expand" />}
              <th className={mergeClasses(styles.th, styles.colSelect)} aria-label="Select" />
              <th className={styles.th}>Number</th>
              <th className={styles.th}>Business</th>
              <th className={styles.th}>Asset</th>
              <th className={styles.th}>Unit</th>
              <th className={styles.th}>Domain</th>
              <th className={styles.th}>System</th>
              <th className={styles.th}>Kind</th>
              {createsChildren && <th className={styles.th}>{childNoun}s</th>}
            </tr>
          </thead>
          <tbody>
            {bases.map((base) => {
              const isSelected = selectedId === base.id;
              const isExpanded = expanded.has(base.id);
              return (
                <Fragment key={base.id}>
                  <tr
                    className={mergeClasses(styles.baseRow, isSelected && styles.baseRowSelected)}
                    onClick={() => onSelect(base)}
                    aria-selected={isSelected}
                  >
                    {createsChildren && (
                      <td className={mergeClasses(styles.td, styles.colChevron)} onClick={(e) => e.stopPropagation()}>
                        <Button
                          className={styles.iconBtn}
                          appearance="subtle"
                          size="small"
                          icon={isExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
                          onClick={() => toggle(base.id)}
                          aria-label={isExpanded ? `Collapse ${base.number}` : `Expand ${base.number}`}
                          aria-expanded={isExpanded}
                        />
                      </td>
                    )}
                    <td className={mergeClasses(styles.td, styles.colSelect)} onClick={(e) => e.stopPropagation()}>
                      <Radio
                        checked={isSelected}
                        onChange={() => onSelect(base)}
                        aria-label={`Select ${base.number}`}
                      />
                    </td>
                    <td className={styles.td}>
                      <Tooltip content={base.title || base.number} relationship="label">
                        <span className={styles.number}>{base.number}</span>
                      </Tooltip>
                    </td>
                    <td className={styles.td}>{base.businessDisplay || "—"}</td>
                    <td className={styles.td}>{base.assetDisplay || "—"}</td>
                    <td className={styles.td}>{base.unitDisplay || "—"}</td>
                    <td className={styles.td}>{base.domainDisplay || "—"}</td>
                    <td className={styles.td}>{base.systemDisplay || "—"}</td>
                    <td className={styles.td}>{base.kindDisplay || "—"}</td>
                    {createsChildren && (
                      <td className={styles.td}>
                        <Badge appearance="tint" color="informative">
                          {base.childCount}
                        </Badge>
                      </td>
                    )}
                  </tr>
                  {createsChildren && isExpanded && (
                    <tr>
                      <td className={styles.childCell} colSpan={colSpan}>
                        <BaseChildList
                          drawingId={base.id}
                          childNoun={childNoun}
                          baseNumber={base.number}
                          reservationType={base.reservationType}
                          documentSubtype={base.documentSubtype}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BaseChildList({
  drawingId,
  childNoun,
  baseNumber,
  reservationType,
  documentSubtype,
}: {
  drawingId: string;
  childNoun: string;
  baseNumber?: string;
  reservationType?: number;
  documentSubtype?: number;
}) {
  const styles = useStyles();
  const { data: sheets, isPending } = useDrawingSheets(drawingId, true);

  if (isPending) {
    return (
      <div className={styles.childList}>
        <Spinner size="tiny" label={`Loading ${childNoun.toLowerCase()}s…`} />
      </div>
    );
  }
  if (!sheets || sheets.length === 0) {
    return (
      <div className={styles.childList}>
        <Text size={200} className={styles.muted}>No {childNoun.toLowerCase()}s yet.</Text>
      </div>
    );
  }
  return (
    <div className={styles.childList}>
      {sheets.map((sheet) => (
        <div key={sheet.id} className={styles.childRow}>
          <Document16Regular className={styles.muted} style={{ flexShrink: 0 }} />
          <Text size={200} className={styles.childNumber}>
            {documentDisplayNumber(baseNumber, sheet.sheetNumber, reservationType, documentSubtype)}
          </Text>
          <Text size={200} className={styles.childName}>{sheet.filename ?? "—"}</Text>
          {sheet.sharepointUrl ? (
            <Tooltip content="Open in SharePoint" relationship="label">
              <Button
                as="a"
                href={sheet.sharepointUrl}
                target="_blank"
                rel="noopener noreferrer"
                appearance="subtle"
                icon={<ArrowSquareUpRightRegular />}
                size="small"
                aria-label="Open in SharePoint"
              />
            </Tooltip>
          ) : (
            <Button
              appearance="subtle"
              icon={<ArrowSquareUpRightRegular />}
              size="small"
              disabled
              aria-label="SharePoint URL not yet available"
            />
          )}
        </div>
      ))}
    </div>
  );
}
