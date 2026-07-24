<script setup lang="ts">
/**
 * MigrationAlert - Shows toast when component versions have been migrated
 *
 * Displays a toast notification when components are automatically upgraded
 * to new versions with updated props.
 */
import { watch } from "vue";
import { toast } from "vue-sonner";
import type { MigrationReport } from "../../../../lib/migrations/propMigrations";
import { h } from "vue";

const props = defineProps<{
  migrations: MigrationReport[];
}>();

const emit = defineEmits<{
  save: [];
}>();

// Show toast when migrations are detected
watch(
  () => props.migrations,
  (migrations) => {
    if (migrations.length > 0) {
      showMigrationToast(migrations);
    }
  },
  { immediate: true },
);

function showMigrationToast(migrations: MigrationReport[]) {
  const migrationList = migrations
    .map(
      (m) =>
        `${m.type} (v${m.fromVersion} → v${m.toVersion})${m.description ? ": " + m.description : ""}`,
    )
    .join("\n");

  toast("🔄 Components Updated", {
    description: h("div", [
      h(
        "p",
        { class: "mb-2" },
        `${migrations.length} component${migrations.length > 1 ? "s were" : " was"} automatically migrated:`,
      ),
      h(
        "ul",
        { class: "text-sm space-y-1 mb-3 list-disc list-inside" },
        migrations.map((m) =>
          h("li", [
            h("strong", m.type),
            ` (v${m.fromVersion} → v${m.toVersion})`,
            m.description
              ? h(
                  "span",
                  { class: "text-muted-foreground" },
                  ` — ${m.description}`,
                )
              : "",
          ]),
        ),
      ),
    ]),
    duration: 10000, // 10 seconds
    action: {
      label: "Save Changes",
      onClick: () => emit("save"),
    },
  });
}
</script>

<template>
  <!-- No template needed - notifications shown via toast -->
</template>
