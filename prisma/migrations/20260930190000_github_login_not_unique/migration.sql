-- Sign-in matches users on githubId; a login is only a display name and can change hands.
-- DropIndex
DROP INDEX "User_githubLogin_key";

-- CreateIndex
CREATE INDEX "User_githubLogin_idx" ON "User"("githubLogin");
