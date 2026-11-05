CREATE TABLE `mirror_issue_relation` (
	`repo_id` integer NOT NULL,
	`issue_number` integer NOT NULL,
	`kind` text NOT NULL,
	`target_repo` text NOT NULL,
	`target_number` integer NOT NULL,
	`target_title` text DEFAULT '' NOT NULL,
	`target_state` text DEFAULT 'open' NOT NULL,
	`target_url` text DEFAULT '' NOT NULL,
	CONSTRAINT `mirror_issue_relation_pk` PRIMARY KEY(`repo_id`, `issue_number`, `kind`, `target_repo`, `target_number`),
	CONSTRAINT `fk_mirror_issue_relation_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_mirror_issue_relation_issue` ON `mirror_issue_relation` (`repo_id`,`issue_number`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_mirror_issue_relation_target` ON `mirror_issue_relation` (`target_repo`,`target_number`);