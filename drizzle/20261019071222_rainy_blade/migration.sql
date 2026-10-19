CREATE TABLE `state_attachment` (
	`id` text PRIMARY KEY,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`issue_number` integer NOT NULL,
	`filename` text NOT NULL,
	`stored_path` text NOT NULL,
	`mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text DEFAULT '' NOT NULL,
	`uploaded_by_github_id` integer,
	`uploaded_by_login` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `state_work_note` (
	`id` text PRIMARY KEY,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`issue_number` integer NOT NULL,
	`author_github_id` integer,
	`author_login` text DEFAULT '' NOT NULL,
	`author_avatar_url` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_state_attachment_issue` ON `state_attachment` (`org`,`name`,`issue_number`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_state_work_note_issue` ON `state_work_note` (`org`,`name`,`issue_number`,`created_at`);