CREATE DATABASE IF NOT EXISTS `day_note` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `day_note`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `documents` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `content_json` json NOT NULL,
  `search_text` longtext NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_documents_user_id` (`user_id`),
  CONSTRAINT `fk_documents_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `blocks` (
  `id` varchar(36) NOT NULL,
  `document_id` varchar(36) NOT NULL,
  `block_type` varchar(50) NOT NULL,
  `position` int NOT NULL DEFAULT 0,
  `config` json NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_blocks_document_id` (`document_id`),
  CONSTRAINT `fk_blocks_document` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `records` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `block_id` varchar(36) DEFAULT NULL,
  `record_type` varchar(50) NOT NULL,
  `recorded_at` datetime NOT NULL,
  `payload` json NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_records_user_type` (`user_id`,`record_type`),
  CONSTRAINT `fk_records_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_records_block` FOREIGN KEY (`block_id`) REFERENCES `blocks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `expenses` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `category` varchar(50) NOT NULL,
  `description` varchar(255) NOT NULL DEFAULT '',
  `expense_time` datetime NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_expenses_user_time` (`user_id`,`expense_time`),
  CONSTRAINT `fk_expenses_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `moods` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `score` tinyint NOT NULL,
  `color` varchar(20) NOT NULL,
  `note` varchar(255) NOT NULL DEFAULT '',
  `recorded_at` datetime NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_moods_user_time` (`user_id`,`recorded_at`),
  CONSTRAINT `fk_moods_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `bristol_records` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `bristol_type` tinyint NOT NULL,
  `note` varchar(255) NOT NULL DEFAULT '',
  `recorded_at` datetime NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_bristol_user_time` (`user_id`,`recorded_at`),
  CONSTRAINT `fk_bristol_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `images` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `url` varchar(500) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `size` int NOT NULL DEFAULT 0,
  `width` int DEFAULT NULL,
  `height` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_images_user_id` (`user_id`),
  CONSTRAINT `fk_images_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `users` (`id`, `email`, `password_hash`, `created_at`)
VALUES ('demo-user', 'demo@example.com', 'development-only', UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE `email` = VALUES(`email`);
