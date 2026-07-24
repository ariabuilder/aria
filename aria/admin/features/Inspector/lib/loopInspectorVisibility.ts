export interface LoopSourceProp {
  name: string;
  type: string;
}

export function isLoopSourceProp(prop: LoopSourceProp): boolean {
  return prop.name === "items" && prop.type === "array";
}

export function shouldShowLoopSourceSection(options: {
  isRepeatCapable: boolean;
  hasInheritedLoop: boolean;
}): boolean {
  return options.isRepeatCapable && !options.hasInheritedLoop;
}

export function shouldShowInheritedLoopBanner(options: {
  isRepeatCapable: boolean;
  hasInheritedLoop: boolean;
}): boolean {
  return options.isRepeatCapable && options.hasInheritedLoop;
}

export function shouldHideLoopSourceProp(
  prop: LoopSourceProp,
  showLoopSourceSection: boolean,
): boolean {
  return showLoopSourceSection && isLoopSourceProp(prop);
}
