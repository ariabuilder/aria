<script setup lang="ts">
import { computed, watch } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { useBuilderData } from "@/composables/useBuilderData";
import { useCollectionsList } from "@/features/CMS/composables/useCollectionsList";
import { useSettingsDialog } from "@/features/Studio/settings";
import { useStudioMetrics } from "@/features/Studio/metrics/composables/useStudioMetrics";
import { useStudioRouter } from "@/features/Studio/core/composables";
import {
  PageHeader,
  StudioPanelShell,
} from "@/features/Studio/core/components";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import { scheduleBackgroundBootWork } from "@/lib/scheduleBackgroundBootWork";
import { traceStartup } from "@/lib/startupTrace";
import type { MetricsPeriod } from "../../../../lib/metrics/types";
import { useDashboardHero } from "./composables/useDashboardHero";
import { useDashboardOverview } from "./composables/useDashboardOverview";
import ContinueWorkingCard from "./components/ContinueWorkingCard.vue";
import RecentWorkCard from "./components/RecentWorkCard.vue";
import ResourceStrip from "./components/ResourceStrip.vue";
import SiteStructureCard from "./components/SiteStructureCard.vue";
import TrafficDotMatrix from "./components/TrafficDotMatrix.vue";

defineOptions({ name: "DashboardView" });

const { error: builderError, pages } = useBuilderData();
const { t } = useStudioI18n();
const { loadCollections } = useCollectionsList();
const settingsDialog = useSettingsDialog();
const router = useStudioRouter();
const studioMetrics = useStudioMetrics();
const { siteTitle, liveStatus, isLive, lastPublishedLabel, visitSite } =
  useDashboardHero();
const { continueWorkingItem } = useDashboardOverview();

const headerDescription = computed(() => lastPublishedLabel.value);

const homePage = computed(
  () =>
    pages.value.find((page) => page.slug === "index") ??
    pages.value.find((page) => page.slug === "home") ??
    null,
);

function editHomepage(): void {
  if (homePage.value) {
    router.startEditing("page", homePage.value.slug);
    return;
  }
  router.navigateTo("/pages");
}

function changeMetricsPeriod(period: MetricsPeriod): void {
  if (studioMetrics.period.value === period) return;
  studioMetrics.period.value = period;
  void studioMetrics.refreshTraffic();
}

let builderErrorToastShown = false;
watch(builderError, (message) => {
  if (!message || builderErrorToastShown) return;
  builderErrorToastShown = true;
  toast.error(message);
});

scheduleBackgroundBootWork(
  () => {
    traceStartup("background-boot:dashboard");
    void loadCollections({ silent: true });
    void studioMetrics.refreshAvailability(true).then(() => {
      if (studioMetrics.canShowMetrics.value) {
        void studioMetrics.ensureTrafficLoaded();
      }
    });
  },
  { label: "dashboard" },
);
</script>

<template>
  <StudioPanelShell class="page-card-enter">
    <PageHeader
      :title="siteTitle"
      class="min-h-[5.5rem] px-5 py-3"
      hide-search
      hide-create
    >
      <template #title>
        <div class="flex min-w-0 flex-col items-left gap-2">
          <h1
            class="m-0 truncate text-2xl font-medium font-sans tracking-tight"
          >
            {{ siteTitle }}
          </h1>
          <span
            class="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground"
          >
            <span
              class="relative flex size-1.5 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <span
                v-if="isLive"
                class="absolute inset-0 rounded-full bg-primary/60 live-ping"
              />
              <span
                :class="[
                  'relative size-1.5 rounded-full',
                  isLive ? 'bg-primary' : 'bg-muted-foreground/40',
                ]"
              />
            </span>
            <span class="text-sm text-muted-foreground/80">
              {{ lastPublishedLabel }}
            </span>
          </span>

        </div>
      </template>

      <template #toolbar>
        <HeaderActionTooltip :label="t('dashboard.siteSettings')">
          <Button
            variant="headerAction"
            size="icon-header"
            :aria-label="t('dashboard.siteSettings')"
            @click="settingsDialog.open('general')"
          >
            <span
              :class="[studioIcons.settings, 'size-3.5 shrink-0']"
              aria-hidden="true"
            />
          </Button>
        </HeaderActionTooltip>
      </template>

      <template #actions>
        <Button variant="secondary" size="md" class="gap-2 group" @click="visitSite">
          {{ t("dashboard.visitSite") }}
          <span
            :class="[studioIcons.arrowUpRight, 'size-3 shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform duration-200']"
            aria-hidden="true"
          />
        </Button>
      </template>
    </PageHeader>

    <div
      class="dashboard-body flex-1 min-h-0 overflow-x-clip overflow-y-auto overscroll-y-none bg-background"
      style="touch-action: pan-y"
    >
      <main class="mx-auto w-full max-w-6xl px-5 py-5 lg:px-6 lg:pb-8">
        <ResourceStrip />

        <div class="dashboard-main-grid mt-5 gap-5">
          <TrafficDotMatrix
            :visits="studioMetrics.siteVisits.value"
            :requests="studioMetrics.siteRequests.value"
            :bandwidth-bytes="studioMetrics.siteBandwidthBytes.value"
            :hourly-visits="studioMetrics.siteHourlyVisits.value"
            :hourly-requests="studioMetrics.siteHourlyRequests.value"
            :hourly-bandwidth-bytes="
              studioMetrics.siteHourlyBandwidthBytes.value
            "
            :hourly-timestamps="studioMetrics.siteHourlyTimestamps.value"
            :period="studioMetrics.period.value"
            :can-show-metrics="studioMetrics.canShowMetrics.value"
            :is-loading="
              studioMetrics.isLoadingSiteTraffic.value ||
              studioMetrics.isLoadingAvailability.value
            "
            :error-message="
              studioMetrics.trafficError.value ||
              studioMetrics.availabilityError.value ||
              studioMetrics.availabilityMessage.value
            "
            :stale="studioMetrics.siteStale.value"
            @period-change="changeMetricsPeriod"
            @refresh="studioMetrics.refreshTraffic(true)"
            @configure="settingsDialog.open('analytics')"
          />
          <ContinueWorkingCard :item="continueWorkingItem" />
          <RecentWorkCard />
          <SiteStructureCard />
        </div>
      </main>
    </div>
  </StudioPanelShell>
</template>

<style scoped>
.dashboard-body {
  container-type: inline-size;
  container-name: dashboard-body;
}

.dashboard-main-grid {
  display: grid;
}

@container dashboard-body (min-width: 64rem) {
  .dashboard-main-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(20rem, 1fr);
  }
}
</style>
