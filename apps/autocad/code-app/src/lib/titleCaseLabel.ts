/** Title Case for grid column headers (each word capitalized). */
export function titleCaseLabel(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3 && word === word.toUpperCase()) return word;
      if (word.includes("/")) {
        return word.split("/").map((part) => capitalizeWord(part)).join("/");
      }
      if (word.startsWith("#")) return word;
      return capitalizeWord(word);
    })
    .join(" ");
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
