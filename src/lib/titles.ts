// Comparison key for game titles: case, punctuation, accents and "&"/"and"
// don't matter. Used to rank search results and match imported titles.
export function titleKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
