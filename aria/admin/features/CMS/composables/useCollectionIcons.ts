import type { CollectionKind } from "../../../../lib/cms/constants";

function kindToIcon(kind: CollectionKind): string {
  switch (kind) {
    case "content":
      return "FileText";
    case "tags":
      return "Tag";
    case "data":
      return "Database";
    case "config":
      return "Settings";
    default:
      return "Database";
  }
}

export interface UseCollectionIconsReturn {
  getCollectionIcon: (iconName?: string) => string;
  getCollectionIconForKind: (kind: CollectionKind) => string;
}

export function useCollectionIcons(): UseCollectionIconsReturn {
  function getCollectionIcon(iconName?: string): string {
    const trimmed = iconName?.trim();
    if (trimmed?.startsWith("i-")) {
      return trimmed;
    }

    switch (iconName) {
      case "FileText":
        return "i-hugeicons:file-01";
      case "Users":
        return "i-hugeicons:user-group";
      case "Tag":
        return "i-hugeicons:tag-01";
      case "Calendar":
        return "i-hugeicons:calendar-01";
      case "Settings":
        return "i-hugeicons:settings-01";
      case "Image":
        return "i-hugeicons:image-01";
      case "Folder":
        return "i-hugeicons:folder-01";
      case "Globe":
        return "i-hugeicons:globe-02";
      case "Star":
        return "i-hugeicons:star";
      case "Database":
      default:
        return "i-hugeicons:database-01";
    }
  }

  function getCollectionIconForKind(kind: CollectionKind): string {
    return getCollectionIcon(kindToIcon(kind));
  }

  return {
    getCollectionIcon,
    getCollectionIconForKind,
  };
}
