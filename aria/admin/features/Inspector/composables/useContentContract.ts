export type { HeadingLevel, TextValue } from "../schemas/text.schema";

export {
  DEFAULT_HEADING_LEVEL,
  buildContentUpdates,
  buildContentValidationCandidate,
  getContentHeadingLevel,
  getContentValue,
  getTypographyTypeKey,
  isContentEditableType,
  isContentMultilineType,
  normalizeContentNodeType,
  normalizeHeadingLevel,
  parseHeadingLevelFromTagName,
  type ContentNodeLike,
} from "../../../../lib/blocks/contentContract";
