'use client';

import { useMemo, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Download, FileText } from 'lucide-react';
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
  const sample = [
    'Stake Center',
    '1st Ward',
    'Jane Doe',
    tomorrow,
    '18:00',
    '19:30',
    'jane@example.com',
    '555-123-4567',
    'Relief Society activity in the cultural hall.',
  ];

  return `${TEMPLATE_HEADERS.join(',')}\n${sample.join(',')}\n`;
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const { mutateAsync: importEvents, isPending } = useImportEvents();

  const parsed = useMemo(() => mapRowsToEvents(parseCsv(csvText)), [csvText]);
  const allErrors = [...parseErrors, ...parsed.errors];

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
      onOpenChange(false);
      setCsvText('');
      setFileName(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import events.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Import events from CSV</DialogTitle>
          <DialogDescription>
            Download the template, fill it out, and upload the CSV to import events in bulk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" />
              Download template
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              Columns: {TEMPLATE_HEADERS.join(', ')}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV file</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
            {fileName && <p className="text-xs text-muted-foreground">Selected: {fileName}</p>}
          </div>

          {csvText && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <Textarea readOnly rows={6} value={csvText.slice(0, 800)} className="text-xs" />
              <p className="text-xs text-muted-foreground">Parsed rows: {parsed.events.length}</p>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
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
