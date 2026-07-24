<script setup lang="ts">
import { computed, ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSettingsTabHydrate } from "../composables/useSettingsTabHydrate";

type RuntimeTarget = "node" | "cloudflare";

interface CompilerMetadata {
  aria: { version: string };
  astro: { version: string; major: number };
  runtime: RuntimeTarget;
  storageSchemaVersion: string;
  capturedAt: string;
}

interface ProjectSystemMetadata {
  projectCreatedAt: string;
  createdWith: CompilerMetadata;
}

interface PackageVersion {
  name: string;
  version: string;
  note?: string;
}

interface SystemPayload {
  project: ProjectSystemMetadata | null;
  current: CompilerMetadata;
  packages: PackageVersion[];
}

interface SystemActionSuccess {
  success: true;
  data: SystemPayload;
}

interface SystemActionFailure {
  success: false;
  error: { code: string; message: string };
}

type SystemActionResult = SystemActionSuccess | SystemActionFailure;

const isLoading = ref(false);
const payload = ref<SystemPayload | null>(null);

const projectRows = computed(() => {
  const project = payload.value?.project;
  if (!project) {
    return [
      {
        label: "Created with",
        value: "Not recorded",
        note: "Project metadata will be stored on fresh installs",
      },
    ];
  }

  const storedAstro = project.createdWith.astro;
  const astro =
    storedAstro.version === "unknown" || storedAstro.major === 0
      ? (payload.value?.current.astro ?? storedAstro)
      : storedAstro;

  return [
    {
      label: "Created with",
      value: `Astro ${astro.major} / Aria ${project.createdWith.aria.version}`,
      note: astro.version,
    },
    {
      label: "Runtime",
      value: formatRuntime(project.createdWith.runtime),
      note: "Initial runtime target",
    },
    {
      label: "Storage schema",
      value: project.createdWith.storageSchemaVersion,
      note: "Initial schema",
    },
    {
      label: "Created at",
      value: formatDate(project.projectCreatedAt),
      note: project.projectCreatedAt,
    },
  ];
});

function formatRuntime(runtime: RuntimeTarget): string {
  return runtime === "node" ? "Node" : "Cloudflare";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

async function loadSystemSettings(): Promise<void> {
  isLoading.value = true;
  try {
    const { data, error } = await actions.settings.system({});
    if (error) {
      throw error;
    }

    const result = data as SystemActionResult;
    if (!result.success) {
      throw new Error(result.error.message);
    }

    payload.value = result.data;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to load system details",
    );
  } finally {
    isLoading.value = false;
  }
}

async function copySystemReport(): Promise<void> {
  if (!payload.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(JSON.stringify(payload.value, null, 2));
    toast.success("System report copied");
  } catch {
    toast.error("Unable to copy system report");
  }
}

useSettingsTabHydrate({
  tabId: "system",
  hydrate: loadSystemSettings,
});
</script>

<template>
  <div class="px-8 py-6 space-y-8 text-sm [&_h3]:m-0 [&_p]:m-0">
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="text-sm font-medium text-foreground">Versions</h3>
          <p class="text-xs text-muted-foreground">
            Current package and compiler versions.
          </p>
        </div>
        <Badge
          v-if="payload"
          variant="outline"
          size="sm"
          class="font-mono text-muted-foreground"
        >
          Astro {{ payload.current.astro.major }}
        </Badge>
      </div>

      <Table>
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead class="h-8 px-0">Name</TableHead>
            <TableHead class="h-8 px-0">Version</TableHead>
            <TableHead class="h-8 px-0">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="item in payload?.packages ?? []"
            :key="item.name"
            class="hover:bg-transparent"
          >
            <TableCell class="px-0 py-2 text-foreground">
              {{ item.name }}
            </TableCell>
            <TableCell class="px-0 py-2 font-mono text-muted-foreground">
              {{ item.version }}
            </TableCell>
            <TableCell class="px-0 py-2 text-muted-foreground">
              {{ item.note }}
            </TableCell>
          </TableRow>
          <TableRow v-if="isLoading" class="hover:bg-transparent">
            <TableCell class="px-0 py-2 text-muted-foreground" colspan="3">
              Loading...
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </section>

    <Separator />

    <section class="space-y-3">
      <div>
        <h3 class="text-sm font-medium text-foreground">Project Metadata</h3>
        <p class="text-xs text-muted-foreground">
          Stored creation metadata for compatibility checks.
        </p>
      </div>

      <Table>
        <TableBody>
          <TableRow
            v-for="row in projectRows"
            :key="row.label"
            class="hover:bg-transparent"
          >
            <TableCell class="w-38 px-0 py-2 text-muted-foreground">
              {{ row.label }}
            </TableCell>
            <TableCell class="px-0 py-2 text-foreground">
              {{ row.value }}
            </TableCell>
            <TableCell class="px-0 py-2 text-muted-foreground">
              {{ row.note }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </section>

    <Separator />

    <section class="space-y-3">
      <div>
        <h3 class="text-sm font-medium text-foreground">
          Built on great foundations
        </h3>
        <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Aria Builder is powered by Astro, Vue, Cloudflare, and the open-source
          tools that make a faster, more durable web possible.
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button as-child variant="outline" size="sm">
          <a
            href="https://github.com/ariabuilder/aria#readme"
            target="_blank"
            rel="noreferrer"
          >
            README
            <span class="i-lucide:arrow-up-right size-3.5" aria-hidden="true" />
          </a>
        </Button>
        <Button as-child variant="outline" size="sm">
          <a
            href="https://github.com/ariabuilder/aria/blob/main/acknowledgements.md"
            target="_blank"
            rel="noreferrer"
          >
            Acknowledgements
            <span class="i-lucide:arrow-up-right size-3.5" aria-hidden="true" />
          </a>
        </Button>
      </div>
    </section>

    <Separator />

    <section class="flex items-center justify-between gap-4">
      <div>
        <h3 class="text-sm font-medium text-foreground">Diagnostics</h3>
        <p class="text-xs text-muted-foreground">
          Copy a compact report for support or debugging.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        :disabled="!payload || isLoading"
        @click="copySystemReport"
      >
        <span class="i-lucide:copy size-3.5" aria-hidden="true" />
        Copy report
      </Button>
    </section>
  </div>
</template>
