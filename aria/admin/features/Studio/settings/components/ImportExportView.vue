<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import SiteExportPanel from "./SiteExportPanel.vue";
import MarkdownImportPanel from "./MarkdownImportPanel.vue";
import WordPressImportPanel from "./WordPressImportPanel.vue";

const activeTab = ref<"import" | "export">("import");
const importSource = ref<"wordpress" | "markdown">("wordpress");
const { t } = useStudioI18n();
</script>

<template>
  <div class="min-w-0 space-y-0 px-0 page-card-enter z-10 bg-background">
    <Teleport defer to="#settings-tab-actions">
      <div
        class="flex items-center gap-2"
        :aria-label="t('importExport.actions')"
      >
        <Button
          type="button"
          size="sm"
          :variant="activeTab === 'import' ? 'default' : 'outline'"
          @click="activeTab = 'import'"
        >
          <span :class="[studioIcons.upload, 'mr-1.5 size-3.5']" />
          {{ t("importExport.import") }}
        </Button>
        <Button
          type="button"
          size="sm"
          :variant="activeTab === 'export' ? 'default' : 'outline'"
          @click="activeTab = 'export'"
        >
          <span :class="[studioIcons.download, 'mr-1.5 size-3.5']" />
          {{ t("importExport.export") }}
        </Button>
      </div>
    </Teleport>

    <template v-if="activeTab === 'import'">
      <div
        class="sticky top-0 z-10 flex h-12 shrink-0 items-stretch gap-1 border-b border-dashed border-border bg-background px-7 inset-shadow-xs"
        role="tablist"
        :aria-label="t('importExport.source')"
      >
        <Button
          type="button"
          size="tab"
          role="tab"
          :aria-selected="importSource === 'wordpress'"
          :variant="importSource === 'wordpress' ? 'tab-active' : 'tab'"
          @click="importSource = 'wordpress'"
        >
          WordPress
        </Button>
        <Button
          type="button"
          size="tab"
          role="tab"
          :aria-selected="importSource === 'markdown'"
          :variant="importSource === 'markdown' ? 'tab-active' : 'tab'"
          @click="importSource = 'markdown'"
        >
          Markdown
        </Button>
      </div>
      <WordPressImportPanel v-if="importSource === 'wordpress'" />
      <MarkdownImportPanel v-else />
    </template>
    <SiteExportPanel v-else />
  </div>
</template>
