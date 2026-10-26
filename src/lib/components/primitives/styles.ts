import { cn } from "#lib/utils";

/**
 * Shared style recipes for the primitive layer.
 *
 * Every wrapper composes from these strings instead of repeating utilities, so
 * the visual contract lives in one place: 1px edges, 2px control radius, 4px
 * panel radius, flat token surfaces and an outline focus ring.
 */

/** Keyboard focus without a ring utility: a 2px outline on `--ring`. */
export const focusRing =
	"outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]";

/** Form control (input, textarea, native select): 28px tall, 1px `--input`. */
export const control = cn(
	"h-7 w-full min-w-0 rounded-xs border border-input bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60",
	focusRing
);

/** Popovers, dialogs, cards and sheets: 4px radius, 1px edge, soft shadow. */
export const panel = "rounded-lg border border-border bg-popover text-popover-foreground shadow-sm";

/** One flat menu row; highlight comes from the primitive's data attributes. */
export const menuItem =
	"flex w-full cursor-default items-center gap-2 rounded-none px-2 py-1.5 text-left text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

/** Small caps metadata label above a control or beside a value. */
export const labelText = "text-xs font-semibold text-muted-foreground";

/** The 16px muted chevron every trigger bakes in. */
export const triggerChevron = "size-4 shrink-0 text-muted-foreground";

const triggerSurface = {
	default: "border-input bg-background text-foreground hover:bg-muted",
	ghost:
		"border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
	pill: "h-6 w-fit border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
} as const;

/**
 * Canonical trigger geometry shared by `Select.Trigger`, `SingleSelect`,
 * `MultiSelect`, `PriorityPicker` and `MilestonePicker`, so every attribute
 * strip and filter toolbar reads as one family.
 *
 * Callers add layout (width) and value-dependent state themselves.
 */
export function triggerClass(
	variant: "default" | "ghost" | "pill" = "default",
	className?: string
): string {
	return cn(
		"flex h-7 min-w-0 shrink-0 items-center justify-between gap-1.5 rounded-xs border px-2 text-sm transition-colors select-none disabled:pointer-events-none disabled:opacity-60",
		focusRing,
		triggerSurface[variant],
		className
	);
}
