'use client';

import { approveAccessRequest, denyAccessRequest } from '@/actions/access-requests';
import { Badge } from '@/components/_ui/badge';
import { Button } from '@/components/_ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/_ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/_ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/_ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/_ui/table';
import { Textarea } from '@/components/_ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/_ui/tooltip';
import type { AccessRequestListItem } from '@/components/AdminUsersClient/types';
import { ROLE_LABELS, canAssignRole } from '@/lib/permissions';
import type { UserRole } from '@/schema/schema';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Mail,
  MoreVertical,
  Phone,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

type AccessRequestsTableProps = {
  requests: AccessRequestListItem[];
  currentUserRole: UserRole;
};

const STATUS_LABEL: Record<AccessRequestListItem['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
};

export function AccessRequestsTable({ requests, currentUserRole }: AccessRequestsTableProps) {
  const router = useRouter();
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [selectedRoleByRequestId, setSelectedRoleByRequestId] = useState<Record<string, UserRole>>(
    {}
  );
  const [approveTarget, setApproveTarget] = useState<AccessRequestListItem | null>(null);
  const [denyTarget, setDenyTarget] = useState<AccessRequestListItem | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [showClosedRequests, setShowClosedRequests] = useState(false);

  const allowedRoles = useMemo(
    () =>
      (['ward_user', 'ward_manager', 'stake_manager', 'admin'] as UserRole[]).filter((role) =>
        canAssignRole(currentUserRole, role)
      ),
    [currentUserRole]
  );

  const leastPrivilegedAssignableRole = allowedRoles[0] ?? 'ward_user';

  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No access requests found.</p>;
  }

  const approveRole = approveTarget
    ? (selectedRoleByRequestId[approveTarget.id] ?? leastPrivilegedAssignableRole)
    : 'ward_user';

  const pendingRequests = requests.filter((request) => request.status === 'pending');
  const closedRequests = requests.filter((request) => request.status !== 'pending');

  const renderRequestRow = (request: AccessRequestListItem) => {
    const selectedRole = selectedRoleByRequestId[request.id] ?? leastPrivilegedAssignableRole;
    const isPending = request.status === 'pending';
    const isBusy = pendingRequestId === request.id;

    return (
      <TableRow key={request.id}>
        <TableCell className="align-top">
          <div className="space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2 whitespace-normal md:flex-nowrap md:whitespace-nowrap">
              <span className="min-w-0 truncate text-sm font-semibold">{request.name}</span>
              {request.status === 'pending' ? (
                <span className="inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center rounded-full border border-amber-600 bg-amber-500 px-1.5 text-[10px] font-semibold leading-none text-white dark:border-amber-500 dark:bg-amber-500 dark:text-white">
                  Pending
                </span>
              ) : request.status === 'denied' ? (
                <span className="inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center rounded-full border border-red-300 bg-red-50 px-1.5 text-[10px] font-semibold leading-none text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  Denied
                </span>
              ) : (
                <Badge variant="secondary">{STATUS_LABEL[request.status]}</Badge>
              )}
              <span className="hidden text-xs text-muted-foreground md:inline">
                • {request.ward}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <div className="flex min-w-0 items-center gap-1.5">
                <a
                  href={`mailto:${request.email}`}
                  className="max-w-44 truncate text-muted-foreground hover:underline"
                  title={request.email}
                >
                  {request.email}
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 p-0"
                  aria-label={`Copy email for ${request.email}`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(request.email ?? '');
                      toast.success('Email copied.');
                    } catch {
                      toast.error('Failed to copy.');
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <div className="flex min-w-0 items-center gap-1.5">
                <a
                  href={`tel:${request.phone.replace(/\D/g, '')}`}
                  className="max-w-44 truncate hover:text-foreground hover:underline"
                  title={request.phone}
                >
                  {request.phone}
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 p-0"
                  aria-label={`Copy phone for ${request.email}`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(request.phone ?? '');
                      toast.success('Phone copied.');
                    } catch {
                      toast.error('Failed to copy.');
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {(request.comments || (request.status === 'denied' && request.reviewNote)) && (
              <div className="max-w-full sm:max-w-[85%] md:max-w-[72%] lg:max-w-[64%] space-y-2">
                {request.comments && (
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary/60" />
                    <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-primary/20 bg-primary/5 px-3 py-2 text-xs whitespace-pre-wrap shadow-sm">
                      <div className="text-foreground/90">{request.comments}</div>
                    </div>
                  </div>
                )}

                {request.status === 'denied' && request.reviewNote && (
                  <div className="flex min-w-0 items-start justify-end gap-2 sm:ml-auto">
                    <div className="min-w-0 rounded-2xl rounded-tr-sm border border-red-300 bg-red-50 px-3 py-2 text-xs whitespace-pre-wrap shadow-sm dark:border-red-900/60 dark:bg-red-950/40">
                      <div className="space-y-1 text-red-800 dark:text-red-300">
                        <div className="text-[11px] font-medium text-red-700/90 dark:text-red-300/90">
                          {request.reviewedByName ?? request.reviewedByEmail ?? 'Reviewer'}
                          {request.reviewedAt
                            ? ` • ${new Date(request.reviewedAt).toLocaleString()}`
                            : ''}
                        </div>
                        <div>
                          <span className="font-semibold">Denial reason:</span> {request.reviewNote}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-400 dark:bg-red-500" />
                  </div>
                )}
              </div>
            )}

            {isPending ? null : (
              <div className="space-y-1">
                {request.status !== 'denied' && (
                  <p className="text-xs text-muted-foreground">
                    Reviewed{' '}
                    {request.reviewedAt
                      ? new Date(request.reviewedAt).toLocaleString()
                      : 'recently'}
                  </p>
                )}
                {request.status !== 'denied' && request.reviewNote ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">Review note:</span>{' '}
                    {request.reviewNote}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right md:w-px md:whitespace-nowrap">
          {isPending ? (
            <>
              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 border border-border bg-secondary/60 text-foreground hover:bg-secondary"
                      aria-label={`Actions for ${request.email}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      className="text-emerald-700 focus:bg-emerald-50 focus:text-emerald-800 dark:focus:bg-emerald-950/40 dark:focus:text-emerald-300"
                      disabled={isBusy}
                      onSelect={() => {
                        setSelectedRoleByRequestId((previous) => ({
                          ...previous,
                          [request.id]: selectedRole,
                        }));
                        setApproveTarget(request);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve request
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-700 focus:bg-red-50 focus:text-red-800 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300"
                      disabled={isBusy}
                      onSelect={() => {
                        setDenyReason('');
                        setDenyTarget(request);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Deny request
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="hidden justify-end gap-2 md:flex">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 focus-visible:ring-emerald-500 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                      aria-label={`Approve ${request.email}`}
                      disabled={isBusy}
                      onClick={() => {
                        setSelectedRoleByRequestId((previous) => ({
                          ...previous,
                          [request.id]: selectedRole,
                        }));
                        setApproveTarget(request);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Approve request</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 focus-visible:ring-red-500 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50"
                      aria-label={`Deny ${request.email}`}
                      disabled={isBusy}
                      onClick={() => {
                        setDenyReason('');
                        setDenyTarget(request);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Deny request</TooltipContent>
                </Tooltip>
              </div>
            </>
          ) : (
            <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              Closed
            </span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead className="text-right md:w-px md:whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.length > 0 ? (
                  pendingRequests.map(renderRequestRow)
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm text-muted-foreground">
                      No pending requests.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {closedRequests.length > 0 && (
            <div className="rounded-md border">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
                onClick={() => setShowClosedRequests((previous) => !previous)}
                aria-expanded={showClosedRequests}
              >
                <span>Closed requests ({closedRequests.length})</span>
                {showClosedRequests ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {showClosedRequests && (
                <div className="overflow-x-auto border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Request</TableHead>
                        <TableHead className="text-right md:w-px md:whitespace-nowrap">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{closedRequests.map(renderRequestRow)}</TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>
      </TooltipProvider>

      <Dialog open={!!approveTarget} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve access request?</DialogTitle>
            <DialogDescription>
              This will create or update the user account for{' '}
              <span className="font-medium">{approveTarget?.email ?? 'this user'}</span> and send a
              temporary password by email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium">Role to assign</p>
            <Select
              value={approveRole as UserRole}
              onValueChange={(value) => {
                if (!approveTarget) return;
                setSelectedRoleByRequestId((previous) => ({
                  ...previous,
                  [approveTarget.id]: value as UserRole,
                }));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!approveTarget || pendingRequestId === approveTarget?.id}
              isLoading={pendingRequestId === approveTarget?.id}
              loadingText="Approving..."
              onClick={async () => {
                if (!approveTarget) return;
                setPendingRequestId(approveTarget.id);
                try {
                  const result = await approveAccessRequest({
                    requestId: approveTarget.id,
                    role: approveRole as UserRole,
                  });
                  if (!result.success) {
                    toast.error(result.error ?? 'Unable to approve request.');
                    return;
                  }
                  if (result.data?.emailWarning) {
                    toast.warning(result.data.emailWarning);
                  } else {
                    toast.success('Request approved and temporary password sent.');
                  }
                  setApproveTarget(null);
                  router.refresh();
                } finally {
                  setPendingRequestId(null);
                }
              }}
            >
              Approve request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!denyTarget} onOpenChange={(open) => !open && setDenyTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny access request?</DialogTitle>
            <DialogDescription>
              This will mark the request from{' '}
              <span className="font-medium">{denyTarget?.email ?? 'this user'}</span> as denied.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={denyReason}
            onChange={(event) => setDenyReason(event.target.value)}
            placeholder="Reason for denial"
            rows={3}
            maxLength={300}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
              disabled={!denyTarget || pendingRequestId === denyTarget?.id || !denyReason.trim()}
              isLoading={pendingRequestId === denyTarget?.id}
              loadingText="Denying..."
              onClick={async () => {
                if (!denyTarget) return;
                setPendingRequestId(denyTarget.id);
                try {
                  const result = await denyAccessRequest({
                    requestId: denyTarget.id,
                    note: denyReason.trim(),
                  });
                  if (!result.success) {
                    toast.error(result.error ?? 'Unable to deny request.');
                    return;
                  }
                  toast.success('Request denied.');
                  setDenyTarget(null);
                  setDenyReason('');
                  router.refresh();
                } finally {
                  setPendingRequestId(null);
                }
              }}
            >
              Deny request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
