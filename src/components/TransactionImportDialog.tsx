import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp } from "lucide-react";
import type { AppDataHandle } from "../appDataType";
import {
  parseTransactionsCsv,
  previewImportAccounts,
  type ParseTransactionsCsvResult,
} from "../importTransactionsCsv";
import type { ImportTransactionsResult } from "../useAppData";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface TransactionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appData: AppDataHandle;
}

export function TransactionImportDialog({
  open,
  onOpenChange,
  appData,
}: TransactionImportDialogProps) {
  const [defaultCurrency, setDefaultCurrency] = useState("ARS");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [parseResult, setParseResult] =
    useState<ParseTransactionsCsvResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importResult, setImportResult] =
    useState<ImportTransactionsResult | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedFileName("");
      setParseResult(null);
      setFileError(null);
      setImportResult(null);
    }
  }, [open]);

  const accountPreview = useMemo(() => {
    if (parseResult == null || defaultCurrency.trim().length === 0) return null;
    return previewImportAccounts(
      parseResult.transactions,
      appData.data.accounts,
      defaultCurrency,
    );
  }, [appData.data.accounts, defaultCurrency, parseResult]);

  const canImport =
    parseResult != null &&
    parseResult.transactions.length > 0 &&
    parseResult.errors.length === 0 &&
    defaultCurrency.trim().length > 0 &&
    importResult == null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    setImportResult(null);
    setParseResult(null);
    setFileError(null);

    if (file == null) {
      setSelectedFileName("");
      return;
    }

    setSelectedFileName(file.name);
    try {
      const text = await file.text();
      setParseResult(parseTransactionsCsv(text));
    } catch {
      setFileError("Could not read the selected file.");
    }
  }

  function handleImport() {
    if (!canImport || parseResult == null) return;
    const result = appData.importTransactions(
      parseResult.transactions,
      defaultCurrency,
    );
    setImportResult(result);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Transactions</DialogTitle>
          <DialogDescription>
            CSV headers: Date, From, To, Category, Amount, From Amount, To
            Amount, Description.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV file</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              onChange={handleFileChange}
              disabled={importResult != null}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="default-currency">Default currency</Label>
            <Input
              id="default-currency"
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
              disabled={importResult != null}
            />
          </div>

          {fileError != null && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {parseResult != null && importResult == null && (
            <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Metric label="Transactions" value={parseResult.transactions.length} />
                <Metric label="New accounts" value={accountPreview?.newAccountCount ?? 0} />
                <Metric
                  label="Matched"
                  value={accountPreview?.matchedAccountCount ?? 0}
                />
                <Metric label="Skipped" value={parseResult.skippedRowCount} />
              </div>

              {selectedFileName.length > 0 && (
                <p className="truncate text-xs text-muted-foreground">
                  {selectedFileName}
                </p>
              )}

              {parseResult.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {parseResult.errors.length} issue
                    {parseResult.errors.length === 1 ? "" : "s"}
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {parseResult.errors.slice(0, 8).map((error) => (
                      <p key={`${error.rowNumber}-${error.message}`}>
                        Row {error.rowNumber}: {error.message}
                      </p>
                    ))}
                    {parseResult.errors.length > 8 && (
                      <p>{parseResult.errors.length - 8} more issue(s).</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {importResult != null && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Imported {importResult.transactionsImported} transaction
                {importResult.transactionsImported === 1 ? "" : "s"} and created{" "}
                {importResult.accountsCreated} account
                {importResult.accountsCreated === 1 ? "" : "s"}.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {importResult == null ? "Cancel" : "Done"}
          </Button>
          {importResult == null && (
            <Button type="button" onClick={handleImport} disabled={!canImport}>
              <FileUp className="mr-1 h-4 w-4" />
              Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
