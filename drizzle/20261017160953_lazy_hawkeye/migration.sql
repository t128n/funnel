CREATE TABLE `auth_account` (
	`id` text PRIMARY KEY,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_auth_account_userId_auth_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `auth_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `auth_session` (
	`id` text PRIMARY KEY,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	CONSTRAINT `fk_auth_session_userId_auth_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `auth_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `auth_user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE TABLE `mirror_github_comment` (
	`github_id` integer PRIMARY KEY,
	`repo_id` integer NOT NULL,
	`issue_number` integer NOT NULL,
	`author_id` integer,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_mirror_github_comment_author_id_mirror_github_user_github_id_fk` FOREIGN KEY (`author_id`) REFERENCES `mirror_github_user`(`github_id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `mirror_github_issue` (
	`repo_id` integer NOT NULL,
	`number` integer NOT NULL,
	`github_id` integer NOT NULL UNIQUE,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`state` text NOT NULL,
	`state_reason` text,
	`author_id` integer,
	`milestone_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer,
	`status` text,
	`priority` text,
	`size` text,
	`label_conflict` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `mirror_github_issue_pk` PRIMARY KEY(`repo_id`, `number`),
	CONSTRAINT `fk_mirror_github_issue_repo_id_mirror_github_repo_github_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_github_repo`(`github_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_github_issue_author_id_mirror_github_user_github_id_fk` FOREIGN KEY (`author_id`) REFERENCES `mirror_github_user`(`github_id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `mirror_github_issue_assignee` (
	`repo_id` integer NOT NULL,
	`issue_number` integer NOT NULL,
	`user_id` integer NOT NULL,
	CONSTRAINT `mirror_github_issue_assignee_pk` PRIMARY KEY(`repo_id`, `issue_number`, `user_id`),
	CONSTRAINT `fk_mirror_github_issue_assignee_user_id_mirror_github_user_github_id_fk` FOREIGN KEY (`user_id`) REFERENCES `mirror_github_user`(`github_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `mirror_github_issue_label` (
	`repo_id` integer NOT NULL,
	`issue_number` integer NOT NULL,
	`label_name` text NOT NULL,
	CONSTRAINT `mirror_github_issue_label_pk` PRIMARY KEY(`repo_id`, `issue_number`, `label_name`)
);
--> statement-breakpoint
CREATE TABLE `mirror_github_repo` (
	`github_id` integer PRIMARY KEY,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`etag` text,
	`archived` integer DEFAULT 0 NOT NULL,
	`degraded` integer DEFAULT 0 NOT NULL,
	`last_polled_at` integer,
	`last_reconciled_at` integer
);
--> statement-breakpoint
CREATE TABLE `mirror_github_repo_label` (
	`repo_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	CONSTRAINT `mirror_github_repo_label_pk` PRIMARY KEY(`repo_id`, `name`),
	CONSTRAINT `fk_mirror_github_repo_label_repo_id_mirror_github_repo_github_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_github_repo`(`github_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `mirror_github_user` (
	`github_id` integer PRIMARY KEY,
	`login` text NOT NULL UNIQUE,
	`avatar_url` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `state_intake_submission` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`source` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_account_user` ON `auth_account` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_auth_session_user` ON `auth_session` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_mirror_github_comment_issue` ON `mirror_github_comment` (`repo_id`,`issue_number`);--> statement-breakpoint
CREATE INDEX `idx_mirror_github_issue_status_updated` ON `mirror_github_issue` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_mirror_github_issue_priority_updated` ON `mirror_github_issue` (`priority`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_mirror_github_issue_state` ON `mirror_github_issue` (`state`,`state_reason`);--> statement-breakpoint
CREATE INDEX `idx_mirror_github_issue_repo_updated` ON `mirror_github_issue` (`repo_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_mirror_github_issue_assignee_user` ON `mirror_github_issue_assignee` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_mirror_github_issue_label_name` ON `mirror_github_issue_label` (`label_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mirror_github_repo_org_name` ON `mirror_github_repo` (`org`,`name`);