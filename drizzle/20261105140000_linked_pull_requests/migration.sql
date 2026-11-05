CREATE TABLE `mirror_issue_pull_request` (
	`repo_id` integer NOT NULL,
	`issue_number` integer NOT NULL,
	`pr_number` integer NOT NULL,
	`source` text DEFAULT 'closing' NOT NULL,
	CONSTRAINT `mirror_issue_pull_request_pk` PRIMARY KEY(`repo_id`, `issue_number`, `pr_number`),
	CONSTRAINT `fk_mirror_issue_pull_request_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `mirror_pull_request` (
	`repo_id` integer NOT NULL,
	`number` integer NOT NULL,
	`external_id` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'unknown' NOT NULL,
	`is_draft` integer DEFAULT 0 NOT NULL,
	`merged` integer DEFAULT 0 NOT NULL,
	`review_decision` text,
	`approved_count` integer DEFAULT 0 NOT NULL,
	`changes_requested_count` integer DEFAULT 0 NOT NULL,
	`pending_review_count` integer DEFAULT 0 NOT NULL,
	`checks_state` text,
	`checks_total` integer,
	`checks_failed` integer,
	`checks_url` text,
	`url` text DEFAULT '' NOT NULL,
	`author_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer,
	`merged_at` integer,
	CONSTRAINT `mirror_pull_request_pk` PRIMARY KEY(`repo_id`, `number`),
	CONSTRAINT `fk_mirror_pull_request_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_pull_request_author_id_mirror_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `mirror_user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE INDEX `idx_mirror_issue_pr_issue` ON `mirror_issue_pull_request` (`repo_id`,`issue_number`);--> statement-breakpoint
CREATE INDEX `idx_mirror_issue_pr_pull` ON `mirror_issue_pull_request` (`repo_id`,`pr_number`);--> statement-breakpoint
CREATE INDEX `idx_mirror_pull_request_repo_updated` ON `mirror_pull_request` (`repo_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_mirror_pull_request_checks` ON `mirror_pull_request` (`checks_state`);
