'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useImportEvents } from '@/hooks/useEvents';
import { BUILDINGS, WARDS, type Building, type Ward } from '@/schema/schema';
import type { AddEventInput } from '@/actions/events';

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TEMPLATE_HEADERS = [
  'Building',
  'Ward',
  'Member Name',
  'Event Date',
  'Start Time',
  'End Time',
  'Email',
  'Phone',
  'Event Description',
];

function formatYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTomorrowYmd() {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatYmd(tomorrow);
}

function createTemplateCsv() {
  const tomorrow = getTomorrowYmd();
  const wardBuildingMap: Record<Ward, Building> = {
    '1st Ward': 'Maples Building',
    '2nd Ward': 'Maples Building',
    '3rd Ward': 'Stake Center',
    '4th Ward': 'Stake Center',
    '5th Ward': 'Maples Building',
    '6th Ward': 'Stake Center',
    'Park Ridge Ward': 'Maples Building',
  };

  const sampleRows = WARDS.map((ward, index) => [
    wardBuildingMap[ward],
    ward,
    `Sample Member ${index + 1}`,
    tomorrow,
    '18:00',
    '19:30',
    `sample${index + 1}@example.com`,
    '555-123-4567',
    `Sample event for ${wardBuildingMap[ward]} ${ward}.`,
  ]);

  const csvRows = [TEMPLATE_HEADERS, ...sampleRows].map((row) => row.join(',')).join('\n');

  return `${csvRows}\n`;
}

function downloadTemplate() {
  const blob = new Blob([createTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'event-import-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string) {
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

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function normalizeDate(value: string) {
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

function normalizeTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

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

function mapRowsToEvents(rows: string[][]) {
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

    if (!data.email) {
      errors.push(`Row ${index + 2}: email is required.`);
      return;
    }

    if (!data.description) {
      errors.push(`Row ${index + 2}: event description is required.`);
      return;
    }

    events.push({
      building: data.building as Building,
      ward: data.ward as Ward,
      name: String(data.name),
      eventDate: normalizedDate,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      email: String(data.email ?? ''),
      phone: data.phone ? String(data.phone) : undefined,
      description: String(data.description ?? ''),
    });
  });

  return { events, errors };
}

export function CsvImportDialog({ open, onOpenChange }: CsvImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const { mutateAsync: importEvents, isPending } = useImportEvents();

  const csvRows = useMemo(() => parseCsv(csvText), [csvText]);
  const parsed = useMemo(() => mapRowsToEvents(csvRows), [csvRows]);
  const allErrors = [...parseErrors, ...parsed.errors];

  const previewHeaders = csvRows[0] ?? [];
  const previewRows = csvRows.slice(1, 7);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const resetForm = () => {
    setFileName(null);
    setCsvText('');
    setParseErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
    setParseErrors([]);
  };

  const handleSubmit = async () => {
    if (parsed.events.length === 0) {
      toast.error('No valid rows found to import.');
      return;
    }

    try {
      const result = await importEvents(parsed.events);
      if (result.rowErrors?.length) {
        toast.error(`Imported ${result.inserted} rows, ${result.failed} failed.`);
      } else {
        toast.success(`Imported ${result.inserted} events.`);
      }
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import events.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import events from CSV</DialogTitle>
          <DialogDescription>
            Download the template, fill it out, and upload the CSV to import events in bulk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <Button variant="outline" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" />
              Download template
            </Button>
            <div className="text-sm text-muted-foreground">
              Columns: {TEMPLATE_HEADERS.join(', ')}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV file</Label>
            <Input
              ref={fileInputRef}
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
            <div className="flex items-center gap-2">
              <Input
                value={fileName ?? ''}
                readOnly
                placeholder="No file selected"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={handleBrowseClick}>
                Browse CSV
              </Button>
            </div>
            {fileName && <p className="text-xs text-muted-foreground">Selected: {fileName}</p>}
          </div>

          {csvText && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="rounded-md border max-h-72 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {previewHeaders.map((header, index) => (
                        <TableHead key={`${header}-${index}`} className="text-xs">
                          {header || `Column ${index + 1}`}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, rowIndex) => (
                      <TableRow key={`preview-row-${rowIndex}`}>
                        {previewHeaders.map((_, colIndex) => (
                          <TableCell
                            key={`preview-cell-${rowIndex}-${colIndex}`}
                            className="max-w-[220px] truncate align-top text-xs"
                            title={row[colIndex] || '—'}
                          >
                            {row[colIndex] || '—'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {Math.min(previewRows.length, 6)} of {Math.max(csvRows.length - 1, 0)} rows.
                Parsed valid rows: {parsed.events.length}.
              </p>
            </div>
          )}

          {allErrors.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive space-y-1">
              {allErrors.slice(0, 5).map((error) => (
                <div key={error}>{error}</div>
              ))}
              {allErrors.length > 5 && <div>+{allErrors.length - 5} more errors</div>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || parsed.events.length === 0}>
            {isPending ? 'Importing…' : 'Import events'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
