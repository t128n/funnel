/** Keep the index title line from turning every label into another line. */
export const MAX_INLINE_LABELS = 2;

export interface InlineLabels {
	shown: string[];
	/** Labels collapsed into a `+N` badge. */
	overflow: number;
}

export function inlineLabels(labels: readonly string[]): InlineLabels {
	const shown = labels.slice(0, MAX_INLINE_LABELS);
	return { shown, overflow: labels.length - shown.length };
}
