CREATE TABLE `mirror_github_milestone` (
	`repo_id` integer NOT NULL,
	`number` integer NOT NULL,
	`github_id` integer DEFAULT 0 NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`due_on` integer,
	`open_issues` integer DEFAULT 0 NOT NULL,
	`closed_issues` integer DEFAULT 0 NOT NULL,
	`creator_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer,
	`html_url` text DEFAULT '' NOT NULL,
	CONSTRAINT `mirror_github_milestone_pk` PRIMARY KEY(`repo_id`, `number`),
	CONSTRAINT `fk_mirror_github_milestone_repo_id_mirror_github_repo_github_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_github_repo`(`github_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_github_milestone_creator_id_mirror_github_user_github_id_fk` FOREIGN KEY (`creator_id`) REFERENCES `mirror_github_user`(`github_id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `mirror_github_issue` ADD `milestone_number` integer;--> statement-breakpoint
CREATE INDEX `idx_mirror_github_issue_milestone` ON `mirror_github_issue` (`repo_id`,`milestone_number`);--> statement-breakpoint
ALTER TABLE `mirror_github_issue` DROP COLUMN `milestone_name`;