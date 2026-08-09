import { Badge, type BadgeProps } from "@fluentui/react-components";
import { documentTypeBadgeColor } from "./documentTypeBadgeColor";

type Props = {
  label: string | null | undefined;
  size?: BadgeProps["size"];
  appearance?: BadgeProps["appearance"];
};

/** Colored badge for Drawing / Drawing Document / Standard / Procedure / Form. */
export function DocumentTypeBadge({
  label,
  size = "small",
  appearance = "tint",
}: Props) {
  const text = label?.trim() || "—";
  return (
    <Badge
      appearance={appearance}
      color={documentTypeBadgeColor(label)}
      size={size}
      shape="rounded"
    >
      {text}
    </Badge>
  );
}
