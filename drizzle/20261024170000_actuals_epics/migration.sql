CREATE TABLE `state_issue_delay` (
	`id` text PRIMARY KEY,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`issue_number` integer NOT NULL,
	`reason` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`note` text DEFAULT '' NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `state_issue_event` (
	`id` text PRIMARY KEY,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`issue_number` integer NOT NULL,
	`kind` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`at` integer NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `mirror_thread` ADD `is_epic` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_state_issue_delay_issue_started` ON `state_issue_delay` (`org`,`name`,`issue_number`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_state_issue_delay_ended` ON `state_issue_delay` (`ended_at`);--> statement-breakpoint
CREATE INDEX `idx_state_issue_event_issue_at` ON `state_issue_event` (`org`,`name`,`issue_number`,`at`);
--> statement-breakpoint
INSERT INTO `state_issue_event` (`id`, `org`, `name`, `issue_number`, `kind`, `from_value`, `to_value`, `at`, `source`)
SELECT
	'baseline-' || t.`repo_id` || '-' || t.`number` || '-status',
	r.`org`, r.`name`, t.`number`, 'status', NULL, t.`status`,
	CAST(strftime('%s','now') AS INTEGER) * 1000, 'migration'
FROM `mirror_thread` t
INNER JOIN `mirror_repo` r ON r.`id` = t.`repo_id`;--> statement-breakpoint
INSERT INTO `state_issue_event` (`id`, `org`, `name`, `issue_number`, `kind`, `from_value`, `to_value`, `at`, `source`)
SELECT
	'baseline-' || t.`repo_id` || '-' || t.`number` || '-state',
	r.`org`, r.`name`, t.`number`, 'state', NULL, t.`state`,
	CAST(strftime('%s','now') AS INTEGER) * 1000, 'migration'
FROM `mirror_thread` t
INNER JOIN `mirror_repo` r ON r.`id` = t.`repo_id`;--> statement-breakpoint
INSERT INTO `state_issue_event` (`id`, `org`, `name`, `issue_number`, `kind`, `from_value`, `to_value`, `at`, `source`)
SELECT
	'baseline-' || t.`repo_id` || '-' || t.`number` || '-blocked',
	r.`org`, r.`name`, t.`number`, 'blocked', NULL,
	CASE WHEN t.`blocked` = 1 THEN 'true' ELSE 'false' END,
	CAST(strftime('%s','now') AS INTEGER) * 1000, 'migration'
FROM `mirror_thread` t
INNER JOIN `mirror_repo` r ON r.`id` = t.`repo_id`;--> statement-breakpoint
INSERT INTO `state_issue_delay` (`id`, `org`, `name`, `issue_number`, `reason`, `started_at`, `ended_at`, `note`, `source`)
SELECT
	'baseline-blocked-' || t.`repo_id` || '-' || t.`number`,
	r.`org`, r.`name`, t.`number`, 'other',
	CAST(strftime('%s','now') AS INTEGER) * 1000, NULL, '', 'blocked'
FROM `mirror_thread` t
INNER JOIN `mirror_repo` r ON r.`id` = t.`repo_id`
WHERE t.`blocked` = 1;
