import * as XLSX from 'xlsx';

export type ContactImportRowInput = {
  email: string | null | undefined;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  company?: string | null | undefined;
};

const COLUMN_ALIASES = {
  email: ['email', 'e-mail', 'mail', '邮箱'],
  firstName: ['firstname', 'first_name', 'givenname', '名', '名字'],
  lastName: ['lastname', 'last_name', 'surname', 'familyname', '姓'],
  company: ['company', 'organization', 'org', '公司'],
} as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function toCellText(value: unknown): string {
  return String(value ?? '').trim();
}

function pickIndex(normalizedHeaders: string[], aliases: readonly string[]): number {
  const aliasSet = new Set(aliases.map((item) => normalizeHeader(item)));
  return normalizedHeaders.findIndex((item) => aliasSet.has(item));
}

function parseRows2d(rows: unknown[][]): ContactImportRowInput[] {
  if (rows.length === 0) {
    return [];
  }

  const firstRow = rows[0] ?? [];
  const normalizedHeaders = firstRow.map((cell) => normalizeHeader(cell));

  const headerIndices = {
    email: pickIndex(normalizedHeaders, COLUMN_ALIASES.email),
    firstName: pickIndex(normalizedHeaders, COLUMN_ALIASES.firstName),
    lastName: pickIndex(normalizedHeaders, COLUMN_ALIASES.lastName),
    company: pickIndex(normalizedHeaders, COLUMN_ALIASES.company),
  };

  const hasHeader = headerIndices.email !== -1;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((row) => {
      const rowArray = Array.isArray(row) ? row : [];
      const emailIndex = hasHeader ? headerIndices.email : 0;
      const firstNameIndex = hasHeader
        ? headerIndices.firstName
        : 1;
      const lastNameIndex = hasHeader
        ? headerIndices.lastName
        : 2;
      const companyIndex = hasHeader
        ? headerIndices.company
        : 3;

      const email = emailIndex === -1 ? '' : toCellText(rowArray[emailIndex]);
      const firstName = firstNameIndex === -1 ? '' : toCellText(rowArray[firstNameIndex]);
      const lastName = lastNameIndex === -1 ? '' : toCellText(rowArray[lastNameIndex]);
      const company = companyIndex === -1 ? '' : toCellText(rowArray[companyIndex]);

      return {
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        company: company || null,
      };
    })
    .filter((row) => row.email.length > 0 || row.firstName || row.lastName || row.company);
}

function parseCsvLike(text: string): ContactImportRowInput[] {
  const rows = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(',').map((cell) => cell.trim()));

  return parseRows2d(rows);
}

function parseXlsxLike(arrayBuffer: ArrayBuffer): ContactImportRowInput[] {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
  }) as unknown[][];

  return parseRows2d(rows);
}

export async function parseContactsImportFile(file: File): Promise<ContactImportRowInput[]> {
  const filename = file.name.toLowerCase();
  if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
    const bytes = await file.arrayBuffer();
    return parseXlsxLike(bytes);
  }

  const text = await file.text();
  return parseCsvLike(text);
}
