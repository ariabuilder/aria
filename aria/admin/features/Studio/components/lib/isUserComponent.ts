import type { Component } from "@/composables/useBuilderData";

export function isUserComponent(component: Component): boolean {
  return component.source !== "aria";
}
