import {
  isAriaComponent,
  isLockedComponent,
  isProComponent,
} from "@/lib/schemas/nodes";

export interface PolicyComponentItem {
  id: string;
  source?: "custom" | "aria";
  tier?: "free" | "pro";
  isLocked?: boolean;
}

export interface ComponentBadge {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
  icon?: string;
}

export type ComponentAction = "edit" | "rename" | "delete" | "duplicate";

export function useComponentPolicies<TItem extends PolicyComponentItem>() {
  function isComponentAria(component: TItem): boolean {
    return isAriaComponent(component);
  }

  function isComponentLocked(component: TItem): boolean {
    return isLockedComponent(component);
  }

  function getSourceBadge(component: TItem): ComponentBadge | null {
    if (isComponentAria(component)) {
      return {
        label: "Aria",
        variant: "secondary",
        icon: "i-hugeicons:star",
      };
    }
    return null;
  }

  function getTierBadge(component: TItem): ComponentBadge | null {
    if (isProComponent(component)) {
      return {
        label: "Pro",
        variant: "default",
        icon: "i-hugeicons:crown",
      };
    }
    return null;
  }

  function getActionRestriction(
    component: TItem,
    action: ComponentAction,
  ): string | null {
    const locked = isComponentLocked(component);
    const aria = isComponentAria(component);

    switch (action) {
      case "edit":
        if (locked) return "This component is locked and cannot be edited";
        return null;
      case "rename":
        if (aria) return "Aria library components cannot be renamed";
        if (locked) return "This component is locked";
        return null;
      case "delete":
        if (aria) return "Aria library components cannot be deleted";
        if (locked) return "This component is locked";
        return null;
      case "duplicate":
        return null;
    }
  }

  return {
    isComponentAria,
    isComponentLocked,
    getSourceBadge,
    getTierBadge,
    getActionRestriction,
  };
}
