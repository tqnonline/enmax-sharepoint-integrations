import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Text } from "@fluentui/react-components";
import type { ReserveForm } from "../schema";

interface Props {
  onNext: () => void;
}

export function Step1RecordType({ onNext }: Props) {
  const { setValue } = useFormContext<ReserveForm>();

  useEffect(() => {
    setValue("recordType", "Drawing");
    onNext();
  }, [setValue, onNext]);

  return (
    <Text>
      Record type: <strong>Drawing</strong> (auto-selected for Phase 1)
    </Text>
  );
}
