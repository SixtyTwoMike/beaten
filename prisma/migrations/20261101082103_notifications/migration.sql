-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "playLogId" TEXT NOT NULL,
    "commentId" TEXT,
    "reaction" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    "emailedAt" DATETIME,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_playLogId_fkey" FOREIGN KEY ("playLogId") REFERENCES "PlayLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "pendingUsername" TEXT,
    "usernameChangedAt" DATETIME,
    "name" TEXT,
    "passwordHash" TEXT,
    "image" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "emailVerifiedAt" DATETIME,
    "instagram" TEXT,
    "bluesky" TEXT,
    "avatarGameId" TEXT,
    "avatarSource" TEXT,
    "avatarX" REAL NOT NULL DEFAULT 50,
    "avatarY" REAL NOT NULL DEFAULT 50,
    "avatarZoom" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifyComments" TEXT NOT NULL DEFAULT 'instant',
    "notifyReactions" TEXT NOT NULL DEFAULT 'daily',
    "followersSeenAt" DATETIME,
    CONSTRAINT "User_avatarGameId_fkey" FOREIGN KEY ("avatarGameId") REFERENCES "Game" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarGameId", "avatarSource", "avatarX", "avatarY", "avatarZoom", "bluesky", "createdAt", "email", "emailVerifiedAt", "followersSeenAt", "id", "image", "instagram", "name", "passwordHash", "pendingUsername", "tokenVersion", "username", "usernameChangedAt") SELECT "avatarGameId", "avatarSource", "avatarX", "avatarY", "avatarZoom", "bluesky", "createdAt", "email", "emailVerifiedAt", "followersSeenAt", "id", "image", "instagram", "name", "passwordHash", "pendingUsername", "tokenVersion", "username", "usernameChangedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_emailedAt_readAt_idx" ON "Notification"("emailedAt", "readAt");

-- CreateIndex
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
