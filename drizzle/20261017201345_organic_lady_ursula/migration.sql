CREATE TABLE `mirror_github_repo_assignee` (
	`repo_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	CONSTRAINT `mirror_github_repo_assignee_pk` PRIMARY KEY(`repo_id`, `user_id`),
	CONSTRAINT `fk_mirror_github_repo_assignee_repo_id_mirror_github_repo_github_id_fk` FOREIGN KEY (`repo_id`) REFERENCES `mirror_github_repo`(`github_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_github_repo_assignee_user_id_mirror_github_user_github_id_fk` FOREIGN KEY (`user_id`) REFERENCES `mirror_github_user`(`github_id`) ON DELETE CASCADE
);
