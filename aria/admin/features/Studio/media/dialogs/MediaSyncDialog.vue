<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatSyncAction,
  getSyncActionIcon,
  getAssetIcon,
  inferSyncAssetType,
  getSyncAssetName,
} from "../utils";
import type { SyncDirection, SyncPlan } from "../types";

interface SyncPreviewItem {
  logicalPath: string;
  action: "create" | "update" | "delete" | "skip" | "conflict";
  reason: string;
}

interface Props {
  open: boolean;
  syncPlan: SyncPlan | null;
  syncDirection: SyncDirection;
  syncIncludeDeletes: boolean;
  isPlanningSync: boolean;
  isApplyingSync: boolean;
  syncError: string | null;
  syncNotice: string | null;
  syncFilter: "all" | "changes" | "conflicts";
  lastSyncLabel: string;
  syncPrimaryLabel: string;
  hasSyncConflicts: boolean;
  syncSummaryText: string;
  syncIncomingCount: number;
  syncConsoleId: string;
  syncPreviewItems: SyncPreviewItem[];
  syncHasPreviewItems: boolean;
  getSyncAssetSize: (logicalPath: string) => string;
}

defineProps<Props>();

defineEmits<{
  "update:open": [value: boolean];
  "update:syncFilter": [value: "all" | "changes" | "conflicts"];
  "update:syncDirection": [value: SyncDirection];
  "update:syncIncludeDeletes": [value: boolean];
  close: [];
  startSmartSync: [];
  applySyncPlan: [];
  resolveConflicts: [policy: "local-wins" | "remote-wins"];
  runSyncPlan: [];
}>();
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent
      class="w-full max-w-none! sm:max-w-none! p-0 gap-0 overflow-hidden bg-background border border-dashed border-border"
      :style="{ width: 'min(94vw, 1040px)', maxWidth: 'min(94vw, 1040px)' }"
    >
      <div class="flex flex-col md:flex-row max-h-[620px] min-h-[520px] w-full">
        <div
          class="w-full md:w-[320px] lg:w-[340px] bg-sidebar border-b md:border-b-0 md:border-r border-dashed border-border p-5 flex flex-col justify-between"
        >
          <div>
            <div class="flex items-center gap-2 text-muted-foreground mb-5">
              <span class="i-hugeicons:cloud size-3.5" aria-hidden="true" />
              <span class="text-2xs uppercase tracking-wide">Sync Console</span>
            </div>

            <h3 class="text-lg font-medium text-foreground mb-1">
              Production Merge
            </h3>
            <p class="text-2xs text-muted-foreground leading-relaxed mb-5">
              Synchronization between local media and Cloudflare storage.
            </p>

            <div
              v-if="hasSyncConflicts"
              class="bg-background border border-dashed border-border rounded-sm p-3 mb-5"
            >
              <div class="flex items-start gap-2">
                <div
                  class="i-hugeicons:alert-01 w-4 h-4 text-primary mt-0.5"
                />
                <div>
                  <p class="text-2xs text-foreground mb-1">
                    Attention Required
                  </p>
                  <p class="text-2xs text-muted-foreground">
                    {{ syncPlan?.summary.conflicted || 0 }} file{{
                      (syncPlan?.summary.conflicted || 0) === 1 ? "" : "s"
                    }}
                    need a sync decision.
                  </p>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2.5">
              <div
                class="p-3 bg-background rounded-sm border border-dashed border-border"
              >
                <p
                  class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1"
                >
                  Incoming
                </p>
                <p class="text-xl font-medium text-foreground">
                  {{ syncIncomingCount }}
                </p>
              </div>
              <div
                class="p-3 bg-background rounded-sm border border-dashed border-border"
              >
                <p
                  class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1"
                >
                  Conflicts
                </p>
                <p class="text-xl font-medium text-foreground">
                  {{ syncPlan?.summary.conflicted || 0 }}
                </p>
              </div>
            </div>

            <div
              class="mt-4 p-3 bg-background rounded-sm border border-dashed border-border"
            >
              <p class="text-2xs text-muted-foreground">
                {{ syncSummaryText }}
              </p>
              <p class="text-2xs text-muted-foreground mt-1">
                {{ lastSyncLabel }}
              </p>
            </div>
          </div>

          <div class="mt-6 space-y-2.5">
            <Button
              class="w-full"
              :disabled="isPlanningSync || isApplyingSync"
              @click="$emit('startSmartSync')"
            >
              <div class="i-hugeicons:refresh w-4 h-4 mr-1.5" />
              {{ syncPrimaryLabel }}
            </Button>

            <div v-if="hasSyncConflicts" class="grid grid-cols-1 gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="isPlanningSync || isApplyingSync"
                @click="$emit('applySyncPlan')"
              >
                Sync Safe Changes
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="isPlanningSync || isApplyingSync"
                @click="$emit('resolveConflicts', 'local-wins')"
              >
                Prefer My Changes
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="isPlanningSync || isApplyingSync"
                @click="$emit('resolveConflicts', 'remote-wins')"
              >
                Prefer Synced Version
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              class="w-full"
              :disabled="isPlanningSync || isApplyingSync"
              @click="$emit('close')"
            >
              Close
            </Button>
          </div>
        </div>

        <div class="flex-1 min-w-0 flex flex-col min-h-0 bg-background">
          <div
            class="h-14 border-b border-dashed border-border px-4 flex items-center gap-3"
          >
            <div class="min-w-0 overflow-x-auto">
              <div class="flex items-center gap-2 w-max pr-1">
                <Button
                  size="sm"
                  :variant="syncFilter === 'all' ? 'default' : 'outline'"
                  :disabled="isPlanningSync || isApplyingSync"
                  @click="$emit('update:syncFilter', 'all')"
                >
                  All Changes
                </Button>
                <Button
                  size="sm"
                  :variant="syncFilter === 'changes' ? 'default' : 'outline'"
                  :disabled="isPlanningSync || isApplyingSync"
                  @click="$emit('update:syncFilter', 'changes')"
                >
                  Incoming
                </Button>
                <Button
                  size="sm"
                  :variant="syncFilter === 'conflicts' ? 'default' : 'outline'"
                  :disabled="isPlanningSync || isApplyingSync"
                  @click="$emit('update:syncFilter', 'conflicts')"
                >
                  Needs Review
                </Button>
              </div>
            </div>
          </div>

          <div
            v-if="syncError"
            class="mx-4 mt-3 border border-dashed border-destructive rounded-sm px-3 py-2 text-sm text-destructive"
          >
            {{ syncError }}
          </div>

          <div
            v-if="syncNotice"
            class="mx-4 mt-3 border border-dashed border-border rounded-sm px-3 py-2 text-sm text-foreground bg-sidebar"
          >
            {{ syncNotice }}
          </div>

          <div class="flex-1 overflow-y-auto px-2 py-2">
            <Table class="w-full border-collapse bg-background">
              <TableHeader>
                <TableRow
                  class="border-b border-dashed border-border hover:bg-transparent"
                >
                  <TableHead
                    class="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground"
                    >Asset</TableHead
                  >
                  <TableHead
                    class="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground text-right"
                    >Size</TableHead
                  >
                  <TableHead
                    class="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground text-right"
                    >Action</TableHead
                  >
                  <TableHead
                    class="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground text-right"
                    >State</TableHead
                  >
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="item in syncPreviewItems"
                  :key="`${item.logicalPath}-${item.action}-${item.reason}`"
                  class="border-b border-dashed border-border"
                >
                  <TableCell class="px-3 py-2">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div
                        class="w-8 h-8 rounded-sm border border-dashed border-border bg-sidebar flex items-center justify-center shrink-0"
                      >
                        <div
                          :class="[
                            getAssetIcon(inferSyncAssetType(item.logicalPath)),
                            'w-4 h-4 text-muted-foreground',
                          ]"
                        />
                      </div>
                      <div class="min-w-0">
                        <p class="text-2xs text-foreground truncate">
                          {{ getSyncAssetName(item.logicalPath) }}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell
                    class="px-3 py-2 text-2xs text-right text-muted-foreground"
                    >{{ getSyncAssetSize(item.logicalPath) }}</TableCell
                  >
                  <TableCell
                    class="px-3 py-2 text-2xs text-right text-muted-foreground"
                  >
                    <span class="inline-flex items-center gap-1.5 justify-end">
                      <div
                        :class="[getSyncActionIcon(item.action), 'w-3.5 h-3.5']"
                      />
                      {{ formatSyncAction(item.action) }}
                    </span>
                  </TableCell>
                  <TableCell class="px-3 py-2 text-right">
                    <div
                      class="inline-flex items-center justify-center w-5 h-5 rounded-full border border-dashed border-border bg-sidebar ml-auto"
                    >
                      <div
                        :class="[
                          item.action === 'conflict'
                            ? 'i-hugeicons:alert-01'
                            : 'i-hugeicons:tick-02',
                          'w-3 h-3 text-muted-foreground',
                        ]"
                      />
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow
                  v-if="!syncHasPreviewItems"
                  class="border-b border-dashed border-border"
                >
                  <TableCell
                    colspan="4"
                    class="px-3 py-10 text-center text-2xs text-muted-foreground"
                  >
                    Run Sync Now to generate preview items.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div
            class="h-10 border-t border-dashed border-border px-4 flex items-center justify-between text-[10px] text-muted-foreground bg-sidebar"
          >
            <span>Showing {{ syncPreviewItems.length }} items</span>
            <details class="relative">
              <summary class="list-none cursor-pointer">Advanced</summary>
              <div
                class="absolute right-0 bottom-7 w-72 border border-dashed border-border bg-background rounded-sm p-3 space-y-3"
              >
                <div class="space-y-1">
                  <p
                    class="text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    Job Reference
                  </p>
                  <p class="text-2xs text-foreground">{{ syncConsoleId }}</p>
                </div>

                <div class="space-y-1">
                  <p
                    class="text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    Sync Direction
                  </p>
                  <div class="grid grid-cols-1 gap-2">
                    <Button
                      size="sm"
                      :variant="
                        syncDirection === 'push' ? 'default' : 'outline'
                      "
                      :disabled="isPlanningSync || isApplyingSync"
                      @click="$emit('update:syncDirection', 'push')"
                    >
                      Upload Local Changes
                    </Button>
                    <Button
                      size="sm"
                      :variant="
                        syncDirection === 'pull' ? 'default' : 'outline'
                      "
                      :disabled="isPlanningSync || isApplyingSync"
                      @click="$emit('update:syncDirection', 'pull')"
                    >
                      Download Synced Changes
                    </Button>
                  </div>
                </div>

                <div
                  class="flex items-center justify-between border border-dashed border-border rounded-sm px-2.5 py-2"
                >
                  <span class="text-2xs text-muted-foreground"
                    >Include Deletes</span
                  >
                  <Button
                    size="sm"
                    :variant="syncIncludeDeletes ? 'default' : 'outline'"
                    :disabled="isPlanningSync || isApplyingSync"
                    @click="
                      $emit('update:syncIncludeDeletes', !syncIncludeDeletes)
                    "
                  >
                    {{ syncIncludeDeletes ? "On" : "Off" }}
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  :disabled="isPlanningSync || isApplyingSync"
                  @click="$emit('runSyncPlan')"
                >
                  Rebuild Preview
                </Button>
              </div>
            </details>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
