<script setup lang="ts">
import { ref } from "vue";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

const canonical = defineModel<string>("canonical", { default: "" });
const noindex = defineModel<boolean>("noindex", { default: false });
const nofollow = defineModel<boolean>("nofollow", { default: false });
const structuredData = defineModel<string>("structuredData", { default: "" });
const { t } = useStudioI18n();

const isOpen = ref(false);
</script>

<template>
  <Collapsible
    v-model:open="isOpen"
    class="border-t border-dashed border-border/70 pt-5"
  >
    <CollapsibleTrigger as-child>
      <Button
        variant="ghost"
        class="flex h-9 w-full items-center justify-between px-0 text-sm font-medium text-foreground hover:bg-transparent"
      >
        <span class="text-sm font-medium text-muted-foreground">
          {{ t("pages.seo.advanced") }}
        </span>
        <span
          :class="[
            studioIcons.chevronDown,
            'size-4 transition-transform',
            isOpen ? 'rotate-180' : '',
          ]"
        />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent class="grid gap-5 pt-4">
      <div class="grid gap-2">
        <Label class="text-sm! text-muted-foreground">
          {{ t("pages.seo.canonical") }}
        </Label>
        <Input
          v-model="canonical"
          placeholder="https://example.com/page"
          class="h-9 text-sm"
        />
      </div>

      <div
        class="grid gap-3 rounded-md border border-dashed border-border/70 bg-sidebar/30 px-4 py-3"
      >
        <div class="flex items-center justify-between gap-4">
          <div>
            <span class="text-xs font-medium text-foreground">{{ t("pages.seo.noIndex") }}</span>
            <p class="m-0 mt-1 text-xs text-muted-foreground">
              {{
                noindex
                  ? t("pages.seo.hiddenSearch")
                  : t("pages.seo.visibleSearch")
              }}
            </p>
          </div>
          <Switch v-model:checked="noindex" />
        </div>

        <div class="flex items-center justify-between gap-4">
          <div>
            <span class="text-xs font-medium text-foreground">{{ t("pages.seo.noFollow") }}</span>
            <p class="m-0 mt-1 text-xs text-muted-foreground">
              {{
                nofollow
                  ? t("pages.seo.noFollowDescription")
                  : t("pages.seo.followDescription")
              }}
            </p>
          </div>
          <Switch v-model:checked="nofollow" />
        </div>
      </div>

      <div class="grid gap-2">
        <Label class="text-sm! text-muted-foreground">
          {{ t("pages.seo.structuredData") }}
        </Label>
        <Textarea
          v-model="structuredData"
          placeholder="{ '@context': 'https://schema.org', ... }"
          rows="4"
          class="min-h-24 font-mono text-xs"
        />
        <p class="m-0 text-xs text-muted-foreground">
          {{ t("pages.seo.structuredDataHelp") }}
        </p>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
