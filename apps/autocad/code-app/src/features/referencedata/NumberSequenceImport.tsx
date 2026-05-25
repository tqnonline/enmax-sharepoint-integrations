import { useRef, useState } from "react";
import Papa from "papaparse";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowUploadRegular } from "@fluentui/react-icons";
import { Enmax_autocadnumbersequencesService } from "../../generated";

const MAX_CSV_BYTES = 1 * 1024 * 1024;

interface CsvRow {
  SequenceKey: string;
  SeedValue: string;
  Reason: string;
}

interface ValidatedRow extends CsvRow {
  sequenceId: string | null;
  lastIssued: number;
  valid: boolean;
  error: string;
}

const useStyles = makeStyles({
  dropZone: {
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalXL,
    textAlign: "center",
    cursor: "pointer",
  },
  table: { width: "100%", borderCollapse: "collapse", marginTop: tokens.spacingVerticalM },
  th: { textAlign: "left", padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, borderBottom: `2px solid ${tokens.colorNeutralStroke1}` },
  td: { padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
});

export function NumberSequenceImportButton() {
  const styles = useStyles();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [importResult, setImportResult] = useState<{ key: string; success: boolean; error?: string }[]>([]);

  // Fetch all sequences for validation
  const { data: sequences } = useQuery({
    queryKey: ["number-sequences-for-import"],
    enabled: open,
    queryFn: async () => {
      const r = await Enmax_autocadnumbersequencesService.getAll({
        select: ["enmax_autocadnumbersequenceid", "enmax_acdnsequencekey", "enmax_acdnlastissued"],
      });
      return r.data ?? [];
    },
  });

  const importMutation = useMutation({
    mutationFn: async (validRows: ValidatedRow[]) => {
      const results: { key: string; success: boolean; error?: string }[] = [];
      for (const row of validRows) {
        try {
          if (!row.sequenceId) throw new Error("Sequence not found");
          await Enmax_autocadnumbersequencesService.update(
            row.sequenceId,
            {
              enmax_acdnseedvalue:  Number(row.SeedValue),
              enmax_acdnseedreason: row.Reason,
              enmax_acdnseededon:   new Date().toISOString(),
            } as Parameters<typeof Enmax_autocadnumbersequencesService.update>[1],
          );
          results.push({ key: row.SequenceKey, success: true });
        } catch (err) {
          results.push({ key: row.SequenceKey, success: false, error: String(err) });
        }
      }
      return results;
    },
    onSuccess: result => setImportResult(result),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > MAX_CSV_BYTES) {
      setRows([{ SequenceKey: "", SeedValue: "", Reason: "", sequenceId: null, lastIssued: 0, valid: false, error: "File too large (max 1 MB)" }]);
      return;
    }
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: result => validateRows(result.data),
    });
  }

  function validateRows(parsed: CsvRow[]) {
    if (!sequences) return;
    const seqMap = new Map(sequences.map(s => [s.enmax_acdnsequencekey ?? "", s]));

    const validated: ValidatedRow[] = parsed.map(row => {
      if (!row.SequenceKey || !row.SeedValue) {
        return { ...row, sequenceId: null, lastIssued: 0, valid: false, error: "Missing required fields" };
      }
      const seq = seqMap.get(row.SequenceKey);
      if (!seq) {
        return { ...row, sequenceId: null, lastIssued: 0, valid: false, error: "Sequence key not found" };
      }
      const seedVal  = Number(row.SeedValue);
      const lastIssued = seq.enmax_acdnlastissued ?? 0;
      if (isNaN(seedVal) || seedVal <= lastIssued) {
        return { ...row, sequenceId: seq.enmax_autocadnumbersequenceid, lastIssued, valid: false, error: `SeedValue (${seedVal}) must be > LastIssued (${lastIssued})` };
      }
      if (lastIssued > 0 && !row.Reason?.trim()) {
        return { ...row, sequenceId: seq.enmax_autocadnumbersequenceid, lastIssued, valid: false, error: "Reason required when sequence has issued rows" };
      }
      return { ...row, sequenceId: seq.enmax_autocadnumbersequenceid, lastIssued, valid: true, error: "" };
    });
    setRows(validated);
    setImportResult([]);
  }

  const allValid      = rows.length > 0 && rows.every(r => r.valid);
  const validRows     = rows.filter(r => r.valid);

  return (
    <>
      <Button icon={<ArrowUploadRegular />} onClick={() => setOpen(true)}>Bulk Import (CSV)</Button>

      <Dialog open={open} onOpenChange={(_, d) => { setOpen(d.open); setRows([]); setImportResult([]); }}>
        <DialogSurface style={{ minWidth: "700px" }}>
          <DialogBody>
            <DialogTitle>Bulk Import Number Sequences</DialogTitle>
            <DialogContent>
              <Text size={200} block style={{ marginBottom: tokens.spacingVerticalS }}>
                CSV format: <code>SequenceKey,SeedValue,Reason</code>
              </Text>

              {!sequences && open && <Spinner size="tiny" label="Loading sequences…" style={{ marginBottom: tokens.spacingVerticalS }} />}
              <div
                className={styles.dropZone}
                onClick={() => sequences && fileRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload CSV file"
                aria-disabled={!sequences}
              >
                <Text>{sequences ? "Click to upload CSV file" : "Loading sequence data…"}</Text>
                <input ref={fileRef} type="file" accept=".csv" hidden onChange={handleFileChange} disabled={!sequences} />
              </div>

              {rows.length > 0 && importResult.length === 0 && (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Sequence Key</th>
                      <th className={styles.th}>Seed Value</th>
                      <th className={styles.th}>Last Issued</th>
                      <th className={styles.th}>Reason</th>
                      <th className={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className={styles.td}>{r.SequenceKey}</td>
                        <td className={styles.td}>{r.SeedValue}</td>
                        <td className={styles.td}>{r.lastIssued}</td>
                        <td className={styles.td}>{r.Reason}</td>
                        <td className={styles.td}>
                          {r.valid
                            ? <Badge appearance="tint" color="success">Valid</Badge>
                            : <Badge appearance="tint" color="danger" title={r.error}>Invalid: {r.error}</Badge>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {importResult.length > 0 && (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Sequence Key</th>
                      <th className={styles.th}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.map((r, i) => (
                      <tr key={i}>
                        <td className={styles.td}>{r.key}</td>
                        <td className={styles.td}>
                          {r.success
                            ? <Badge appearance="tint" color="success">Imported</Badge>
                            : <Badge appearance="tint" color="danger">Failed: {r.error}</Badge>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Close</Button>
              </DialogTrigger>
              {importResult.length === 0 && (
                <Button
                  appearance="primary"
                  disabled={!allValid || importMutation.isPending}
                  onClick={() => void importMutation.mutateAsync(validRows)}
                >
                  {importMutation.isPending ? "Importing…" : `Import (${validRows.length} rows)`}
                </Button>
              )}
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
