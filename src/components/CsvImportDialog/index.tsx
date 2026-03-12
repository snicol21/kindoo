'use client';

import { Button } from '@/components/_ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/_ui/dialog';
import { Input } from '@/components/_ui/input';
import { Label } from '@/components/_ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/_ui/table';
import { TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS } from '@/components/CsvImportDialog/constants';
import {
  buildTemplateRows,
  createTemplateCsv,
  mapRowsToEvents,
  parseCsv,
} from '@/components/CsvImportDialog/utils';
import { useImportEvents } from '@/hooks/useEvents';
import { getTomorrowYmd } from '@/utils/dateUtils';
import { Download } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function downloadTemplate() {
  const tomorrow = getTomorrowYmd();
  const sampleRows = buildTemplateRows(tomorrow, TEMPLATE_SAMPLE_ROWS);
  const csvText = createTemplateCsv([TEMPLATE_HEADERS, ...sampleRows]);
  const blob = new Blob([csvText], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'event-import-template.csv';
  link.click();
  URL.revokeObjectURL(url);
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
      <DialogContent className="sm:max-w-155 max-h-[calc(100dvh-2rem)] overflow-hidden">
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
                            className="max-w-55 truncate align-top text-xs"
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
          <Button
            onClick={handleSubmit}
            disabled={isPending || parsed.events.length === 0}
            isLoading={isPending}
            loadingText="Importing…"
          >
            Import events
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
