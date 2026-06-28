import * as XLSX from 'xlsx';

export type XlsxExportColumn<TRow> = {
    key: string;
    label: string;
    getValue?: (row: TRow) => string | number | boolean | null | undefined;
};

const cellValue = (value: unknown): string | number => {
    if (value == null) return '';
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) return value.map((v) => cellValue(v)).filter(Boolean).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

/** Download tabular data as an .xlsx file (client-side). */
export function downloadRowsAsXlsx<TRow>(
    rows: TRow[],
    columns: XlsxExportColumn<TRow>[],
    filename: string,
): void {
    if (!rows.length) return;

    const header = columns.map((col) => col.label);
    const body = rows.map((row) =>
        columns.map((col) => {
            const raw = col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key];
            return cellValue(raw);
        }),
    );

    const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

    const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    XLSX.writeFile(workbook, safeName);
}
