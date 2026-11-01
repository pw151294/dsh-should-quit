-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `nickname` VARCHAR(64) NULL,
    `avatarUrl` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_openid_key`(`openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Baseline` (
    `userId` VARCHAR(191) NOT NULL,
    `salary` TINYINT NOT NULL,
    `commute` TINYINT NOT NULL,
    `overtime` TINYINT NOT NULL,
    `restTime` TINYINT NOT NULL,
    `workload` TINYINT NOT NULL,
    `stabilityBenefits` TINYINT NOT NULL,
    `growth` TINYINT NOT NULL,
    `contentFit` TINYINT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MoodCheckin` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `stars` TINYINT NOT NULL,
    `note` VARCHAR(200) NULL,
    `checkinDate` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MoodCheckin_userId_checkinDate_idx`(`userId`, `checkinDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScoreSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `snapshotDate` DATE NOT NULL,
    `objectiveScore` DECIMAL(5, 2) NOT NULL,
    `moodScore` DECIMAL(5, 2) NULL,
    `totalScore` TINYINT NOT NULL,
    `tier` ENUM('RUN', 'SEEK', 'WATCH', 'STAY') NOT NULL,
    `breakdown` JSON NOT NULL,
    `algoVersion` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ScoreSnapshot_userId_snapshotDate_key`(`userId`, `snapshotDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentConversation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `dshSessionId` VARCHAR(64) NOT NULL,
    `title` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AgentConversation_dshSessionId_key`(`dshSessionId`),
    INDEX `AgentConversation_userId_lastMessageAt_idx`(`userId`, `lastMessageAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentMessage` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `role` ENUM('USER', 'ASSISTANT') NOT NULL,
    `content` TEXT NOT NULL,
    `status` ENUM('COMPLETE', 'FAILED', 'INTERRUPTED') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentMessage_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
