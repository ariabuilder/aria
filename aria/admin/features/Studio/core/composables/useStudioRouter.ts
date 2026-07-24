import { computed, inject, nextTick } from "vue"
import { useRoute, useRouter } from "vue-router"
import { toast } from "vue-sonner"
import type { StudioSection, StudioRouterReturn } from "@/features/Studio/types"
import { useStudioCapabilities } from "@/composables/useStudioCapabilities"
import {
  CONTRIBUTOR_COMPOSER_DENIED_MESSAGE,
  CONTRIBUTOR_LANDING_PATH,
  type StudioItemType,
} from "@/composables/useComposerAccess"
import {
  getComposerItemFeatureDisabledMessage,
  isComposerItemFeatureEnabled,
} from "../../../../../lib/features"
import { APP_INJECTION_KEYS } from "@/features/Core/types/injectionKeys"

export interface StudioRouterOptions {
  onNavigate?: (section: StudioSection) => void
}

export function useStudioRouter(options: StudioRouterOptions = {}): StudioRouterReturn {
  const route = useRoute()
  const router = useRouter()
  const caps = useStudioCapabilities()
  const ensureDraftSaved = inject(APP_INJECTION_KEYS.ensureDraftSaved, undefined)

  const sectionMap: Record<string, StudioSection> = {
    "/dashboard": "dashboard",
    "/pages": "pages",
    "/layouts": "layouts",
    "/layouts/new": "layouts",
    "/components": "components",
    "/components/new": "components",
    "/collections": "collections",
    "/media": "media",
    "/design": "design",
    "/settings": "settings",
  }

  const titleMap: Record<StudioSection, string> = {
    dashboard: "Dashboard",
    pages: "Pages",
    layouts: "Layouts",
    components: "Components",
    collections: "Collections",
    media: "Media",
    design: "Design",
    settings: "Settings",
  }

  const activeSection = computed<StudioSection>(() => {
    const path = route.path
    for (const [routePath, section] of Object.entries(sectionMap)) {
      if (path === routePath || path.startsWith(routePath + "/")) {
        return section
      }
    }
    return "dashboard"
  })

  const pageTitle = computed<string>(() => titleMap[activeSection.value] ?? "Studio")

  const isEditing = computed<boolean>(() => {
    const path = route.path
    return (
      path.startsWith("/pages/") ||
      path.startsWith("/layouts/") ||
      path.startsWith("/components/")
    )
  })

  const editingItemType = computed<"page" | "layout" | "component" | null>(() => {
    const path = route.path
    if (path.startsWith("/pages/")) return "page"
    if (path.startsWith("/layouts/")) return "layout"
    if (path.startsWith("/components/")) return "component"
    return null
  })

  const editingItemSlug = computed<string | null>(() => {
    const path = route.path
    const parts = path.split("/").filter(Boolean)
    if (parts.length >= 2 && parts[0] !== "new") {
      return parts[1]
    }
    return null
  })

  function resolveNavigationPath(section: StudioSection | string): string | null {
    if (typeof section !== "string") {
      console.warn("[useStudioRouter] Ignoring invalid navigation target", section)
      return null
    }

    const trimmed = section.trim()
    if (!trimmed) {
      return null
    }

    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  }

  function navigateTo(section: StudioSection | string) {
    const path = resolveNavigationPath(section)
    if (!path) {
      return
    }

    if (route.fullPath !== path) {
      const navigate = async () => {
        await router.push(path)
        await nextTick()
      }
      void navigate()
    }
    options.onNavigate?.(activeSection.value)
  }

  function startEditing(itemType: StudioItemType, slug: string) {
    if (typeof slug !== "string" || slug.trim().length === 0) {
      console.warn("[useStudioRouter] Ignoring invalid edit slug", slug)
      return
    }
    if (!caps.isReady.value) {
      return
    }
    if (!isComposerItemFeatureEnabled(itemType)) {
      const message = getComposerItemFeatureDisabledMessage(itemType)
      if (message) {
        toast.error(message)
      }
      if (itemType === "layout" && route.fullPath !== "/dashboard") {
        void router.push("/dashboard")
      }
      return
    }
    if (!caps.canEditItemInComposer(itemType)) {
      toast.error(
        caps.isContributor.value
          ? CONTRIBUTOR_COMPOSER_DENIED_MESSAGE
          : caps.getForbiddenMessage(caps.composerOperationForItem(itemType)),
      )
      const fallback = caps.isContributor.value
        ? CONTRIBUTOR_LANDING_PATH
        : `/${itemType}s`
      if (route.fullPath !== fallback) {
        void router.push(fallback)
      }
      return
    }
    const path = `/${itemType}s/${slug.trim()}?composer`
    void router.push(path)
  }

  async function stopEditingAfterSave(): Promise<void> {
    const currentType = editingItemType.value

    if (ensureDraftSaved) {
      const didSave = await ensureDraftSaved().catch(() => false)
      if (!didSave) {
        toast.error("Save is still in progress. Try leaving Composer again in a moment.")
        return
      }
    }

    if (currentType) {
      navigateTo(`${currentType}s` as StudioSection)
    } else {
      navigateTo("dashboard")
    }
  }

  function stopEditing() {
    void stopEditingAfterSave()
  }

  return {
    currentRoute: route,
    activeSection,
    pageTitle,
    navigateTo,
    startEditing,
    stopEditing,
    isEditing,
    editingItemType,
    editingItemSlug,
  }
}
