CREATE TABLE `state_issue_priority` (
	`org` text NOT NULL,
	`name` text NOT NULL,
	`issue_number` integer NOT NULL,
	`impact` integer,
	`urgency` integer,
	`priority` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `state_issue_priority_pk` PRIMARY KEY(`org`, `name`, `issue_number`)
);
--> statement-breakpoint
CREATE INDEX `idx_state_issue_priority_priority` ON `state_issue_priority` (`priority`,`updated_at`);--> statement-breakpoint
-- Seed the durable priority from the retired p-label projection so the board
-- does not change when the labels stop being authoritative. Rows created after
-- this migration are seeded on first sight by the priority store.
INSERT INTO `state_issue_priority` (`org`, `name`, `issue_number`, `impact`, `urgency`, `priority`, `created_at`, `updated_at`)
SELECT `r`.`org`, `r`.`name`, `i`.`number`, NULL, NULL,
	CASE lower(`i`.`priority`)
		WHEN 'p1' THEN 'P1'
		WHEN 'p2' THEN 'P2'
		WHEN 'p3' THEN 'P3'
	END,
	CAST(strftime('%s', 'now') AS INTEGER) * 1000,
	CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `mirror_github_issue` `i`
INNER JOIN `mirror_github_repo` `r` ON `r`.`github_id` = `i`.`repo_id`
WHERE lower(`i`.`priority`) IN ('p1', 'p2', 'p3');
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_mirror_github_issue_priority_updated`;
--> statement-breakpoint
ALTER TABLE `mirror_github_issue` DROP COLUMN `priority`;
