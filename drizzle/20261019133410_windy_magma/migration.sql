-- The pivot makes impact/urgency GitHub-authoritative labels. The previous
-- local state table cannot be mapped onto the new three-point label scales,
-- so it is dropped deliberately; re-assess via the Inspector (or add the
-- impact/urgency labels in GitHub) to restore a derived priority.

ALTER TABLE `mirror_github_issue` ADD `impact` integer;--> statement-breakpoint
ALTER TABLE `mirror_github_issue` ADD `urgency` integer;--> statement-breakpoint
ALTER TABLE `mirror_github_issue` ADD `priority` text;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_state_issue_priority_priority`;--> statement-breakpoint
CREATE INDEX `idx_mirror_github_issue_priority_updated` ON `mirror_github_issue` (`priority`,`updated_at`);--> statement-breakpoint
DROP TABLE `state_issue_priority`;