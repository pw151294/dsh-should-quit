-- 身份列改为二进制排序：区分大小写、不忽略尾随空格（唯一索引随列保留）
ALTER TABLE `User` MODIFY `openid` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE `AgentConversation` MODIFY `dshSessionId` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
