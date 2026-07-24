import {
  CalendarDate,
  getLocalTimeZone,
  Time,
  toCalendarDateTime,
  today,
} from "@internationalized/date";
import type { DateValue } from "@internationalized/date";
import { z } from "zod";

export const SCHEDULE_MIN_LEAD_MS = 60_000;
export const SCHEDULE_MAX_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export const ScheduleTimeInputSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$/, "Time must use HH:mm format");

export const ScheduleFormStateSchema = z
  .object({
    date: z.custom<DateValue>((value) => value != null),
    time: ScheduleTimeInputSchema,
  })
  .strict();

export const ScheduleQuickPickSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    iso: z.string().min(1),
  })
  .strict();

export type ScheduleFormState = z.infer<typeof ScheduleFormStateSchema>;
export type ScheduleQuickPick = z.infer<typeof ScheduleQuickPickSchema>;

const DEFAULT_SCHEDULE_HOUR = 9;
const DEFAULT_SCHEDULE_MINUTE = 0;

function localTimeZone(): string {
  return getLocalTimeZone();
}

function calendarDateAtTime(
  date: CalendarDate,
  hour: number,
  minute: number,
): Date {
  const dateTime = toCalendarDateTime(date, new Time(hour, minute));
  return dateTime.toDate(localTimeZone());
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function nextMondayFrom(reference: CalendarDate): CalendarDate {
  const weekday = reference.toDate(localTimeZone()).getDay();
  const daysUntilMonday = weekday === 0 ? 1 : weekday === 1 ? 7 : 8 - weekday;
  return reference.add({ days: daysUntilMonday });
}

export function formatScheduleDisplay(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function getScheduleTimezoneHint(): string {
  return (
    new Intl.DateTimeFormat(undefined, {
      timeZoneName: "long",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value ?? localTimeZone()
  );
}

export function parseScheduleDateTime(
  date: DateValue,
  time: string,
): string {
  const parsedTime = ScheduleTimeInputSchema.parse(time);
  const [hours, minutes] = parsedTime.split(":").map((part) => Number(part));
  const calendarDate =
    date instanceof CalendarDate
      ? date
      : new CalendarDate(
          date.year,
          date.month,
          date.day,
        );
  return calendarDateAtTime(calendarDate, hours, minutes).toISOString();
}

export function validateScheduleTime(iso: string): string | null {
  const targetMs = new Date(iso).getTime();
  if (Number.isNaN(targetMs)) {
    return "Enter a valid date and time.";
  }

  const minMs = Date.now() + SCHEDULE_MIN_LEAD_MS;
  if (targetMs <= minMs) {
    return "Schedule time must be at least 1 minute in the future.";
  }

  const maxMs = Date.now() + SCHEDULE_MAX_HORIZON_MS;
  if (targetMs > maxMs) {
    return "Schedule time must be within the next 2 years.";
  }

  return null;
}

export function getScheduleQuickPicks(): ScheduleQuickPick[] {
  const base = today(localTimeZone());
  const tomorrow = base.add({ days: 1 });
  const nextMonday = nextMondayFrom(base);

  const picks = [
    {
      id: "tomorrow-9am",
      label: "Tomorrow at 9:00 AM",
      iso: calendarDateAtTime(
        tomorrow,
        DEFAULT_SCHEDULE_HOUR,
        DEFAULT_SCHEDULE_MINUTE,
      ).toISOString(),
    },
    {
      id: "next-monday-9am",
      label: "Next Monday at 9:00 AM",
      iso: calendarDateAtTime(
        nextMonday,
        DEFAULT_SCHEDULE_HOUR,
        DEFAULT_SCHEDULE_MINUTE,
      ).toISOString(),
    },
  ];

  return picks
    .filter((pick) => validateScheduleTime(pick.iso) === null)
    .map((pick) => ScheduleQuickPickSchema.parse(pick));
}

export function defaultScheduleFormState(): ScheduleFormState {
  const tomorrow = today(localTimeZone()).add({ days: 1 });
  return ScheduleFormStateSchema.parse({
    date: tomorrow,
    time: `${String(DEFAULT_SCHEDULE_HOUR).padStart(2, "0")}:${String(
      DEFAULT_SCHEDULE_MINUTE,
    ).padStart(2, "0")}`,
  });
}

export function isoToScheduleFormState(iso: string): ScheduleFormState | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return ScheduleFormStateSchema.parse({
    date: new CalendarDate(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    ),
    time: `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`,
  });
}

export function minScheduleCalendarDate(reference = new Date()): CalendarDate {
  const minDate = new Date(reference.getTime() + SCHEDULE_MIN_LEAD_MS);
  return new CalendarDate(
    minDate.getFullYear(),
    minDate.getMonth() + 1,
    minDate.getDate(),
  );
}

export function maxScheduleCalendarDate(reference = new Date()): CalendarDate {
  const maxDate = new Date(reference.getTime() + SCHEDULE_MAX_HORIZON_MS);
  return new CalendarDate(
    maxDate.getFullYear(),
    maxDate.getMonth() + 1,
    maxDate.getDate(),
  );
}

export function isScheduleDateDisabled(
  date: DateValue,
  reference = new Date(),
): boolean {
  const jsDate = date.toDate(localTimeZone());
  const dayStart = startOfLocalDay(jsDate).getTime();
  const minDay = startOfLocalDay(
    new Date(reference.getTime() + SCHEDULE_MIN_LEAD_MS),
  ).getTime();
  const maxDay = startOfLocalDay(
    new Date(reference.getTime() + SCHEDULE_MAX_HORIZON_MS),
  ).getTime();
  return dayStart < minDay || dayStart > maxDay;
}
