/**
 * Beacon feature exports (toast/status bus for the admin shell).
 */
export {
  useBeacon,
  onNodeFocused,
  requestFocus,
} from "./composables/useBeacon";

export type {
  BeaconState,
  BeaconSnapshot,
  NodeFocusedPayload,
  FocusRequestPayload,
  UseBeaconReturn,
} from "./types/beacon.types";
