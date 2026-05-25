import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import type { RefRow, RefRowMutation } from "./useRefTableData";

const schema = z.object({
  code:        z.string().min(1, "Code required"),
  displayName: z.string().min(1, "Display name required"),
  description: z.string(),
  sortOrder:   z.number().int().min(1, "Sort order must be greater than 0"),
});

type FormValues = z.infer<typeof schema>;

const useStyles = makeStyles({
  form: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalM },
  actions: { display: "flex", gap: tokens.spacingHorizontalS, justifyContent: "flex-end", marginTop: tokens.spacingVerticalM },
});

interface RefRowPanelProps {
  open: boolean;
  editing: RefRow | null;
  nextSortOrder?: number;
  onClose: () => void;
  onSave: (row: RefRowMutation) => void;
  isSaving: boolean;
}

export function RefRowPanel({ open, editing, nextSortOrder, onClose, onSave, isSaving }: RefRowPanelProps) {
  const styles = useStyles();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "", displayName: "", description: "", sortOrder: nextSortOrder ?? 10 },
  });

  useEffect(() => {
    if (editing) {
      reset({ code: editing.code, displayName: editing.displayName, description: editing.description, sortOrder: editing.sortOrder });
    } else {
      reset({ code: "", displayName: "", description: "", sortOrder: nextSortOrder ?? 10 });
    }
  }, [editing, nextSortOrder, reset]);

  function onSubmit(values: FormValues) {
    onSave({ id: editing?.id, ...values });
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(_, d) => !d.open && onClose()}
      position="end"
      aria-label={editing ? "Edit row" : "Add row"}
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={<Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label="Close" />}
        >
          {editing ? "Edit Row" : "Add Row"}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <form onSubmit={e => { void handleSubmit(onSubmit)(e); }} className={styles.form}>
          <Field label="Code" required validationMessage={errors.code?.message}>
            <Input {...register("code")} disabled={!!editing} aria-required="true" />
          </Field>
          <Field label="Display Name" required validationMessage={errors.displayName?.message}>
            <Input {...register("displayName")} aria-required="true" />
          </Field>
          <Field label="Description" validationMessage={errors.description?.message}>
            <Textarea {...register("description")} rows={3} />
          </Field>
          <Field label="Sort Order" validationMessage={errors.sortOrder?.message}>
            <Input {...register("sortOrder", { valueAsNumber: true })} type="number" min={1} />
          </Field>
          <div className={styles.actions}>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            <Button appearance="primary" type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DrawerBody>
    </Drawer>
  );
}
