/**
 * Compatibility re-export. The Blocks feature owns the single component
 * definition cache used by canvas rendering.
 */
export {
  useComponentFetcher,
  commitComponentDefinition,
  invalidateComponentDefinition,
  componentDefinitionRevision,
} from "../features/Blocks/composables/useComponentFetcher";
