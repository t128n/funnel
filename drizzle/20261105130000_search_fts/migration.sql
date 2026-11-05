-- Full-text search over mirrored issue content. Drizzle cannot model SQLite
-- virtual tables, so this migration is written by hand. It is additive: the
-- existing mirror is untouched and the index is backfilled from it.
CREATE VIRTUAL TABLE `mirror_thread_fts` USING fts5(
	`title`,
	`body`,
	`comments`,
	`repo_id` UNINDEXED,
	`number` UNINDEXED,
	tokenize = 'porter unicode61'
);
--> statement-breakpoint
INSERT INTO `mirror_thread_fts` (`title`, `body`, `comments`, `repo_id`, `number`)
SELECT
	t.`title`,
	t.`body`,
	COALESCE(c.`comments`, ''),
	t.`repo_id`,
	t.`number`
FROM `mirror_thread` t
LEFT JOIN (
	SELECT
		`repo_id`,
		`thread_number`,
		group_concat(`body`, char(10)) AS `comments`
	FROM `mirror_comment`
	GROUP BY `repo_id`, `thread_number`
) c ON c.`repo_id` = t.`repo_id` AND c.`thread_number` = t.`number`;
