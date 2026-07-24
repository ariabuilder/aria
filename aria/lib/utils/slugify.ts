export function slugify(input: string): string {
  return (
    input
      .trim()
      // Split accented characters into base + diacritic marks.
      // Example: "Café" -> "Cafe\u0301".
      .normalize("NFKD")
      // Remove combining diacritic marks.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}
