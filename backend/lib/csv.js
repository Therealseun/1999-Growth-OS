// CSV for report exports. Text that starts with = + - @ is prefixed with an apostrophe so a spreadsheet
// never runs it as a formula (names and campaign titles come from users). Numbers are written as they are.

function cell(value) {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  // The byte order mark makes Excel read the file as UTF-8, so names with accents survive.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvResponse(text, filename) {
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  return new Response(text, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${safe}"`,
    },
  });
}
