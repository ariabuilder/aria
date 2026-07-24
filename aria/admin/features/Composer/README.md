# Composer

Editor shell for Aria — the chrome around the canvas while you edit pages,
layouts, and components. Import from `@/features/Composer`.

Navigation state lives in Core (`useAppRouter`). App.vue owns route sync,
draft leave guards, and which surfaces are visible. Composer renders the UI.

## Layout

```
components/   NavBar, Sidebar, Stage, canvas bar, panels, preloader
composables/  Loading, shortcuts, save/publish UI, component insert
schemas/      Quick-switch payloads
types/        Shell view and editing types
utils/        Tree diff helpers
```

## What it owns

| Piece | Role |
| ----- | ---- |
| `ComposerNavBar` | Left icon spine — Studio, Styles, Search, history, user |
| `ComposerSidebar` | Editing tabs: add elements, layers, components, agent |
| `ComposerStage` | Canvas host (`StageFrame`) or design-system stage |
| `ComposerCanvasControlBar` | Save / publish, viewport, previews |
| `ComposerQuickSwitch` | Jump between page / layout / component |
| `ComposerPanel` | Shared bordered panel wrapper |
| `Preloader` + `useAppLoading` | Boot phases before the shell is ready |

Also in this feature (mostly used by the sidebar / control bar): page and
component settings panels, component library insert, canvas options menu.

## Boundaries

- **Core** — app router, shell signals, injection keys
- **Stage / Design** — real canvas and design-system editing
- **Blocks / Layers / Agent / History** — plugged into the sidebar and nav
- **Beacon** — selection (`useBeacon`; re-exported as `useSelection` for now)
