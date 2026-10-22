-- The GitHub-shaped mirror is disposable: drop it child-first and recreate it
-- forge-neutral. Durable Funnel state is rebuilt, copying GitHub authors into
-- forge-neutral external ids.
DROP TABLE IF EXISTS `mirror_github_issue_label`;--> statement-breakpoint
DROP TABLE IF EXISTS `mirror_github_issue_assignee`;--> statement-breakpoint
DROP TABLE IF EXISTS `mirror_github_comment`;--> statement-breakpoint
DROP TABLE IF EXISTS `mirror_github_issue`;--> statement-breakpoint
DROP TABLE IF EXISTS `mirror_github_milestone`;--> statement-breakpoint
DROP TABLE IF EXISTS `mirror_github_repo_label`;--> statement-breakpoint
DROP TABLE IF EXISTS `mirror_github_repo_assignee`;--> statement-breakpoint
DROP TABLE IF EXISTS `mirror_github_user`;--> statement-breakpoint
DROP TABLE IF EXISTS `mirror_github_repo`;--> statement-breakpoint
CREATE TABLE `state_work_note_new` (
	`id` text PRIMARY KEY,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`issue_number` integer NOT NULL,
	`author_external_id` text,
	`author_forge` text NOT NULL,
	`author_instance` text NOT NULL,
	`author_login` text DEFAULT '' NOT NULL,
	`author_avatar_url` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `state_work_note_new` (
	`id`, `org`, `name`, `issue_number`,
	`author_external_id`, `author_forge`, `author_instance`,
	`author_login`, `author_avatar_url`, `body`, `created_at`, `updated_at`
)
SELECT
	`id`, `org`, `name`, `issue_number`,
	CAST(`author_github_id` AS TEXT), 'github', '',
	`author_login`, `author_avatar_url`, `body`, `created_at`, `updated_at`
FROM `state_work_note`;--> statement-breakpoint
DROP TABLE `state_work_note`;--> statement-breakpoint
ALTER TABLE `state_work_note_new` RENAME TO `state_work_note`;--> statement-breakpoint
CREATE INDEX `idx_state_work_note_issue` ON `state_work_note` (`org`,`name`,`issue_number`,`created_at`);--> statement-breakpoint
CREATE TABLE `state_attachment_new` (
	`id` text PRIMARY KEY,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`issue_number` integer NOT NULL,
	`filename` text NOT NULL,
	`stored_path` text NOT NULL,
	`mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text DEFAULT '' NOT NULL,
	`uploaded_by_external_id` text,
	`uploaded_by_forge` text NOT NULL,
	`uploaded_by_instance` text NOT NULL,
	`uploaded_by_login` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `state_attachment_new` (
	`id`, `org`, `name`, `issue_number`, `filename`, `stored_path`,
	`mime_type`, `size_bytes`, `sha256`,
	`uploaded_by_external_id`, `uploaded_by_forge`, `uploaded_by_instance`,
	`uploaded_by_login`, `created_at`
)
SELECT
	`id`, `org`, `name`, `issue_number`, `filename`, `stored_path`,
	`mime_type`, `size_bytes`, `sha256`,
	CAST(`uploaded_by_github_id` AS TEXT), 'github', '',
	`uploaded_by_login`, `created_at`
FROM `state_attachment`;--> statement-breakpoint
DROP TABLE `state_attachment`;--> statement-breakpoint
ALTER TABLE `state_attachment_new` RENAME TO `state_attachment`;--> statement-breakpoint
CREATE INDEX `idx_state_attachment_issue` ON `state_attachment` (`org`,`name`,`issue_number`,`created_at`);--> statement-breakpoint
CREATE TABLE `mirror_repo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`forge` text NOT NULL,
	`instance` text NOT NULL,
	`external_id` text NOT NULL,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`etag` text,
	`archived` integer DEFAULT 0 NOT NULL,
	`degraded` integer DEFAULT 0 NOT NULL,
	`last_polled_at` integer,
	`last_reconciled_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mirror_repo_external` ON `mirror_repo` (`forge`,`instance`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mirror_repo_slug` ON `mirror_repo` (`forge`,`instance`,`org`,`name`);--> statement-breakpoint
CREATE TABLE `mirror_user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`forge` text NOT NULL,
	`instance` text NOT NULL,
	`external_id` text NOT NULL,
	`login` text NOT NULL,
	`avatar_url` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mirror_user_external` ON `mirror_user` (`forge`,`instance`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mirror_user_login` ON `mirror_user` (`forge`,`instance`,`login`);--> statement-breakpoint
CREATE TABLE `mirror_milestone` (
	`repo_id` integer NOT NULL,
	`number` integer NOT NULL,
	`external_id` text DEFAULT '' NOT NULL,
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
	`url` text DEFAULT '' NOT NULL,
	CONSTRAINT `mirror_milestone_pk` PRIMARY KEY(`repo_id`, `number`),
	CONSTRAINT `fk_mirror_milestone_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_milestone_creator_id_mirror_user_id_fk` FOREIGN KEY (`creator_id`) REFERENCES `mirror_user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `mirror_thread` (
	`repo_id` integer NOT NULL,
	`number` integer NOT NULL,
	`external_id` text NOT NULL,
	`kind` text DEFAULT 'issue' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`state` text NOT NULL,
	`state_reason` text,
	`author_id` integer,
	`milestone_number` integer,
	`url` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer,
	`status` text,
	`priority` text,
	`size` text,
	`blocked` integer DEFAULT 0 NOT NULL,
	`label_conflict` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `mirror_thread_pk` PRIMARY KEY(`repo_id`, `number`),
	CONSTRAINT `fk_mirror_thread_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_thread_author_id_mirror_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `mirror_user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mirror_thread_external` ON `mirror_thread` (`repo_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_mirror_thread_status_updated` ON `mirror_thread` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_mirror_thread_priority_updated` ON `mirror_thread` (`priority`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_mirror_thread_state` ON `mirror_thread` (`state`,`state_reason`);--> statement-breakpoint
CREATE INDEX `idx_mirror_thread_repo_updated` ON `mirror_thread` (`repo_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_mirror_thread_milestone` ON `mirror_thread` (`repo_id`,`milestone_number`);--> statement-breakpoint
CREATE TABLE `mirror_repo_label` (
	`repo_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	CONSTRAINT `mirror_repo_label_pk` PRIMARY KEY(`repo_id`, `name`),
	CONSTRAINT `fk_mirror_repo_label_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `mirror_thread_label` (
	`repo_id` integer NOT NULL,
	`thread_number` integer NOT NULL,
	`label_name` text NOT NULL,
	CONSTRAINT `mirror_thread_label_pk` PRIMARY KEY(`repo_id`, `thread_number`, `label_name`),
	CONSTRAINT `fk_mirror_thread_label_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_mirror_thread_label_name` ON `mirror_thread_label` (`label_name`);--> statement-breakpoint
CREATE TABLE `mirror_thread_assignee` (
	`repo_id` integer NOT NULL,
	`thread_number` integer NOT NULL,
	`user_id` integer NOT NULL,
	CONSTRAINT `mirror_thread_assignee_pk` PRIMARY KEY(`repo_id`, `thread_number`, `user_id`),
	CONSTRAINT `fk_mirror_thread_assignee_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_thread_assignee_user_id_mirror_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `mirror_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_mirror_thread_assignee_user` ON `mirror_thread_assignee` (`user_id`);--> statement-breakpoint
CREATE TABLE `mirror_repo_assignee` (
	`repo_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	CONSTRAINT `mirror_repo_assignee_pk` PRIMARY KEY(`repo_id`, `user_id`),
	CONSTRAINT `fk_mirror_repo_assignee_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_repo_assignee_user_id_mirror_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `mirror_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `mirror_comment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_id` integer NOT NULL,
	`thread_number` integer NOT NULL,
	`external_id` text NOT NULL,
	`author_id` integer,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_mirror_comment_repo_id_mirror_repo_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_repo`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_comment_author_id_mirror_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `mirror_user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mirror_comment_external` ON `mirror_comment` (`repo_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_mirror_comment_thread` ON `mirror_comment` (`repo_id`,`thread_number`);
