import type { RouteRecordRaw } from "vue-router";
import { isFeatureEnabled } from "../../../lib/features";

const layoutRoutes: RouteRecordRaw[] = isFeatureEnabled("studio.layouts")
  ? [
      {
        path: "/layouts",
        component: () => import("./layouts/LayoutsView.vue"),
        meta: { section: "layouts", title: "Layouts" },
      },
      {
        path: "/layouts/new",
        component: () => import("./layouts/LayoutDetailView.vue"),
        meta: { section: "layouts", title: "New Layout", mode: "create" },
      },
      {
        path: "/layouts/:slug",
        component: () => import("./layouts/LayoutDetailView.vue"),
        meta: { section: "layouts", title: "Edit Layout", mode: "edit" },
      },
    ]
  : [
      { path: "/layouts", redirect: { path: "/dashboard" } },
      { path: "/layouts/new", redirect: { path: "/dashboard" } },
      { path: "/layouts/:slug", redirect: { path: "/dashboard" } },
    ];

export const studioRoutes: RouteRecordRaw[] = [
  // Redirect root to dashboard
  { path: "/", redirect: "/dashboard" },

  {
    path: "/onboarding",
    component: () => import("./onboarding/OnboardingView.vue"),
    meta: { section: "onboarding", title: "Welcome" },
  },

  {
    path: "/dashboard",
    component: () => import("./dashboard/DashboardView.vue"),
    meta: { section: "dashboard", title: "Dashboard" },
  },

  {
    path: "/pages",
    component: () => import("./pages/PagesView.vue"),
    meta: { section: "pages", title: "Pages" },
  },
  {
    path: "/pages/new",
    redirect: "/pages",
  },
  {
    path: "/pages/:slug",
    component: () => import("./pages/PageDetailView.vue"),
    meta: { section: "pages", title: "Edit Page", mode: "edit" },
  },

  ...layoutRoutes,

  // Components (builder blocks)
  {
    path: "/components",
    component: () => import("./components/ComponentsView.vue"),
    meta: { section: "components", title: "Components" },
  },
  {
    path: "/components/new",
    redirect: "/components",
  },
  {
    path: "/components/:slug",
    component: () => import("./components/ComponentDetailView.vue"),
    meta: { section: "components", title: "Edit Component", mode: "edit" },
  },

  // Collections (lazy from CMS feature)
  {
    path: "/collections",
    component: () =>
      import("../CMS/studio").then((module) => module.CmsWorkspaceView),
    meta: { section: "collections", title: "Collections", cmsDepth: 1 },
    children: [
      {
        path: "",
        component: () =>
          import("../CMS/studio").then((module) => module.CollectionsView),
        meta: { section: "collections", title: "Collections", cmsDepth: 1 },
      },
      {
        path: ":name/entries/:entrySlugOrId",
        name: "cms-entry-detail",
        component: () =>
          import("../CMS/studio").then((module) => module.EntryDetailView),
        meta: { section: "collections", title: "Entry", cmsDepth: 3 },
      },
      {
        path: ":name/schema",
        component: () =>
          import("../CMS/studio").then((module) => module.CollectionDetailView),
        meta: {
          section: "collections",
          title: "Collection Configure",
          cmsDepth: 2,
        },
      },
      {
        path: ":name/settings",
        component: () =>
          import("../CMS/studio").then((module) => module.CollectionDetailView),
        meta: {
          section: "collections",
          title: "Collection Configure",
          cmsDepth: 2,
        },
      },
      {
        path: ":name",
        component: () =>
          import("../CMS/studio").then((module) => module.CollectionDetailView),
        meta: { section: "collections", title: "Collection", cmsDepth: 2 },
      },
    ],
  },

  {
    path: "/media",
    component: () => import("./media/MediaView.vue"),
    meta: { section: "media", title: "Media" },
  },
  {
    path: "/media/:id",
    component: () => import("./media/MediaDetailView.vue"),
    meta: { section: "media", title: "Media Details" },
  },

  // Design (lazy from Design feature)
  {
    path: "/design",
    component: () => import("../Design/studio").then((m) => m.DesignView),
    meta: { section: "design", title: "Design" },
  },
];
