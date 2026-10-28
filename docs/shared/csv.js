import { assert, validateEvent } from "./domain.js?v=921d4f1575f1";
export function parseCSV(input) {
  assert(
    typeof input === "string" && input.length <= 10e6,
    "CSV is too large (10 MB maximum).",
  );
  const rows = [];
  let row = [],
    field = "",
    quoted = false,
    closed = false;
  input = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === '"') {
      assert(!field && !closed, "Invalid CSV quote.");
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && input[i + 1] === "\n") i++;
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else {
      assert(!closed || c === " ", "Unexpected text after a CSV quote.");
      if (!closed) field += c;
    }
  }
  assert(!quoted, "CSV has an unclosed quote.");
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^\s*[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function toCSV(rows) {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export const HEADERS = [
  "id",
  "time",
  "accountId",
  "project",
  "title",
  "model",
  "inputTokens",
  "outputTokens",
];
export function importEvents(csv) {
  const rows = parseCSV(csv);
  assert(rows.length > 1, "CSV needs a header and at least one event.");
  const headers = rows.shift();
  assert(
    HEADERS.every((h) => headers.includes(h)),
    `Required columns: ${HEADERS.join(", ")}`,
  );
  assert(rows.length <= 10000, "Import at most 10,000 rows at a time.");
  return rows.map((r, i) => {
    assert(
      r.length === headers.length,
      `Row ${i + 2}: column count does not match.`,
    );
    const x = Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    const token = (v) =>
      v.trim() === ""
        ? null
        : (assert(
            /^\d+$/.test(v),
            `Row ${i + 2}: tokens must be whole numbers or blank.`,
          ),
          Number(v));
    const event = {
      id: "import:" + x.id,
      time: new Date(x.time).toISOString(),
      accountId: x.accountId || "",
      project: x.project,
      title: x.title,
      model: x.model,
      source: "import",
      inputTokens: token(x.inputTokens),
      outputTokens: token(x.outputTokens),
      issue: !x.accountId ? "Imported record has no mapped account." : "",
    };
    validateEvent(event);
    return event;
  });
}
