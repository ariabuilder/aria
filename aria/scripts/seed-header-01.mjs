#!/usr/bin/env node
import { createClient } from "@libsql/client/node";

const ts = Date.now().toString();
const now = new Date().toISOString();
const version = "v" + ts;

const dsl = {
  id: "header-01",
  name: "Header 01",
  description:
    "Wireframe header with logo, dropdown navigation, and CTA buttons",
  category: "navigation",
  source: "custom",
  nodes: [
    {
      id: "h01-root",
      type: "Header",
      props: {},
      styles: {},
      classNames: { base: ["border-b", "border-gray-200", "bg-white"] },
      children: [
        {
          id: "h01-inner",
          type: "Container",
          props: {},
          styles: {},
          classNames: {
            base: [
              "max-w-7xl",
              "mx-auto",
              "px-6",
              "py-3",
              "flex",
              "items-center",
              "justify-between",
              "gap-8",
            ],
          },
          children: [
            {
              id: "h01-logo-link",
              type: "Link",
              props: { href: "/", content: "Brand" },
              styles: {},
              classNames: {
                base: ["text-lg", "font-bold", "text-gray-900", "no-underline"],
              },
              children: [],
            },
            {
              id: "h01-navigation",
              type: "navigation",
              props: {
                ariaLabel: "Main navigation",
                sourceMode: "cms",
                loopMode: "field",
                fieldPath: "items",
                direction: "horizontal",
                align: "start",
                submenuTrigger: "hover",
                submenuOpenDelay: 0,
                submenuCloseDelay: 150,
                mobileEnabled: true,
                mobileBreakpoint: "md",
                mobileMode: "drawer",
                mobileDrawerSide: "left",
                activeMatch: "prefix",
                builderKeepOpen: false,
              },
              styles: {},
              classNames: { base: ["flex", "items-center", "gap-0"] },
              dataSource: {
                type: "collection",
                collection: "main-nav",
                mode: "single",
                filter: { slug: "primary-navigation" },
              },
              children: [
                {
                  id: "h01-nav-items",
                  type: "nav-items",
                  props: {},
                  styles: {},
                  classNames: { base: [] },
                  dataSource: {
                    type: "static",
                    source: "field",
                    mode: "list",
                    field: "items",
                    entryScope: "context",
                  },
                  children: [
                    {
                      id: "h01-nav-item-template",
                      type: "nav-item",
                      props: { submenuType: "none", visibility: "all" },
                      styles: {},
                      classNames: { base: [] },
                      children: [
                        {
                          id: "h01-nav-item-link",
                          type: "link",
                          props: { text: "Menu item", href: "#" },
                          styles: {},
                          classNames: {
                            base: [
                              "px-3",
                              "py-2",
                              "text-sm",
                              "text-gray-600",
                              "hover:text-gray-900",
                              "no-underline",
                            ],
                          },
                          children: [],
                          dataSource: {
                            type: "static",
                            bindings: { text: "label", href: "link" },
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: "h01-nav-toggle",
                  type: "nav-toggle",
                  props: { variant: "open", ariaLabel: "Open menu" },
                  styles: {},
                  classNames: { base: [] },
                  children: [
                    {
                      id: "h01-nav-toggle-icon",
                      type: "icon",
                      props: { icon: "i-hugeicons:menu-01" },
                      styles: {},
                      classNames: { base: [] },
                      children: [],
                    },
                  ],
                },
              ],
            },
            {
              id: "h01-actions",
              type: "Container",
              props: {},
              styles: {},
              classNames: { base: ["flex", "items-center", "gap-2"] },
              children: [
                {
                  id: "h01-btn-signin",
                  type: "Button",
                  props: { label: "Sign In" },
                  styles: {},
                  classNames: {
                    base: [
                      "px-4",
                      "py-2",
                      "text-sm",
                      "text-gray-700",
                      "border",
                      "border-gray-300",
                      "rounded",
                      "hover:border-gray-400",
                      "hover:text-gray-900",
                      "bg-transparent",
                      "cursor-pointer",
                    ],
                  },
                  children: [],
                },
                {
                  id: "h01-btn-cta",
                  type: "Button",
                  props: { label: "Get Started" },
                  styles: {},
                  classNames: {
                    base: [
                      "px-4",
                      "py-2",
                      "text-sm",
                      "text-white",
                      "bg-gray-900",
                      "rounded",
                      "hover:bg-gray-700",
                      "cursor-pointer",
                      "border-0",
                    ],
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  settings: {},
  version: version,
  updatedAt: now,
};

const client = createClient({
  url: `file:${process.cwd()}/aria/storage/aria.db`,
});

await client.execute({
  sql: `INSERT OR REPLACE INTO aria_component_versions (id, version, name, category, dsl_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
  args: [
    "header-01",
    version,
    "Header 01",
    "navigation",
    JSON.stringify(dsl),
    now,
  ],
});

await client.execute({
  sql: `INSERT OR REPLACE INTO aria_component_meta (id, name, description, category, source, current_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
  args: [
    "header-01",
    "Header 01",
    "Wireframe header with logo, dropdown navigation, and CTA buttons",
    "navigation",
    "custom",
    version,
    now,
  ],
});

const check = await client.execute(
  `SELECT id, name, current_version FROM aria_component_meta WHERE id = 'header-01'`,
);
console.log("Header 01 inserted:", JSON.stringify(check.rows[0]));
client.close();
