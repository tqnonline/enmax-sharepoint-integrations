/**
 * Parses the enmax_acdnissuednumbers JSON array and returns a zero-padded range
 * string like "0001–0005", or "????" when numbers haven't been issued yet.
 */
export function formatNumberRange(issuedNumbers: string | undefined | null): string {
  if (!issuedNumbers) return "????";
  try {
    const nums: number[] = JSON.parse(issuedNumbers);
    if (!Array.isArray(nums) || nums.length === 0) return "????";
    const pad   = (n: number) => String(n).padStart(4, "0");
    const first = nums[0];
    const last  = nums[nums.length - 1];
    return first === last ? pad(first) : `${pad(first)}–${pad(last)}`;
  } catch {
    return "????";
  }
}

interface CompositionParts {
  businessCode?: string;
  assetCode?:    string;
  unitCode?:     string;
  domainCode?:   string;
  systemCode?:   string;
  kindCode?:     string;
  enmax_acdnissuednumbers?: string | null;
}

export function formatComposition(parts: CompositionParts): string {
  const { businessCode, assetCode, unitCode, domainCode, systemCode, kindCode, enmax_acdnissuednumbers } = parts;
  const numberPart = formatNumberRange(enmax_acdnissuednumbers);
  return `${businessCode ?? "?"}-${assetCode ?? "?"}-${unitCode ?? "?"}-${domainCode ?? "?"}-${systemCode ?? "?"}-${kindCode ?? "?"}-${numberPart}`;
}
