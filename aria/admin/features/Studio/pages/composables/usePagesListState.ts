import { ref, computed } from "vue"
import type { ComputedRef, Ref } from "vue"
import type { Page } from "@/composables/useBuilderData"
import { resolvePublicPagePath } from "../../../../../lib/pages/publicPaths"
import { useStudioI18n } from "@/i18n"

export type PagesFilter =
  | "all"
  | "published"
  | "draft"
  | "scheduled"
  | "archived"
  | "modified"
export type PagesSortKey = "name" | "slug" | "description" | "status" | "updated" | "visits"
export type PagesSortDirection = "asc" | "desc"
export interface PagesSort {
  key: PagesSortKey
  direction: PagesSortDirection
}

export interface PageTreeNode {
  page: Page
  depth: number
  hasChildren: boolean
  path: string
}

export interface PagesListStateReturn {
  searchQuery: Ref<string>
  activeFilter: Ref<PagesFilter>
  sortBy: Ref<PagesSort>
  currentPage: Ref<number>
  pageSize: number
  pageTree: ComputedRef<PageTreeNode[]>
  filteredTree: ComputedRef<PageTreeNode[]>
  paginatedTree: ComputedRef<PageTreeNode[]>
  totalPages: ComputedRef<number>
  counts: ComputedRef<Record<PagesFilter, number>>
  filters: ComputedRef<Array<{ key: PagesFilter; label: string; count: number }>>
}

export interface UsePagesListStateOptions {
  visitsBySlug?: Ref<Record<string, number>>;
  trafficSortEnabled?: Ref<boolean>;
}

export function usePagesListState(
  pages: Ref<readonly Page[]>,
  initialPageSize = 20,
  options: UsePagesListStateOptions = {},
): PagesListStateReturn {
  const { t } = useStudioI18n()
  const searchQuery = ref("")
  const activeFilter = ref<PagesFilter>("all")
  const sortBy = ref<PagesSort>({ key: "updated", direction: "desc" })
  const currentPage = ref(1)
  const pageSize = initialPageSize

  const pageTree = computed<PageTreeNode[]>(() => {
    const all = pages.value
    const tree: PageTreeNode[] = []
    const childrenByParent = new Map<string | null, Page[]>()
    for (const p of all) {
      const parent = p.parent ?? null
      if (!childrenByParent.has(parent)) childrenByParent.set(parent, [])
      childrenByParent.get(parent)!.push(p)
    }

    function append(parentSlug: string | null, depth: number) {
      const children = childrenByParent.get(parentSlug) ?? []
      for (const p of children) {
        tree.push({
          page: p,
          depth,
          hasChildren: (childrenByParent.get(p.slug)?.length ?? 0) > 0,
          path: resolvePublicPagePath(p.slug, all),
        })
        append(p.slug, depth + 1)
      }
    }
    append(null, 0)

    const orphaned = all.filter((p) => p.parent && !childrenByParent.get(p.parent)?.some((c) => c.slug === p.parent))
    for (const p of orphaned) {
      if (!tree.find((t) => t.page.id === p.id)) {
        tree.push({ page: p, depth: 0, hasChildren: false, path: resolvePublicPagePath(p.slug, all) })
      }
    }
    return tree
  })

  const filteredTree = computed(() => {
    let result = [...pageTree.value]

    if (activeFilter.value === "modified") {
      result = result.filter((t) => t.page.status === "published" && t.page.isModifiedSincePublish)
    } else if (activeFilter.value !== "all") {
      result = result.filter((t) => t.page.status === activeFilter.value)
    }

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      result = result.filter((t) =>
        t.page.title.toLowerCase().includes(q) ||
        t.page.slug.toLowerCase().includes(q) ||
        (t.page.description ?? "").toLowerCase().includes(q),
      )
    }

    const { key: sortKey, direction } = sortBy.value
    const multiplier = direction === "asc" ? 1 : -1
    const visitsMap = options.visitsBySlug?.value
    const pinIndex = sortKey !== "visits"
    result.sort((a, b) => {
      if (pinIndex) {
        if (a.page.slug === "index") return -1
        if (b.page.slug === "index") return 1
      }
      if (a.page.systemRole === "not-found" && b.page.systemRole !== "not-found") return 1
      if (a.page.systemRole !== "not-found" && b.page.systemRole === "not-found") return -1
      if (sortKey === "visits" && visitsMap) {
        const av = visitsMap[a.page.slug] ?? 0
        const bv = visitsMap[b.page.slug] ?? 0
        if (av !== bv) return (av - bv) * multiplier
        return (a.page.title || "").localeCompare(b.page.title || "")
      }
      if (sortKey === "name") return (a.page.title || "").localeCompare(b.page.title || "") * multiplier
      if (sortKey === "slug") return a.page.slug.localeCompare(b.page.slug) * multiplier
      if (sortKey === "description") {
        return (a.page.description ?? "").localeCompare(b.page.description ?? "") * multiplier
      }
      if (sortKey === "status") return a.page.status.localeCompare(b.page.status) * multiplier
      return (a.page.updatedAt || "").localeCompare(b.page.updatedAt || "") * multiplier
    })

    return result
  })

  const totalPages = computed(() => Math.ceil(filteredTree.value.length / pageSize))
  const paginatedTree = computed(() => {
    const start = (currentPage.value - 1) * pageSize
    return filteredTree.value.slice(start, start + pageSize)
  })

  const counts = computed<Record<PagesFilter, number>>(() => {
    let published = 0, draft = 0, scheduled = 0, archived = 0, modified = 0
    for (const p of pages.value) {
      if (p.status === "published") {
        published++
        if (p.isModifiedSincePublish) modified++
      } else if (p.status === "scheduled") {
        scheduled++
      } else if (p.status === "archived") {
        archived++
      } else {
        draft++
      }
    }
    return {
      all: pages.value.length,
      published,
      draft,
      scheduled,
      archived,
      modified,
    }
  })

  const filters = computed(() => [
    { key: "all" as PagesFilter, label: t("pages.filter.all"), count: counts.value.all },
    { key: "published" as PagesFilter, label: t("pages.filter.published"), count: counts.value.published },
    { key: "draft" as PagesFilter, label: t("pages.filter.draft"), count: counts.value.draft },
    { key: "scheduled" as PagesFilter, label: t("pages.filter.scheduled"), count: counts.value.scheduled },
    { key: "archived" as PagesFilter, label: t("pages.filter.archived"), count: counts.value.archived },
    { key: "modified" as PagesFilter, label: t("pages.filter.modified"), count: counts.value.modified },
  ])

  return {
    searchQuery,
    activeFilter,
    sortBy,
    currentPage,
    pageSize,
    pageTree,
    filteredTree,
    paginatedTree,
    totalPages,
    counts,
    filters,
  }
}
