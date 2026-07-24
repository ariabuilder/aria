# Blocks

Block library and component helpers for Composer. Import from `@/features/Blocks`.

This feature owns the add-elements picker, canvas element shells, and the
composables/dialogs for turning selections into reusable components. Studio’s
components browser lives under `features/Studio` — not here.

## Layout

```
components/   BlockLibrary (+ ComponentTreeItem, internal)
composables/  Registry, component CRUD/fetch, node → component
dialogs/      Create / pick component, migration alert
elements/     Primitive + container shells for the library
types/        Feature types
```

## Public API

| Export | Role |
| ------ | ---- |
| `BlockLibrary` | Draggable primitives and containers for the sidebar |
| `CreateComponentDialog` | Save a selection as a component |
| `ComponentPickerDialog` | Pick an existing component to insert |
| `MigrationAlert` | Component migration notice UI |
| `useBlockRegistry` | Cached component list / search |
| `useComponentActions` | Create, update, delete, duplicate via Astro Actions |
| `useComponentFetcher` | Fetch component DSL with caching |
| `useBlockData` | Convert a `BuilderNode` tree into a component |

## Library elements

What `BlockLibrary` actually exposes today:

- **Containers:** section, container, component instance
- **Primitives:** heading, text, button, image, video, icon, icon-list, svg,
  list, link, code, pagination, navigation

Node factories for lists, pagination, and navigation live in `aria/lib/blocks/`.
Shared node types live in `aria/lib/types/nodes.ts`.

## Boundaries

- Mutations go through Astro Actions and the storage adapter — no ad-hoc fetch
  or filesystem reads.
- Canvas drop / stage iframe wiring comes from Stage + Core injection keys.
- Do not grow this feature into a Studio components manager; that UI is Studio.
