CREATE TABLE `mirror_issue_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`repo_id` integer NOT NULL,
	`thread_number` integer NOT NULL,
	`external_id` text NOT NULL,
	`kind` text NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`actor_id` integer,
	`occurred_at` integer NOT NULL,
	`detail` text,
	CONSTRAINT `fk_mirror_issue_event_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_issue_event_actor_id_mirror_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `mirror_user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mirror_issue_event_external` ON `mirror_issue_event` (`repo_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_mirror_issue_event_issue` ON `mirror_issue_event` (`repo_id`,`thread_number`,`occurred_at`);