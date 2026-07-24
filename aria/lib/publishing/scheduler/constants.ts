import type { ActorRef } from "../../auth/types";
import { SYSTEM_ACTOR } from "../../auth/types";

export const SYSTEM_SCHEDULE_ACTOR: ActorRef = SYSTEM_ACTOR;

export const MAX_SCHEDULE_ATTEMPTS = 5;
export const LEASE_MS = 120_000;
export const BATCH_LIMIT = 50;
