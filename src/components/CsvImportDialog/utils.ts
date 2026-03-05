import type { AddEventInput } from '@/actions/events';
import { BUILDINGS, WARDS, type Building, type Ward } from '@/schema/schema';
import { DESCRIPTION_MAX_LENGTH } from '@/utils/eventConstants';
import type { CsvParseResult } from '@/components/CsvImportDialog/types';

const HEADER_MAP: Record<string, keyof AddEventInput> = {
  building: 'building',
  ward: 'ward',
  'member name': 'name',
  name: 'name',
  'event date': 'eventDate',
  date: 'eventDate',
  'start time': 'startTime',
  'end time': 'endTime',
  email: 'email',
  phone: 'phone',
  'event description': 'description',
  description: 'description',
};

export function createTemplateCsv(rows: string[][]) {
  const csvRows = rows.map((row) => row.join(',')).join('\n');
  return `${csvRows}\n`;
}

export function buildTemplateRows(tomorrowYmd: string, sampleRows: string[][]) {
  return sampleRows.map((row) => row.map((cell) => cell.replace('{tomorrow}', tomorrowYmd)));
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      current.push(field.trim());
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (field.length > 0 || current.length > 0) {
        current.push(field.trim());
        rows.push(current);
      }
      field = '';
      current = [];
      if (char === '\r' && next === '\n') i += 1;
      continue;
    }

    field += char;
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field.trim());
    rows.push(current);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const rawYear = Number(slashMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

export function normalizeTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function mapRowsToEvents(rows: string[][]): CsvParseResult {
  if (rows.length === 0) return { events: [], errors: ['CSV is empty.'] };

  const headers = rows[0].map(normalizeHeader);
  const mapping = headers.map((header) => HEADER_MAP[header]);

  if (!mapping.includes('building') || !mapping.includes('ward') || !mapping.includes('name')) {
    return { events: [], errors: ['Missing required headers. Use the template provided.'] };
  }

  const events: AddEventInput[] = [];
  const errors: string[] = [];

  rows.slice(1).forEach((row, index) => {
    const data: Partial<AddEventInput> = {};
    mapping.forEach((key, colIndex) => {
      if (!key) return;
      data[key] = row[colIndex]?.trim() as never;
    });

    if (!data.building || !data.ward || !data.name || !data.eventDate) {
      errors.push(`Row ${index + 2}: missing required fields.`);
      return;
    }

    if (!BUILDINGS.includes(data.building as Building)) {
      errors.push(`Row ${index + 2}: invalid building.`);
      return;
    }

    if (!WARDS.includes(data.ward as Ward)) {
      errors.push(`Row ${index + 2}: invalid ward.`);
      return;
    }

    const normalizedDate = normalizeDate(String(data.eventDate));
    if (!normalizedDate) {
      errors.push(`Row ${index + 2}: invalid event date format.`);
      return;
    }

    const normalizedStart = normalizeTime(String(data.startTime ?? ''));
    const normalizedEnd = normalizeTime(String(data.endTime ?? ''));
    if (!normalizedStart || !normalizedEnd) {
      errors.push(`Row ${index + 2}: start/end time must be HH:MM.`);
      return;
    }

    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) {
      errors.push(`Row ${index + 2}: email must be valid if provided.`);
      return;
    }

    const descriptionValue = String(data.description ?? '');
    const trimmedDescription = descriptionValue.trim();
    if (!trimmedDescription) {
      errors.push(`Row ${index + 2}: event description is required.`);
      return;
    }
    if (trimmedDescription.length > DESCRIPTION_MAX_LENGTH) {
      errors.push(
        `Row ${index + 2}: event description must be ${DESCRIPTION_MAX_LENGTH} characters or less.`
      );
      return;
    }

    events.push({
      building: data.building as Building,
      ward: data.ward as Ward,
      name: String(data.name),
      eventDate: normalizedDate,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      email: data.email ? String(data.email) : undefined,
      phone: data.phone ? String(data.phone) : undefined,
      description: descriptionValue,
    });
  });

  return { events, errors };
}
