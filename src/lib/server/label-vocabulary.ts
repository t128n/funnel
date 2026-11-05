/**
 * Server-side access to the configured reserved-label vocabulary.
 *
 * `#lib/labels` stays dependency-free and pure; this module is the one place
 * that knows the vocabulary comes from instance settings. Keeping it separate
 * lets request handlers, the sync worker and write paths derive actual GitHub
 * names from the same prefix without duplicating the setting read.
 */
import {
  buildVocabulary,
  DEFAULT_VOCABULARY,
  type ReservedVocabulary,
} from "#lib/labels";
import { readSettings } from "#lib/server/settings/store";

/** The configured prefix, or `""` when settings cannot be read. */
export function configuredLabelPrefix(): string {
  try {
    return readSettings().labels.prefix;
  } catch {
    return "";
  }
}

/** The vocabularies actually used by this instance. */
export function configuredVocabulary(): ReservedVocabulary {
  const prefix = configuredLabelPrefix();
  return prefix ? buildVocabulary(prefix) : DEFAULT_VOCABULARY;
}

/** Build a vocabulary from an already-loaded config's `labels.prefix`. */
export function vocabularyFor(prefix: string | undefined): ReservedVocabulary {
  return prefix ? buildVocabulary(prefix) : DEFAULT_VOCABULARY;
}
