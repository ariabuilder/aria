import { log } from "@/lib/utils/logger"
import {
  ref,
  computed,
  watch,
  toValue,
  type Ref,
  type ComputedRef,
  type MaybeRefOrGetter,
  type WritableComputedRef,
} from "vue"
import { actions } from "astro:actions"
import type { BuilderNode } from "@/lib/types/nodes"
import { useComponentFetcher } from "@/features/Blocks/composables/useComponentFetcher"
import {
  ComposeActionResultSchema,
  PageMetaActionResultSchema,
  cloneSeoData,
  normalizeSeoData,
  type SeoData,
} from "./seoSchemas"
import { useSeoHistory } from "./useSeoHistory"

export type { SeoData }

export interface SeoIssue {
  id: string
  type: "critical" | "warning"
  title: string
  description: string
  icon: string
  field?: keyof SeoData
}

export interface SeoScoreStatus {
  label: string
  color: "emerald" | "orange" | "red"
}

export interface SeoPageStats {
  wordCount: number
  keywordDensity: number
  mediaHealth: {
    images: number
    missingAlt: number
    missingSrc: number
  }
  linkQuality: {
    links: number
    missingHref: number
    emptyText: number
    externalNoRel: number
  }
}

export interface SeoAnalysisReturn {
  seoData: WritableComputedRef<SeoData>
  isLoading: ComputedRef<boolean>
  isSaving: ComputedRef<boolean>
  error: WritableComputedRef<string | null>
  seoScore: ComputedRef<number>
  scoreStatus: ComputedRef<SeoScoreStatus>
  issues: ComputedRef<SeoIssue[]>
  criticalIssues: ComputedRef<SeoIssue[]>
  warningIssues: ComputedRef<SeoIssue[]>
  pageStats: ComputedRef<SeoPageStats>
  refresh: () => Promise<void>
  updateField: <K extends keyof SeoData>(field: K, value: SeoData[K]) => void
  save: () => Promise<boolean>
  reset: () => void
}

interface CachedSeoState {
  seoData: Ref<SeoData>
  persistedSeoData: Ref<SeoData>
  pageNodes: Ref<BuilderNode[]>
  isLoading: Ref<boolean>
  isSaving: Ref<boolean>
  error: Ref<string | null>
  fetchPromise: Promise<void> | null
}

const stateCache = new Map<string, CachedSeoState>()

function createPageNodesRef(): Ref<BuilderNode[]> {
  return ref([] as unknown) as Ref<BuilderNode[]>
}

function getOrCreateState(pageSlug: string): CachedSeoState {
  if (!stateCache.has(pageSlug)) {
    stateCache.set(pageSlug, {
      seoData: ref<SeoData>({}),
      persistedSeoData: ref<SeoData>({}),
      pageNodes: createPageNodesRef(),
      isLoading: ref(false),
      isSaving: ref(false),
      error: ref(null),
      fetchPromise: null,
    })
  }
  return stateCache.get(pageSlug)!
}

function getStringProp(props: BuilderNode["props"], key: string): string {
  const value = props[key]
  return typeof value === "string" ? value : ""
}

async function expandSeoAnalysisNodes(
  nodes: BuilderNode[],
): Promise<BuilderNode[]> {
  if (nodes.length === 0) return []

  const { expandComponentReferencesClient } = useComponentFetcher()
  const expandedNodes = await expandComponentReferencesClient(nodes)
  return [...expandedNodes]
}

function calculateSeoScore(data: SeoData): number {
  let score = 0

  if (data.title) {
    const len = data.title.length
    if (len >= 30 && len <= 60) {
      score += 25
    } else {
      score += 15
    }
  }

  if (data.description) {
    const len = data.description.length
    if (len >= 120 && len <= 160) {
      score += 25
    } else {
      score += 15
    }
  }

  if (data.ogImage) {
    score += 20
  }

  if (data.keywords && data.keywords.length > 0) {
    if (data.keywords.length >= 3) {
      score += 15
    } else {
      score += 10
    }
  }

  if (data.canonical) {
    score += 15
  }

  return Math.min(score, 100)
}

function getScoreStatus(score: number): SeoScoreStatus {
  if (score >= 80) return { label: "Excellent", color: "emerald" }
  if (score >= 50) return { label: "Needs Attention", color: "orange" }
  return { label: "Critical", color: "red" }
}

function detectIssues(data: SeoData): SeoIssue[] {
  const issues: SeoIssue[] = []

  if (!data.title) {
    issues.push({
      id: "missing-title",
      type: "critical",
      title: "Missing Meta Title",
      description: "Add a title between 30-60 characters.",
      icon: "i-hugeicons:alert-01",
      field: "title",
    })
  } else if (data.title.length < 30) {
    issues.push({
      id: "short-title",
      type: "warning",
      title: "Meta Title Too Short",
      description: `Title is ${data.title.length} chars. Aim for 30-60 characters.`,
      icon: "i-hugeicons:alert-01",
      field: "title",
    })
  } else if (data.title.length > 60) {
    issues.push({
      id: "long-title",
      type: "warning",
      title: "Meta Title Too Long",
      description: `Title is ${data.title.length} chars. Keep under 60 characters.`,
      icon: "i-hugeicons:alert-01",
      field: "title",
    })
  }

  if (!data.description) {
    issues.push({
      id: "missing-description",
      type: "critical",
      title: "Missing Meta Description",
      description: "Add a description between 120-160 characters.",
      icon: "i-hugeicons:alert-01",
      field: "description",
    })
  } else if (data.description.length < 120) {
    issues.push({
      id: "short-description",
      type: "warning",
      title: "Meta Description Too Short",
      description: `Description is ${data.description.length} chars. Aim for 120-160 characters.`,
      icon: "i-hugeicons:alert-01",
      field: "description",
    })
  } else if (data.description.length > 160) {
    issues.push({
      id: "long-description",
      type: "warning",
      title: "Meta Description Too Long",
      description: `Description is ${data.description.length} chars. Keep under 160 characters.`,
      icon: "i-hugeicons:alert-01",
      field: "description",
    })
  }

  if (!data.ogImage) {
    issues.push({
      id: "missing-og-image",
      type: "warning",
      title: "Missing Social Image",
      description: "Add an OG image for better social sharing.",
      icon: "i-hugeicons:image-delete-01",
      field: "ogImage",
    })
  }

  if (!data.keywords || data.keywords.length === 0) {
    issues.push({
      id: "missing-keywords",
      type: "warning",
      title: "No Keywords",
      description: "Add keywords for better discoverability.",
      icon: "i-hugeicons:tag-01",
      field: "keywords",
    })
  }

  return issues
}

export function useSeoAnalysis(
  pageSlug: MaybeRefOrGetter<string>,
): SeoAnalysisReturn {
  const getCurrentSlug = () => (toValue(pageSlug) || "").trim()
  const { recordSeoUpdate } = useSeoHistory()

  const seoData = computed<SeoData>({
    get: () => getOrCreateState(getCurrentSlug()).seoData.value,
    set: (value) => {
      getOrCreateState(getCurrentSlug()).seoData.value = value
    },
  })
  const pageNodes = computed<BuilderNode[]>({
    get: () => getOrCreateState(getCurrentSlug()).pageNodes.value,
    set: (value) => {
      getOrCreateState(getCurrentSlug()).pageNodes.value = value
    },
  })
  const isLoading = computed<boolean>({
    get: () => getOrCreateState(getCurrentSlug()).isLoading.value,
    set: (value) => {
      getOrCreateState(getCurrentSlug()).isLoading.value = value
    },
  })
  const isSaving = computed<boolean>({
    get: () => getOrCreateState(getCurrentSlug()).isSaving.value,
    set: (value) => {
      getOrCreateState(getCurrentSlug()).isSaving.value = value
    },
  })
  const error = computed<string | null>({
    get: () => getOrCreateState(getCurrentSlug()).error.value,
    set: (value) => {
      getOrCreateState(getCurrentSlug()).error.value = value
    },
  })

  function getNodeDirectTextContent(node: BuilderNode): string {
    const props = node.props
    return [
      getStringProp(props, "content"),
      getStringProp(props, "text"),
      getStringProp(props, "label"),
      getStringProp(props, "alt"),
    ]
      .filter(Boolean)
      .join(" ")
      .trim()
  }

  function collectContentStats(nodes: BuilderNode[]): {
    textContent: string
    wordCount: number
    mediaHealth: SeoPageStats["mediaHealth"]
    linkQuality: SeoPageStats["linkQuality"]
  } {
    const mediaHealth = {
      images: 0,
      missingAlt: 0,
      missingSrc: 0,
    }
    const linkQuality = {
      links: 0,
      missingHref: 0,
      emptyText: 0,
      externalNoRel: 0,
    }

    const chunks: string[] = []

    function walk(node: BuilderNode): void {
      const props = node.props
      const type = String(node.type || "").toLowerCase()

      const text = getNodeDirectTextContent(node)
      if (text) chunks.push(text)

      const isImage = type === "image" || type === "img"
      if (isImage) {
        mediaHealth.images += 1
        if (!getStringProp(props, "src").trim()) mediaHealth.missingSrc += 1
        if (!getStringProp(props, "alt").trim()) mediaHealth.missingAlt += 1
      }

      const isLink = type === "link" || type === "a"
      if (isLink) {
        linkQuality.links += 1
        const href = getStringProp(props, "href").trim()
        const label = [
          getStringProp(props, "text"),
          getStringProp(props, "content"),
          getStringProp(props, "label"),
        ]
          .filter(Boolean)
          .join(" ")
          .trim()

        if (!href) linkQuality.missingHref += 1
        if (!label) linkQuality.emptyText += 1

        const target = getStringProp(props, "target")
        const rel = getStringProp(props, "rel").toLowerCase()
        const external = /^https?:\/\//i.test(href)
        const missingSafeRel =
          target === "_blank" &&
          external &&
          (!rel.includes("noopener") || !rel.includes("noreferrer"))
        if (missingSafeRel) linkQuality.externalNoRel += 1
      }

      for (const child of node.children || []) {
        walk(child)
      }
    }

    for (const node of nodes) {
      walk(node)
    }

    const wordCount = chunks
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean).length

    return {
      textContent: chunks.join(" ").replace(/\s+/g, " ").trim(),
      wordCount,
      mediaHealth,
      linkQuality,
    }
  }

  const seoScore = computed(() => calculateSeoScore(seoData.value))
  const scoreStatus = computed(() => getScoreStatus(seoScore.value))
  const issues = computed(() => detectIssues(seoData.value))
  const criticalIssues = computed(() =>
    issues.value.filter((i) => i.type === "critical"),
  )
  const warningIssues = computed(() =>
    issues.value.filter((i) => i.type === "warning"),
  )

  const pageStats = computed<SeoPageStats>(() => {
    const contentStats = collectContentStats(pageNodes.value)
    const keywords = seoData.value.keywords ?? []

    if (!keywords.length || contentStats.wordCount === 0) {
      return {
        wordCount: contentStats.wordCount,
        keywordDensity: 0,
        mediaHealth: contentStats.mediaHealth,
        linkQuality: contentStats.linkQuality,
      }
    }

    const text = contentStats.textContent.toLowerCase()
    const topDensity =
      keywords
        .map((keyword) => {
          const escaped = keyword
            .toLowerCase()
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          const matches = text.match(new RegExp(`\\b${escaped}\\b`, "g")) || []
          return (matches.length / contentStats.wordCount) * 100
        })
        .sort((a, b) => b - a)[0] || 0

    return {
      wordCount: contentStats.wordCount,
      keywordDensity: Number(topDensity.toFixed(1)),
      mediaHealth: contentStats.mediaHealth,
      linkQuality: contentStats.linkQuality,
    }
  })

  async function refresh(): Promise<void> {
    const slug = getCurrentSlug()
    if (!slug) return

    const state = getOrCreateState(slug)
    const { seoData, persistedSeoData, pageNodes, isLoading, error } = state

    if (state.fetchPromise) {
      await state.fetchPromise
      return
    }

    isLoading.value = true
    error.value = null

    state.fetchPromise = (async () => {
      try {
        const result = await actions.pages.getMeta({ slug })
        const composeResult = await actions.compose({
          pageSlug: slug,
          itemType: "page",
        })

        const parsedMetaData = PageMetaActionResultSchema.safeParse(
          result?.data,
        )
        const parsedComposeData = ComposeActionResultSchema.safeParse(
          composeResult?.data,
        )

        if (!parsedMetaData.success) {
          log("warn", "[Studio/SEO] Invalid getMeta response", {
            slug,
            issues: parsedMetaData.error.issues,
          })
        }

        if (!parsedComposeData.success) {
          log("warn", "[Studio/SEO] Invalid compose response", {
            slug,
            issues: parsedComposeData.error.issues,
          })
        }

        if (parsedMetaData.success && parsedMetaData.data.success) {
          const normalizedSeo = normalizeSeoData(parsedMetaData.data.data)
          seoData.value = normalizedSeo
          persistedSeoData.value = cloneSeoData(normalizedSeo)
        }

        pageNodes.value = await expandSeoAnalysisNodes(
          parsedComposeData.success
            ? (parsedComposeData.data.pageBlocks ?? [])
            : [],
        )
      } catch (e) {
        error.value =
          e instanceof Error ? e.message : "Failed to load SEO data"
        log("warn", "[Studio/SEO] Fetch failed", {
          slug,
          error: e,
        })
      } finally {
        isLoading.value = false
        state.fetchPromise = null
      }
    })()

    await state.fetchPromise
  }

  function updateField<K extends keyof SeoData>(
    field: K,
    value: SeoData[K],
  ): void {
    const slug = getCurrentSlug()
    if (!slug) return
    const state = getOrCreateState(slug)
    state.seoData.value = { ...state.seoData.value, [field]: value }
  }

  async function save(): Promise<boolean> {
    const slug = getCurrentSlug()
    if (!slug) return false

    const state = getOrCreateState(slug)
    const { seoData, persistedSeoData, isSaving, error } = state

    isSaving.value = true
    error.value = null

    try {
      const previousSeo = cloneSeoData(persistedSeoData.value)
      const nextSeo = cloneSeoData(seoData.value)

      const historyResult = await recordSeoUpdate({
        slug,
        previousSeo,
        nextSeo,
        applySeo: async (targetSeo) => {
          seoData.value = cloneSeoData(targetSeo)
          persistedSeoData.value = cloneSeoData(targetSeo)
        },
      })

      if (!historyResult.success) {
        error.value = historyResult.error || "Failed to save SEO settings"
        return false
      }

      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error"
      return false
    } finally {
      isSaving.value = false
    }
  }

  function reset(): void {
    const slug = getCurrentSlug()
    if (!slug) return
    const state = getOrCreateState(slug)
    const { seoData, persistedSeoData, pageNodes, isLoading, isSaving, error } =
      state

    seoData.value = {}
    persistedSeoData.value = {}
    pageNodes.value = []
    isLoading.value = false
    isSaving.value = false
    error.value = null
    state.fetchPromise = null
  }

  watch(
    () => getCurrentSlug(),
    (slug) => {
      if (!slug) return
      const state = getOrCreateState(slug)
      if (
        !state.isLoading.value &&
        (Object.keys(state.seoData.value).length === 0 ||
          state.pageNodes.value.length === 0) &&
        !state.fetchPromise
      ) {
        refresh()
      }
    },
    { immediate: true },
  )

  return {
    seoData,
    isLoading,
    isSaving,
    error,
    seoScore,
    scoreStatus,
    issues,
    criticalIssues,
    warningIssues,
    pageStats,
    refresh,
    updateField,
    save,
    reset,
  }
}

export function clearSeoCache(pageSlug: string): void {
  stateCache.delete(pageSlug)
}

export function clearAllSeoCache(): void {
  stateCache.clear()
}
