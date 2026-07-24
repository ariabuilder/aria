import { computed, ref, watch, type Ref } from "vue";

import { useBuilderData } from "@/composables/useBuilderData";
import { collectPageAnchorTargets } from "@/lib/blocks/collectPageAnchorTargets";
import { normalizeDomId, validateDomId } from "@/lib/blocks/domId";
import type { BuilderNode } from "@/lib/types/nodes";
import {
  getSecureRel,
  type LinkScope,
  type LinkTarget,
} from "../schemas/link.schema";
import { usePropertySchema } from "./usePropertySchema";
import { useStudioI18n } from "@/i18n";

export type LinkMode =
  | "none"
  | "page"
  | "url"
  | "media"
  | "anchor"
  | "email"
  | "phone"
  | "collection";

export interface LinkFormState {
  mode: LinkMode;
  pageHref: string;
  urlHref: string;
  mediaHref: string;
  mediaLabel: string;
  anchorId: string;
  emailAddress: string;
  emailSubject: string;
  phoneNumber: string;
  openInNewTab: boolean;
  rel: string;
  title: string;
  downloadEnabled: boolean;
  linkScope: LinkScope;
}

export interface LinkPayload {
  href: string;
  target?: LinkTarget;
  rel?: string;
  title?: string;
  download?: boolean;
  linkScope?: LinkScope;
}

export interface LinkableMediaAsset {
  deliveryUrl?: string | null;
  url: string;
  name: string;
}

type PageRootNodesValue = { value: readonly BuilderNode[] };
type LinkFormBuilderData = {
  pages: {
    value: Array<{
      title?: string;
      slug: string;
    }>;
  };
};

export const LINK_MODE_OPTIONS: Array<{ value: LinkMode; label: string }> = [
  { value: "none", label: "None" },
  { value: "page", label: "Page" },
  { value: "url", label: "URL" },
  { value: "media", label: "Media" },
  { value: "collection", label: "Collection" },
  { value: "anchor", label: "Anchor" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

export function useLinkPropertyForm(
  selectedNode: Readonly<Ref<BuilderNode | null | undefined>>,
  options: {
    defaultScope?: LinkScope;
    pageRootNodes?: Readonly<Ref<readonly BuilderNode[]>>;
  } = {},
) {
  const getBuilderData = useBuilderData as unknown as () => LinkFormBuilderData;
  const builderData = getBuilderData();
  const { t } = useStudioI18n();
  const { safeParse } = usePropertySchema();
  const pageRootNodes =
    (options.pageRootNodes as PageRootNodesValue | undefined) ??
    (ref([]) as PageRootNodesValue);

  const pages = computed(() =>
    [...builderData.pages.value].sort((left, right) =>
      (left.title || left.slug).localeCompare(right.title || right.slug),
    ),
  );

  const form = ref<LinkFormState>(createEmptyFormState());
  const validationError = ref<string | null>(null);
  const isMediaPickerOpen = ref(false);
  const isPagePickerOpen = ref(false);
  const isAnchorPickerOpen = ref(false);
  const pageSearchQuery = ref("");
  const anchorSearchQuery = ref("");
  const anchorValidationError = ref<string | null>(null);

  const hasLinkChanges = computed(() => {
    return (
      form.value.pageHref.trim().length > 0 ||
      form.value.urlHref.trim().length > 0 ||
      form.value.mediaHref.trim().length > 0 ||
      form.value.anchorId.trim().length > 0 ||
      form.value.emailAddress.trim().length > 0 ||
      form.value.emailSubject.trim().length > 0 ||
      form.value.phoneNumber.trim().length > 0 ||
      form.value.openInNewTab ||
      form.value.rel.trim().length > 0 ||
      form.value.title.trim().length > 0 ||
      form.value.downloadEnabled
    );
  });

  const filteredPages = computed(() => {
    const query = pageSearchQuery.value.trim().toLowerCase();
    if (!query) {
      return pages.value;
    }

    return pages.value.filter((page) => {
      const title = (page.title || "").toLowerCase();
      const slug = (page.slug || "").toLowerCase();
      const href = getPageHref(page.slug).toLowerCase();
      return (
        title.includes(query) || slug.includes(query) || href.includes(query)
      );
    });
  });

  const selectedPageOption = computed(
    () =>
      pages.value.find(
        (page) => getPageHref(page.slug) === form.value.pageHref,
      ) ?? null,
  );

  const selectedPageLabel = computed(() => {
    if (!selectedPageOption.value) {
      return t("inspector.link.selectPage");
    }

    return selectedPageOption.value.title || selectedPageOption.value.slug;
  });

  const selectedPagePath = computed(() =>
    selectedPageOption.value ? getPageHref(selectedPageOption.value.slug) : "",
  );

  const mediaButtonLabel = computed(
    () =>
      form.value.mediaLabel ||
      form.value.mediaHref ||
      t("inspector.link.chooseMedia"),
  );

  const hasSelectedLinkMode = computed(() => form.value.mode !== "none");
  const hasConfiguredHref = computed(
    () => serializeLinkState().href.trim().length > 0,
  );

  const showOpenInNewTab = computed(
    () =>
      form.value.mode === "url" ||
      (hasConfiguredHref.value && form.value.mode === "page") ||
      (hasConfiguredHref.value && form.value.mode === "media"),
  );

  const showDownload = computed(
    () => hasConfiguredHref.value && form.value.mode === "media",
  );

  const showRelField = computed(
    () =>
      form.value.mode === "url" ||
      (hasConfiguredHref.value && form.value.mode === "page") ||
      (hasConfiguredHref.value && form.value.mode === "media"),
  );

  const showTitleField = computed(
    () => form.value.mode === "url" || hasConfiguredHref.value,
  );

  const shouldCollectAnchorOptions = computed(
    () => form.value.mode === "anchor" || isAnchorPickerOpen.value,
  );

  const pageAnchorOptions = computed(() => {
    if (!shouldCollectAnchorOptions.value) {
      return [];
    }

    return collectPageAnchorTargets(pageRootNodes.value);
  });

  const normalizedAnchorSearchQuery = computed(() =>
    normalizeDomId(anchorSearchQuery.value),
  );

  const filteredAnchorOptions = computed(() => {
    const query = normalizedAnchorSearchQuery.value.toLowerCase();
    if (!query) {
      return pageAnchorOptions.value;
    }

    return pageAnchorOptions.value.filter((anchor) => {
      const id = anchor.id.toLowerCase();
      const label = anchor.label.toLowerCase();
      return id.includes(query) || label.includes(query);
    });
  });

  const selectedAnchorOption = computed(
    () =>
      pageAnchorOptions.value.find(
        (anchor) => anchor.id === normalizeDomId(form.value.anchorId),
      ) ?? null,
  );

  const selectedAnchorTriggerLabel = computed(() => {
    const anchorId = normalizeDomId(form.value.anchorId);
    return anchorId || t("inspector.anchor.select");
  });

  const selectedAnchorSubtitle = computed(() => {
    if (selectedAnchorOption.value) {
      return selectedAnchorOption.value.label;
    }

    const anchorId = normalizeDomId(form.value.anchorId);
    if (anchorId) {
      return t("inspector.anchor.custom");
    }

    return "";
  });

  const showCustomAnchorOption = computed(() => {
    const query = normalizedAnchorSearchQuery.value;
    if (!query) {
      return false;
    }

    return !pageAnchorOptions.value.some((anchor) => anchor.id === query);
  });

  const relTokens = computed(() => new Set(parseRelTokens(form.value.rel)));
  const relNoOpenerEnabled = computed(() => relTokens.value.has("noopener"));
  const relNoReferrerEnabled = computed(() =>
    relTokens.value.has("noreferrer"),
  );
  const relNoFollowEnabled = computed(() => relTokens.value.has("nofollow"));

  watch(
    selectedNode,
    (node) => {
      const props = node?.props ?? {};
      const href = typeof props.href === "string" ? props.href : "";
      const target = normalizeTarget(props.target);
      const rel = typeof props.rel === "string" ? props.rel : "";
      const title = typeof props.title === "string" ? props.title : "";
      const download = props.download === true;
      const linkScope = normalizeLinkScope(props.linkScope);

      form.value = deserializeLinkState({
        href,
        target,
        rel,
        title,
        download,
        linkScope,
      });
    },
    { deep: true, immediate: true },
  );

  watch(isPagePickerOpen, (isOpen) => {
    if (!isOpen) {
      pageSearchQuery.value = "";
    }
  });

  watch(isAnchorPickerOpen, (isOpen) => {
    if (!isOpen) {
      anchorSearchQuery.value = "";
      anchorValidationError.value = null;
    }
  });

  function setMode(value: unknown): LinkMode | null {
    if (typeof value !== "string") return null;

    const nextMode = LINK_MODE_OPTIONS.find(
      (option) => option.value === value,
    )?.value;
    if (!nextMode) return null;

    if (nextMode === "none") {
      const nextState = createEmptyFormState();
      nextState.linkScope = form.value.linkScope;
      form.value = nextState;
      return nextMode;
    }

    form.value.mode = nextMode;
    if (nextMode === "media") {
      isMediaPickerOpen.value = true;
    }

    return nextMode;
  }

  function setPageHref(value: string): void {
    form.value.pageHref = value;
    pageSearchQuery.value = "";
    isPagePickerOpen.value = false;
  }

  function setAnchorId(raw: string, options: { fromList?: boolean } = {}): boolean {
    const normalized = normalizeDomId(raw);
    anchorValidationError.value = null;

    if (!normalized) {
      form.value.anchorId = "";
      anchorSearchQuery.value = "";
      isAnchorPickerOpen.value = false;
      return true;
    }

    const isListed = options.fromList ||
      pageAnchorOptions.value.some((anchor) => anchor.id === normalized);

    if (!isListed) {
      const validation = validateDomId(normalized);
      if (!validation.valid) {
        anchorValidationError.value =
          validation.error ?? t("inspector.validation.invalidSectionId");
        return false;
      }
    }

    form.value.anchorId = normalized;
    anchorSearchQuery.value = "";
    isAnchorPickerOpen.value = false;
    return true;
  }

  function setMediaAsset(asset: LinkableMediaAsset): void {
    const url = asset.deliveryUrl || asset.url;
    form.value.mediaHref = url;
    form.value.mediaLabel = asset.name;
  }

  function clearMediaSelection(): void {
    form.value.mediaHref = "";
    form.value.mediaLabel = "";
  }

  function setBooleanField(
    field: "openInNewTab" | "downloadEnabled",
    value: boolean,
  ): void {
    form.value[field] = value;
  }

  function setRelToken(
    token: "noopener" | "noreferrer" | "nofollow",
    enabled: boolean,
  ): void {
    const nextTokens = new Set(parseRelTokens(form.value.rel));

    if (enabled) {
      nextTokens.add(token);
    } else {
      nextTokens.delete(token);
    }

    form.value.rel = Array.from(nextTokens).join(" ");
  }

  function setLinkScope(value: unknown): LinkScope | null {
    const nextScope = normalizeLinkScope(value);
    if (!nextScope) {
      return null;
    }

    form.value.linkScope = nextScope;
    return nextScope;
  }

  function serializeLinkState(state: LinkFormState = form.value): LinkPayload {
    let href = "";

    switch (state.mode) {
      case "none":
        href = "";
        break;
      case "page":
        href = state.pageHref.trim();
        break;
      case "url":
        href = state.urlHref.trim();
        break;
      case "media":
        href = state.mediaHref.trim();
        break;
      case "anchor":
        href = state.anchorId.trim()
          ? `#${state.anchorId.trim().replace(/^#/, "")}`
          : "";
        break;
      case "email":
        href = buildMailtoHref(state.emailAddress, state.emailSubject);
        break;
      case "phone":
        href = state.phoneNumber.trim()
          ? `tel:${state.phoneNumber.trim()}`
          : "";
        break;
      case "collection":
        href = "";
        break;
    }

    const target = state.openInNewTab ? "_blank" : undefined;
    const rel =
      state.rel.trim() || getSecureRel(href, target ?? "_self") || undefined;
    const title = state.title.trim() || undefined;
    const download =
      state.mode === "media" && state.downloadEnabled ? true : undefined;

    return {
      href,
      target,
      rel,
      title,
      download,
      linkScope: state.linkScope,
    };
  }

  function validatePayload(payload: LinkPayload): boolean {
    const result = safeParse("link", {
      href: payload.href,
      target: payload.target ?? "_self",
      rel: payload.rel,
      title: payload.title,
      download: payload.download,
      linkScope: payload.linkScope,
    });

    const valid = "success" in result && result.success;
    if (!valid) {
      validationError.value = t("inspector.validation.invalidLink");
      return false;
    }

    validationError.value = null;
    return true;
  }

  function resetForm(): void {
    validationError.value = null;
    anchorValidationError.value = null;
    pageSearchQuery.value = "";
    anchorSearchQuery.value = "";
    isPagePickerOpen.value = false;
    isAnchorPickerOpen.value = false;
    isMediaPickerOpen.value = false;
    form.value = createEmptyFormState();
  }

  function shouldPersistLinkState(state: LinkFormState = form.value): boolean {
    if (state.mode === "none" || state.mode === "collection") {
      return true;
    }

    return serializeLinkState(state).href.trim().length > 0;
  }

  return {
    form,
    validationError,
    anchorValidationError,
    isMediaPickerOpen,
    isPagePickerOpen,
    isAnchorPickerOpen,
    pageSearchQuery,
    anchorSearchQuery,
    hasLinkChanges,
    filteredPages,
    selectedPageOption,
    selectedPageLabel,
    selectedPagePath,
    mediaButtonLabel,
    pageAnchorOptions,
    filteredAnchorOptions,
    selectedAnchorOption,
    selectedAnchorTriggerLabel,
    selectedAnchorSubtitle,
    showCustomAnchorOption,
    normalizedAnchorSearchQuery,
    hasSelectedLinkMode,
    hasConfiguredHref,
    showOpenInNewTab,
    showDownload,
    showRelField,
    showTitleField,
    relNoOpenerEnabled,
    relNoReferrerEnabled,
    relNoFollowEnabled,
    getPageHref,
    setMode,
    setPageHref,
    setAnchorId,
    setMediaAsset,
    clearMediaSelection,
    setBooleanField,
    setRelToken,
    setLinkScope,
    serializeLinkState,
    validatePayload,
    shouldPersistLinkState,
    resetForm,
  };

  function createEmptyFormState(): LinkFormState {
    return {
      mode: "none",
      pageHref: "",
      urlHref: "",
      mediaHref: "",
      mediaLabel: "",
      anchorId: "",
      emailAddress: "",
      emailSubject: "",
      phoneNumber: "",
      openInNewTab: false,
      rel: "",
      title: "",
      downloadEnabled: false,
      linkScope: options.defaultScope ?? "text",
    };
  }

  function getPageHref(slug: string): string {
    return slug === "index" ? "/" : `/${slug}`;
  }

  function normalizeTarget(value: unknown): LinkTarget {
    return value === "_blank" || value === "_parent" || value === "_top"
      ? value
      : "_self";
  }

  function inferLinkMode(href: string): LinkMode {
    if (!href) return "none";
    if (href.startsWith("mailto:")) return "email";
    if (href.startsWith("tel:")) return "phone";
    if (href.startsWith("#")) return "anchor";

    const isKnownPage = pages.value.some(
      (page) => getPageHref(page.slug) === href,
    );
    if (isKnownPage) return "page";

    if (isLikelyMediaHref(href)) return "media";
    return "url";
  }

  function isLikelyMediaHref(href: string): boolean {
    return /\.(pdf|png|jpg|jpeg|gif|svg|webp|mp4|webm|mov|doc|docx|zip)$/i.test(
      href,
    );
  }

  function deserializeLinkState(input: {
    href: string;
    target: LinkTarget;
    rel: string;
    title: string;
    download: boolean;
    linkScope?: LinkScope;
  }): LinkFormState {
    const next = createEmptyFormState();
    const mode = inferLinkMode(input.href);

    next.mode = mode;
    next.openInNewTab = input.target === "_blank";
    next.rel = input.rel;
    next.title = input.title;
    next.downloadEnabled = input.download;
    next.linkScope = input.linkScope ?? next.linkScope;

    if (mode === "none") {
      return next;
    }

    if (mode === "page") {
      next.pageHref = input.href;
      return next;
    }

    if (mode === "url") {
      next.urlHref = input.href;
      return next;
    }

    if (mode === "media") {
      next.mediaHref = input.href;
      next.mediaLabel = input.href.split("/").pop() || input.href;
      return next;
    }

    if (mode === "anchor") {
      next.anchorId = input.href.replace(/^#/, "");
      return next;
    }

    if (mode === "email") {
      const [addressPart, queryPart] = input.href
        .replace(/^mailto:/, "")
        .split("?");
      next.emailAddress = decodeURIComponent(addressPart || "");
      if (queryPart) {
        const params = new URLSearchParams(queryPart);
        next.emailSubject = params.get("subject") || "";
      }
      return next;
    }

    next.phoneNumber = input.href.replace(/^tel:/, "");
    return next;
  }

  function normalizeLinkScope(value: unknown): LinkScope | undefined {
    return value === "row" || value === "text" ? value : undefined;
  }

  function buildMailtoHref(email: string, subject: string): string {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return "";
    const params = new URLSearchParams();
    if (subject.trim()) {
      params.set("subject", subject.trim());
    }

    const query = params.toString();
    return `mailto:${trimmedEmail}${query ? `?${query}` : ""}`;
  }

  function parseRelTokens(value: string): string[] {
    return Array.from(
      new Set(
        value
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(Boolean),
      ),
    );
  }
}
