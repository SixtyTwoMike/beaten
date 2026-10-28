-- AlterTable
ALTER TABLE "User" ADD COLUMN "usernameChangedAt" DATETIME;

-- CreateTable
CREATE TABLE "ReservedUsername" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "note" TEXT,
    "inviteHash" TEXT,
    "heldForUserId" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ReservedUsername_inviteHash_key" ON "ReservedUsername"("inviteHash");
