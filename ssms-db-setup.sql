-- ==========================================
-- SQL Server setup & migration script for SSMS
-- Fully non-destructive & idempotent:
-- 1. Safely creates tables matching server.js API spec if they don't exist
-- 2. Safely adds any missing columns (ALTER TABLE) if tables already exist
-- 3. Alters columns that might be NOT NULL in older schemas to allow NULL
-- 4. Inserts initial seed data matching string IDs (u1, p-1, etc.)
-- ==========================================

-- ------------------------------------------
-- 1. Master Tables
-- ------------------------------------------
IF OBJECT_ID('dbo.OfficeMaster', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.OfficeMaster (
        id VARCHAR(50) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        type VARCHAR(50) NULL,
        code VARCHAR(50) NULL,
        location NVARCHAR(255) NULL,
        phone NVARCHAR(50) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.OfficeMaster', 'type') IS NULL ALTER TABLE dbo.OfficeMaster ADD type VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.OfficeMaster', 'code') IS NULL ALTER TABLE dbo.OfficeMaster ADD code VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.OfficeMaster', 'location') IS NULL ALTER TABLE dbo.OfficeMaster ADD location NVARCHAR(255) NULL;
    IF COL_LENGTH('dbo.OfficeMaster', 'phone') IS NULL ALTER TABLE dbo.OfficeMaster ADD phone NVARCHAR(50) NULL;
END
GO

IF OBJECT_ID('dbo.DivisionMaster', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DivisionMaster (
        id VARCHAR(50) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        code VARCHAR(50) NULL,
        description NVARCHAR(255) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.DivisionMaster', 'code') IS NULL ALTER TABLE dbo.DivisionMaster ADD code VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.DivisionMaster', 'description') IS NULL ALTER TABLE dbo.DivisionMaster ADD description NVARCHAR(255) NULL;
END
GO

IF OBJECT_ID('dbo.PositionMaster', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PositionMaster (
        id VARCHAR(50) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        code VARCHAR(50) NULL,
        description NVARCHAR(255) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.PositionMaster', 'code') IS NULL ALTER TABLE dbo.PositionMaster ADD code VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.PositionMaster', 'description') IS NULL ALTER TABLE dbo.PositionMaster ADD description NVARCHAR(255) NULL;
END
GO

-- ------------------------------------------
-- 1b. Synonyms for Backend API Compatibility
-- ------------------------------------------
-- Create synonyms so that requests from the backend API to dbo.Offices, dbo.Divisions, dbo.Positions
-- are transparently mapped to dbo.OfficeMaster, dbo.DivisionMaster, dbo.PositionMaster in SQL Server.
IF NOT EXISTS (SELECT * FROM sys.synonyms WHERE name = 'Offices' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE SYNONYM dbo.Offices FOR dbo.OfficeMaster;
END
GO

IF NOT EXISTS (SELECT * FROM sys.synonyms WHERE name = 'Divisions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE SYNONYM dbo.Divisions FOR dbo.DivisionMaster;
END
GO

IF NOT EXISTS (SELECT * FROM sys.synonyms WHERE name = 'Positions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE SYNONYM dbo.Positions FOR dbo.PositionMaster;
END
GO


IF OBJECT_ID('dbo.ItemMasters', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ItemMasters (
        id VARCHAR(50) PRIMARY KEY,
        name NVARCHAR(200) NOT NULL,
        category NVARCHAR(100) NULL,
        defaultUnitPrice INT DEFAULT 0,
        unit NVARCHAR(50) NULL,
        code VARCHAR(50) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.ItemMasters', 'category') IS NULL ALTER TABLE dbo.ItemMasters ADD category NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.ItemMasters', 'defaultUnitPrice') IS NULL ALTER TABLE dbo.ItemMasters ADD defaultUnitPrice INT DEFAULT 0;
    IF COL_LENGTH('dbo.ItemMasters', 'unit') IS NULL ALTER TABLE dbo.ItemMasters ADD unit NVARCHAR(50) NULL;
    IF COL_LENGTH('dbo.ItemMasters', 'code') IS NULL ALTER TABLE dbo.ItemMasters ADD code VARCHAR(50) NULL;
END
GO

IF OBJECT_ID('dbo.ApprovalFlows', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApprovalFlows (
        id VARCHAR(50) PRIMARY KEY,
        name NVARCHAR(200) NOT NULL,
        description NVARCHAR(MAX) NULL,
        targetApplicationType VARCHAR(50) NULL,
        stepsJson NVARCHAR(MAX) NULL,
        isDefault BIT DEFAULT 0
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.ApprovalFlows', 'description') IS NULL ALTER TABLE dbo.ApprovalFlows ADD description NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.ApprovalFlows', 'targetApplicationType') IS NULL ALTER TABLE dbo.ApprovalFlows ADD targetApplicationType VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.ApprovalFlows', 'stepsJson') IS NULL ALTER TABLE dbo.ApprovalFlows ADD stepsJson NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.ApprovalFlows', 'isDefault') IS NULL ALTER TABLE dbo.ApprovalFlows ADD isDefault BIT DEFAULT 0;
END
GO

-- ------------------------------------------
-- 2. Users Table
-- ------------------------------------------
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id VARCHAR(50) PRIMARY KEY,
        loginId VARCHAR(50) NULL,
        password VARCHAR(100) NULL,
        name NVARCHAR(100) NOT NULL,
        department NVARCHAR(100) NULL,
        avatarUrl NVARCHAR(500) NULL,
        office NVARCHAR(100) NULL,
        division NVARCHAR(100) NULL,
        position NVARCHAR(100) NULL,
        role VARCHAR(50) DEFAULT 'user',
        isAdmin BIT DEFAULT 0,
        supervisorId VARCHAR(50) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.Users', 'loginId') IS NULL ALTER TABLE dbo.Users ADD loginId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Users', 'password') IS NULL ALTER TABLE dbo.Users ADD password VARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Users', 'avatarUrl') IS NULL ALTER TABLE dbo.Users ADD avatarUrl NVARCHAR(500) NULL;
    IF COL_LENGTH('dbo.Users', 'department') IS NULL ALTER TABLE dbo.Users ADD department NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Users', 'office') IS NULL ALTER TABLE dbo.Users ADD office NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Users', 'division') IS NULL ALTER TABLE dbo.Users ADD division NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Users', 'position') IS NULL ALTER TABLE dbo.Users ADD position NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Users', 'role') IS NULL ALTER TABLE dbo.Users ADD role VARCHAR(50) DEFAULT 'user';
    IF COL_LENGTH('dbo.Users', 'isAdmin') IS NULL ALTER TABLE dbo.Users ADD isAdmin BIT DEFAULT 0;
    IF COL_LENGTH('dbo.Users', 'supervisorId') IS NULL ALTER TABLE dbo.Users ADD supervisorId VARCHAR(50) NULL;
END
GO

-- ------------------------------------------
-- 3. Posts & PostTags Tables (Timeline)
-- ------------------------------------------
IF OBJECT_ID('dbo.Posts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Posts (
        id VARCHAR(50) PRIMARY KEY,
        authorId VARCHAR(50) NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        createdAt DATETIME DEFAULT GETDATE(),
        likes INT DEFAULT 0,
        nasLink NVARCHAR(500) NULL,
        tags NVARCHAR(500) NULL,
        isLiked BIT DEFAULT 0
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.Posts', 'authorId') IS NULL ALTER TABLE dbo.Posts ADD authorId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Posts', 'content') IS NULL ALTER TABLE dbo.Posts ADD content NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.Posts', 'createdAt') IS NULL ALTER TABLE dbo.Posts ADD createdAt DATETIME DEFAULT GETDATE();
    IF COL_LENGTH('dbo.Posts', 'likes') IS NULL ALTER TABLE dbo.Posts ADD likes INT DEFAULT 0;
    IF COL_LENGTH('dbo.Posts', 'nasLink') IS NULL ALTER TABLE dbo.Posts ADD nasLink NVARCHAR(500) NULL;
    IF COL_LENGTH('dbo.Posts', 'tags') IS NULL ALTER TABLE dbo.Posts ADD tags NVARCHAR(500) NULL;
    IF COL_LENGTH('dbo.Posts', 'isLiked') IS NULL ALTER TABLE dbo.Posts ADD isLiked BIT DEFAULT 0;
END
GO

IF OBJECT_ID('dbo.PostTags', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PostTags (
        postId VARCHAR(50) NOT NULL,
        tag NVARCHAR(100) NOT NULL
    );
END
GO

-- ------------------------------------------
-- 4. Events Table (Calendar)
-- ------------------------------------------
IF OBJECT_ID('dbo.Events', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Events (
        id VARCHAR(50) PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        startAt DATETIME2 NOT NULL,
        endAt DATETIME2 NOT NULL,
        isAllDay BIT DEFAULT 0,
        category NVARCHAR(50) NULL,
        description NVARCHAR(MAX) NULL,
        location NVARCHAR(255) NULL,
        office NVARCHAR(100) NULL,
        division NVARCHAR(100) NULL,
        attachments NVARCHAR(MAX) NULL,
        recurrence NVARCHAR(MAX) NULL,
        recurrenceParentId VARCHAR(50) NULL,
        recurrenceOriginalDate VARCHAR(50) NULL,
        recurrenceExceptions NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.Events', 'startAt') IS NULL ALTER TABLE dbo.Events ADD startAt DATETIME2 NULL;
    IF COL_LENGTH('dbo.Events', 'endAt') IS NULL ALTER TABLE dbo.Events ADD endAt DATETIME2 NULL;
    IF COL_LENGTH('dbo.Events', 'isAllDay') IS NULL ALTER TABLE dbo.Events ADD isAllDay BIT DEFAULT 0;
    IF COL_LENGTH('dbo.Events', 'category') IS NULL ALTER TABLE dbo.Events ADD category NVARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Events', 'description') IS NULL ALTER TABLE dbo.Events ADD description NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.Events', 'location') IS NULL ALTER TABLE dbo.Events ADD location NVARCHAR(255) NULL;
    IF COL_LENGTH('dbo.Events', 'office') IS NULL ALTER TABLE dbo.Events ADD office NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Events', 'division') IS NULL ALTER TABLE dbo.Events ADD division NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Events', 'attachments') IS NULL ALTER TABLE dbo.Events ADD attachments NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.Events', 'recurrence') IS NULL ALTER TABLE dbo.Events ADD recurrence NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.Events', 'recurrenceParentId') IS NULL ALTER TABLE dbo.Events ADD recurrenceParentId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Events', 'recurrenceOriginalDate') IS NULL ALTER TABLE dbo.Events ADD recurrenceOriginalDate VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Events', 'recurrenceExceptions') IS NULL ALTER TABLE dbo.Events ADD recurrenceExceptions NVARCHAR(MAX) NULL;
    
    -- isGoogleSynced / isIcal を NULL許容に変更（NOT NULL制約によるINSERTエラー防止）
    IF COL_LENGTH('dbo.Events', 'isGoogleSynced') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.Events ALTER COLUMN isGoogleSynced BIT NULL;
    END
    IF COL_LENGTH('dbo.Events', 'isIcal') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.Events ALTER COLUMN isIcal BIT NULL;
    END
END
GO

-- ------------------------------------------
-- 5. Workflows Table
-- ------------------------------------------
IF OBJECT_ID('dbo.Workflows', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Workflows (
        id VARCHAR(50) PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        applicantId VARCHAR(50) NOT NULL,
        approverId VARCHAR(50) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT N'承認待ち',
        createdAt DATETIME DEFAULT GETDATE(),
        category NVARCHAR(50) NULL,
        type NVARCHAR(50) NULL,
        details NVARCHAR(MAX) NULL,
        description NVARCHAR(MAX) NULL,
        attachments NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.Workflows', 'applicantId') IS NULL ALTER TABLE dbo.Workflows ADD applicantId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Workflows', 'approverId') IS NULL ALTER TABLE dbo.Workflows ADD approverId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Workflows', 'status') IS NULL ALTER TABLE dbo.Workflows ADD status NVARCHAR(50) DEFAULT N'承認待ち';
    IF COL_LENGTH('dbo.Workflows', 'createdAt') IS NULL ALTER TABLE dbo.Workflows ADD createdAt DATETIME DEFAULT GETDATE();
    IF COL_LENGTH('dbo.Workflows', 'category') IS NULL ALTER TABLE dbo.Workflows ADD category NVARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Workflows', 'type') IS NULL ALTER TABLE dbo.Workflows ADD type NVARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Workflows', 'details') IS NULL ALTER TABLE dbo.Workflows ADD details NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.Workflows', 'attachments') IS NULL ALTER TABLE dbo.Workflows ADD attachments NVARCHAR(MAX) NULL;
    
    -- Ensure description is added and is nullable (to fix any NOT NULL constraint issue)
    IF COL_LENGTH('dbo.Workflows', 'description') IS NULL
    BEGIN
        ALTER TABLE dbo.Workflows ADD description NVARCHAR(MAX) NULL;
    END
    ELSE
    BEGIN
        ALTER TABLE dbo.Workflows ALTER COLUMN description NVARCHAR(MAX) NULL;
    END

    -- Relax constraint on type if it exists in legacy schema
    IF COL_LENGTH('dbo.Workflows', 'type') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.Workflows ALTER COLUMN type NVARCHAR(50) NULL;
    END
END
GO

-- ------------------------------------------
-- 6. Bulletins Table (Board)
-- ------------------------------------------
IF OBJECT_ID('dbo.Bulletins', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Bulletins (
        id VARCHAR(50) PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        authorId VARCHAR(50) NOT NULL,
        createdAt DATETIME DEFAULT GETDATE(),
        category NVARCHAR(50) NULL,
        isPinned BIT DEFAULT 0,
        views INT DEFAULT 0,
        likes INT DEFAULT 0,
        office NVARCHAR(100) NULL,
        division NVARCHAR(100) NULL,
        scope NVARCHAR(50) DEFAULT N'全社',
        tags NVARCHAR(500) NULL,
        attachments NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.Bulletins', 'authorId') IS NULL ALTER TABLE dbo.Bulletins ADD authorId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Bulletins', 'createdAt') IS NULL ALTER TABLE dbo.Bulletins ADD createdAt DATETIME DEFAULT GETDATE();
    IF COL_LENGTH('dbo.Bulletins', 'category') IS NULL ALTER TABLE dbo.Bulletins ADD category NVARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Bulletins', 'isPinned') IS NULL ALTER TABLE dbo.Bulletins ADD isPinned BIT DEFAULT 0;
    IF COL_LENGTH('dbo.Bulletins', 'views') IS NULL ALTER TABLE dbo.Bulletins ADD views INT DEFAULT 0;
    IF COL_LENGTH('dbo.Bulletins', 'likes') IS NULL ALTER TABLE dbo.Bulletins ADD likes INT DEFAULT 0;
    IF COL_LENGTH('dbo.Bulletins', 'office') IS NULL ALTER TABLE dbo.Bulletins ADD office NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Bulletins', 'division') IS NULL ALTER TABLE dbo.Bulletins ADD division NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Bulletins', 'scope') IS NULL ALTER TABLE dbo.Bulletins ADD scope NVARCHAR(50) DEFAULT N'全社';
    IF COL_LENGTH('dbo.Bulletins', 'tags') IS NULL ALTER TABLE dbo.Bulletins ADD tags NVARCHAR(500) NULL;
    IF COL_LENGTH('dbo.Bulletins', 'attachments') IS NULL ALTER TABLE dbo.Bulletins ADD attachments NVARCHAR(MAX) NULL;
END
GO

-- ------------------------------------------
-- 6b. BoardComments Table
-- ------------------------------------------
IF OBJECT_ID('dbo.BoardComments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BoardComments (
        id VARCHAR(50) PRIMARY KEY,
        topicId VARCHAR(50) NULL,
        bulletinId VARCHAR(50) NULL,
        authorId VARCHAR(50) NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        createdAt DATETIME DEFAULT GETDATE(),
        attachments NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.BoardComments', 'topicId') IS NULL ALTER TABLE dbo.BoardComments ADD topicId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.BoardComments', 'bulletinId') IS NULL ALTER TABLE dbo.BoardComments ADD bulletinId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.BoardComments', 'authorId') IS NULL ALTER TABLE dbo.BoardComments ADD authorId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.BoardComments', 'content') IS NULL ALTER TABLE dbo.BoardComments ADD content NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.BoardComments', 'createdAt') IS NULL ALTER TABLE dbo.BoardComments ADD createdAt DATETIME DEFAULT GETDATE();
    IF COL_LENGTH('dbo.BoardComments', 'attachments') IS NULL ALTER TABLE dbo.BoardComments ADD attachments NVARCHAR(MAX) NULL;
END
GO

-- ------------------------------------------
-- 6c. BoardViewers Table
-- ------------------------------------------
IF OBJECT_ID('dbo.BoardViewers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BoardViewers (
        topicId VARCHAR(50) NULL,
        bulletinId VARCHAR(50) NULL,
        userId VARCHAR(50) NOT NULL,
        viewedAt DATETIME DEFAULT GETDATE()
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.BoardViewers', 'topicId') IS NULL ALTER TABLE dbo.BoardViewers ADD topicId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.BoardViewers', 'bulletinId') IS NULL ALTER TABLE dbo.BoardViewers ADD bulletinId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.BoardViewers', 'userId') IS NULL ALTER TABLE dbo.BoardViewers ADD userId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.BoardViewers', 'viewedAt') IS NULL ALTER TABLE dbo.BoardViewers ADD viewedAt DATETIME DEFAULT GETDATE();
END
GO

-- ------------------------------------------
-- 7. ChatRooms Table
-- ------------------------------------------
IF OBJECT_ID('dbo.ChatRooms', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ChatRooms (
        id VARCHAR(50) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        type NVARCHAR(50) NOT NULL DEFAULT N'group',
        avatarUrl NVARCHAR(500) NULL,
        lastMessage NVARCHAR(MAX) NULL,
        updatedAt DATETIME DEFAULT GETDATE(),
        last_updated DATETIME DEFAULT GETDATE(),
        participantsJson NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.ChatRooms', 'type') IS NULL ALTER TABLE dbo.ChatRooms ADD type NVARCHAR(50) DEFAULT N'group';
    IF COL_LENGTH('dbo.ChatRooms', 'avatarUrl') IS NULL ALTER TABLE dbo.ChatRooms ADD avatarUrl NVARCHAR(500) NULL;
    IF COL_LENGTH('dbo.ChatRooms', 'lastMessage') IS NULL ALTER TABLE dbo.ChatRooms ADD lastMessage NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.ChatRooms', 'updatedAt') IS NULL ALTER TABLE dbo.ChatRooms ADD updatedAt DATETIME DEFAULT GETDATE();
    IF COL_LENGTH('dbo.ChatRooms', 'last_updated') IS NULL ALTER TABLE dbo.ChatRooms ADD last_updated DATETIME DEFAULT GETDATE();
    IF COL_LENGTH('dbo.ChatRooms', 'participantsJson') IS NULL ALTER TABLE dbo.ChatRooms ADD participantsJson NVARCHAR(MAX) NULL;

    -- Relax constraint on last_updated if it exists in legacy schema
    IF COL_LENGTH('dbo.ChatRooms', 'last_updated') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.ChatRooms ALTER COLUMN last_updated DATETIME NULL;
    END
    IF COL_LENGTH('dbo.ChatRooms', 'type') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.ChatRooms ALTER COLUMN type NVARCHAR(50) NULL;
    END
END
GO

-- ------------------------------------------
-- 8. ChatMessages Table
-- ------------------------------------------
IF OBJECT_ID('dbo.ChatMessages', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ChatMessages (
        id VARCHAR(50) PRIMARY KEY,
        senderId VARCHAR(50) NOT NULL,
        roomId VARCHAR(50) NOT NULL,
        message NVARCHAR(MAX) NULL,
        content NVARCHAR(MAX) NULL,
        createdAt DATETIME DEFAULT GETDATE(),
        attachments NVARCHAR(MAX) NULL,
        viewersJson NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.ChatMessages', 'senderId') IS NULL ALTER TABLE dbo.ChatMessages ADD senderId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.ChatMessages', 'roomId') IS NULL ALTER TABLE dbo.ChatMessages ADD roomId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.ChatMessages', 'message') IS NULL ALTER TABLE dbo.ChatMessages ADD message NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.ChatMessages', 'content') IS NULL ALTER TABLE dbo.ChatMessages ADD content NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.ChatMessages', 'createdAt') IS NULL ALTER TABLE dbo.ChatMessages ADD createdAt DATETIME DEFAULT GETDATE();
    IF COL_LENGTH('dbo.ChatMessages', 'attachments') IS NULL ALTER TABLE dbo.ChatMessages ADD attachments NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.ChatMessages', 'viewersJson') IS NULL ALTER TABLE dbo.ChatMessages ADD viewersJson NVARCHAR(MAX) NULL;

    -- Relax constraints if exist in legacy schema
    IF COL_LENGTH('dbo.ChatMessages', 'content') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.ChatMessages ALTER COLUMN content NVARCHAR(MAX) NULL;
    END
    IF COL_LENGTH('dbo.ChatMessages', 'message') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.ChatMessages ALTER COLUMN message NVARCHAR(MAX) NULL;
    END
END
GO

-- ------------------------------------------
-- 9. Memos Table
-- ------------------------------------------
IF OBJECT_ID('dbo.Memos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Memos (
        id VARCHAR(50) PRIMARY KEY,
        senderId VARCHAR(50) NULL,
        receiverId VARCHAR(50) NULL,
        content NVARCHAR(MAX) NOT NULL,
        isRead BIT DEFAULT 0,
        createdAt DATETIME DEFAULT GETDATE(),
        fromName NVARCHAR(100) NULL,
        fromCompany NVARCHAR(100) NULL,
        fromPhone NVARCHAR(50) NULL,
        details NVARCHAR(MAX) NULL,
        toUsersJson NVARCHAR(MAX) NULL,
        requirementType NVARCHAR(50) NULL,
        recipientStatusesJson NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.Memos', 'senderId') IS NULL ALTER TABLE dbo.Memos ADD senderId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Memos', 'receiverId') IS NULL ALTER TABLE dbo.Memos ADD receiverId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Memos', 'isRead') IS NULL ALTER TABLE dbo.Memos ADD isRead BIT DEFAULT 0;
    IF COL_LENGTH('dbo.Memos', 'fromName') IS NULL ALTER TABLE dbo.Memos ADD fromName NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Memos', 'fromCompany') IS NULL ALTER TABLE dbo.Memos ADD fromCompany NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.Memos', 'fromPhone') IS NULL ALTER TABLE dbo.Memos ADD fromPhone NVARCHAR(50) NULL;
    IF COL_LENGTH('dbo.Memos', 'details') IS NULL ALTER TABLE dbo.Memos ADD details NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.Memos', 'toUsersJson') IS NULL ALTER TABLE dbo.Memos ADD toUsersJson NVARCHAR(MAX) NULL;

    -- Ensure requirementType is added and is nullable (to fix any NOT NULL constraint issue)
    IF COL_LENGTH('dbo.Memos', 'requirementType') IS NULL
    BEGIN
        ALTER TABLE dbo.Memos ADD requirementType NVARCHAR(50) NULL;
    END
    ELSE
    BEGIN
        ALTER TABLE dbo.Memos ALTER COLUMN requirementType NVARCHAR(50) NULL;
    END

    -- Ensure recipientStatusesJson is added and is nullable (to fix any NOT NULL constraint issue)
    IF COL_LENGTH('dbo.Memos', 'recipientStatusesJson') IS NULL
    BEGIN
        ALTER TABLE dbo.Memos ADD recipientStatusesJson NVARCHAR(MAX) NULL;
    END
    ELSE
    BEGIN
        ALTER TABLE dbo.Memos ALTER COLUMN recipientStatusesJson NVARCHAR(MAX) NULL;
    END

    -- Relax constraints if exist in legacy schema
    IF COL_LENGTH('dbo.Memos', 'toUsersJson') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.Memos ALTER COLUMN toUsersJson NVARCHAR(MAX) NULL;
    END
END
GO

-- ------------------------------------------
-- 10. DailyReports Table
-- ------------------------------------------
IF OBJECT_ID('dbo.DailyReports', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DailyReports (
        id VARCHAR(50) PRIMARY KEY,
        authorId VARCHAR(50) NOT NULL,
        reportDate DATE NOT NULL,
        content NVARCHAR(MAX) NULL,
        createdAt DATETIME DEFAULT GETDATE(),
        tasks NVARCHAR(MAX) NULL,
        results NVARCHAR(MAX) NULL,
        issues NVARCHAR(MAX) NULL,
        tomorrowPlan NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.DailyReports', 'content') IS NULL ALTER TABLE dbo.DailyReports ADD content NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.DailyReports', 'reportDate') IS NULL ALTER TABLE dbo.DailyReports ADD reportDate DATE NULL;
    IF COL_LENGTH('dbo.DailyReports', 'tasks') IS NULL ALTER TABLE dbo.DailyReports ADD tasks NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.DailyReports', 'results') IS NULL ALTER TABLE dbo.DailyReports ADD results NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.DailyReports', 'issues') IS NULL ALTER TABLE dbo.DailyReports ADD issues NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.DailyReports', 'tomorrowPlan') IS NULL ALTER TABLE dbo.DailyReports ADD tomorrowPlan NVARCHAR(MAX) NULL;
END
GO

-- ------------------------------------------
-- 10b. UserReadStatuses Table (Centralized Read Management)
-- ------------------------------------------
IF OBJECT_ID('dbo.UserReadStatuses', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserReadStatuses (
        userId VARCHAR(50) NOT NULL,
        targetType VARCHAR(50) NOT NULL, -- 'event', 'topic', 'memo', 'chat'
        targetId VARCHAR(50) NOT NULL,
        readAt DATETIME DEFAULT GETDATE(),
        CONSTRAINT PK_UserReadStatuses PRIMARY KEY (userId, targetType, targetId)
    );
END
GO

-- ==========================================
-- 11. Seed Data Registration
-- ==========================================

-- Offices Seed
IF NOT EXISTS (SELECT 1 FROM dbo.OfficeMaster WHERE id = 'off-1') INSERT INTO dbo.OfficeMaster (id, name) VALUES ('off-1', N'東京本社');
IF NOT EXISTS (SELECT 1 FROM dbo.OfficeMaster WHERE id = 'off-2') INSERT INTO dbo.OfficeMaster (id, name) VALUES ('off-2', N'大阪支社');
IF NOT EXISTS (SELECT 1 FROM dbo.OfficeMaster WHERE id = 'off-3') INSERT INTO dbo.OfficeMaster (id, name) VALUES ('off-3', N'名古屋営業所');
GO

-- Divisions Seed
IF NOT EXISTS (SELECT 1 FROM dbo.DivisionMaster WHERE id = 'div-1') INSERT INTO dbo.DivisionMaster (id, name) VALUES ('div-1', N'開発技術部');
IF NOT EXISTS (SELECT 1 FROM dbo.DivisionMaster WHERE id = 'div-2') INSERT INTO dbo.DivisionMaster (id, name) VALUES ('div-2', N'営業統括部');
IF NOT EXISTS (SELECT 1 FROM dbo.DivisionMaster WHERE id = 'div-3') INSERT INTO dbo.DivisionMaster (id, name) VALUES ('div-3', N'人事総務部');
IF NOT EXISTS (SELECT 1 FROM dbo.DivisionMaster WHERE id = 'div-4') INSERT INTO dbo.DivisionMaster (id, name) VALUES ('div-4', N'企画マーケティング部');
GO

-- Positions Seed
IF NOT EXISTS (SELECT 1 FROM dbo.PositionMaster WHERE id = 'pos-1') INSERT INTO dbo.PositionMaster (id, name) VALUES ('pos-1', N'一般社員');
IF NOT EXISTS (SELECT 1 FROM dbo.PositionMaster WHERE id = 'pos-2') INSERT INTO dbo.PositionMaster (id, name) VALUES ('pos-2', N'主任');
IF NOT EXISTS (SELECT 1 FROM dbo.PositionMaster WHERE id = 'pos-3') INSERT INTO dbo.PositionMaster (id, name) VALUES ('pos-3', N'係長');
IF NOT EXISTS (SELECT 1 FROM dbo.PositionMaster WHERE id = 'pos-4') INSERT INTO dbo.PositionMaster (id, name) VALUES ('pos-4', N'課長');
IF NOT EXISTS (SELECT 1 FROM dbo.PositionMaster WHERE id = 'pos-5') INSERT INTO dbo.PositionMaster (id, name) VALUES ('pos-5', N'部長');
IF NOT EXISTS (SELECT 1 FROM dbo.PositionMaster WHERE id = 'pos-6') INSERT INTO dbo.PositionMaster (id, name) VALUES ('pos-6', N'代表取締役');
GO

-- Users Seed
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE id = 'u4') INSERT INTO dbo.Users (id, loginId, password, name, avatarUrl, department, office, division, position, role, isAdmin, supervisorId) VALUES ('u4', 'u4', 'password', N'鈴木一郎', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=120', N'役員', N'東京本社', N'代表取締役', N'代表取締役', 'admin', 1, NULL);
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE id = 'u3') INSERT INTO dbo.Users (id, loginId, password, name, avatarUrl, department, office, division, position, role, isAdmin, supervisorId) VALUES ('u3', 'u3', 'password', N'佐藤美咲', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120', N'開発部', N'東京本社', N'開発技術部', N'課長', 'user', 0, 'u4');
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE id = 'u1') INSERT INTO dbo.Users (id, loginId, password, name, avatarUrl, department, office, division, position, role, isAdmin, supervisorId) VALUES ('u1', 'u1', 'password', N'山田太郎', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120', N'開発部', N'東京本社', N'開発技術部', N'主任', 'user', 0, 'u3');
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE id = 'u2') INSERT INTO dbo.Users (id, loginId, password, name, avatarUrl, department, office, division, position, role, isAdmin, supervisorId) VALUES ('u2', 'u2', 'password', N'田中花子', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=120', N'営業部', N'大阪支社', N'営業統括部', N'一般社員', 'user', 0, 'u4');
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE id = 'u5') INSERT INTO dbo.Users (id, loginId, password, name, avatarUrl, department, office, division, position, role, isAdmin, supervisorId) VALUES ('u5', 'u5', 'password', N'高橋健太', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=120', N'総務部', N'東京本社', N'人事総務部', N'一般社員', 'user', 0, 'u4');
GO

-- Posts Seed
IF NOT EXISTS (SELECT 1 FROM dbo.Posts WHERE id = 'p-1')
BEGIN
    INSERT INTO dbo.Posts (id, authorId, content, createdAt, likes, nasLink) VALUES 
    ('p-1', 'u3', N'社内VPNおよび基幹システム定期メンテナンスについて、今週末の日曜日深夜2時〜4時にかけて実施します。当該時間帯はアクセスが一時遮断されますのでご注意ください。', DATEADD(HOUR, -48, GETDATE()), 89, NULL),
    ('p-2', 'u1', N'本日開発中の新機能のプロトタイプが上がりました！関係者の皆様はテスト環境（URLは社内Wiki参照）にてフィードバックをお願いいたします。デザインが洗練されて動きもスムーズになっています。', DATEADD(HOUR, -24, GETDATE()), 42, N'\\nas-server\shared\project-proto'),
    ('p-3', 'u2', N'大阪支社のエントランスに新しい観葉植物（パキラ）が届きました！一気にオフィスが明るくなった気がします。ご来社の際はぜひ見てみてください。', DATEADD(HOUR, -4, GETDATE()), 15, NULL);

    INSERT INTO dbo.PostTags (postId, tag) VALUES 
    ('p-1', N'システム更新'), ('p-1', N'ITインフラ'), ('p-1', N'重要'),
    ('p-2', N'プロダクト開発'), ('p-2', N'UIデザイン'),
    ('p-3', N'オフィス環境'), ('p-3', N'大阪支社');
END
GO

-- Events Seed
IF NOT EXISTS (SELECT 1 FROM dbo.Events WHERE id = 'e-1')
BEGIN
    INSERT INTO dbo.Events (id, title, startAt, endAt, isAllDay, category, location, description) VALUES 
    ('e-1', N'システム定期メンテナンス', DATEADD(DAY, 3, GETDATE()), DATEADD(DAY, 3, DATEADD(HOUR, 2, GETDATE())), 0, 'general', N'サーバー室', N'{"memo":"深夜作業を伴うデータベース移行メンテナンスです。","attendees":["u1","u3"]}'),
    ('e-2', N'新入社員歓迎ランチ', DATEADD(DAY, 1, GETDATE()), DATEADD(DAY, 1, DATEADD(HOUR, 1, GETDATE())), 0, 'general', N'1F カフェテリア', N'{"memo":"新しくジョインした高橋さんの歓迎ランチです。どなたでも参加歓迎！","attendees":["u1","u3","u4","u5"]}'),
    ('e-3', N'営業部定例ミーティング', DATEADD(DAY, 2, GETDATE()), DATEADD(DAY, 2, DATEADD(HOUR, 1, GETDATE())), 0, 'general', N'会議室B', N'{"memo":"今月の売上目標進捗および来期の戦略についてのすり合わせ。","attendees":["u2","u4"]}');
END
GO

-- Workflows Seed
IF NOT EXISTS (SELECT 1 FROM dbo.Workflows WHERE id = 'w-1')
BEGIN
    INSERT INTO dbo.Workflows (id, title, applicantId, approverId, status, createdAt, category, type, details, description) VALUES 
    ('w-1', N'MacBook Pro 14インチ購入申請', 'u1', 'u3', 'pending', DATEADD(DAY, -1, GETDATE()), 'purchase', 'purchase', N'{"reason":"開発用PCのスペック不足に伴う買い替え","purchaseItems":[{"name":"MacBook Pro 14 (M3 Max / 32GB / 1TB)","price":428000,"quantity":1}],"currentStepIndex":1,"totalSteps":2,"stepsConfig":[{"stepNumber":1,"approverType":"supervisor_1","stepName":"一次承認"},{"stepNumber":2,"approverType":"specific_user","specificUserId":"u4","stepName":"最終決裁"}]}', N'MacBook Pro 14インチ購入申請'),
    ('w-2', N'有給休暇申請（5日間）', 'u2', 'u4', 'approved', DATEADD(DAY, -5, GETDATE()), 'leave', 'leave', N'{"reason":"私用のため帰省","leaveStart":"2026-08-10","leaveEnd":"2026-08-14","currentStepIndex":1,"totalSteps":1,"stepsConfig":[{"stepNumber":1,"approverType":"supervisor_1","stepName":"決裁"}]}', N'有給休暇申請（5日間）');
END
GO

-- Bulletins Seed
IF NOT EXISTS (SELECT 1 FROM dbo.Bulletins WHERE id = 'b-1')
BEGIN
    INSERT INTO dbo.Bulletins (id, category, title, content, authorId, createdAt, isPinned) VALUES 
    ('b-1', 'announcement', N'【重要】2026年度 下期全社方針発表会のお知らせ', N'{"text":"全社員対象の下期全社方針発表会を10月1日（木）14時より、オンライン配信および各オフィスのメイン会議室を接続して執り行います。各部門の進捗報告および今後の成長戦略について重要なお知らせがあります。"}', 'u4', DATEADD(DAY, -4, GETDATE()), 1),
    ('b-2', 'general', N'部活動（フットサル部）メンバー募集！', N'{"text":"フットサル部では新メンバーを男女問わず大募集しています！月1回、都内のレンタルコートで楽しく汗を流しています。初心者大歓迎です。未経験者向けの練習メニューから始めています。"}', 'u1', DATEADD(DAY, -2, GETDATE()), 0);
END
GO

-- ChatRooms Seed
IF NOT EXISTS (SELECT 1 FROM dbo.ChatRooms WHERE id = 'r1')
BEGIN
    INSERT INTO dbo.ChatRooms (id, name, type, avatarUrl, lastMessage, updatedAt, last_updated) VALUES 
    ('r1', N'全社連絡板', 'group', NULL, N'鈴木：全社方針発表資料を格納しました。', DATEADD(HOUR, -2, GETDATE()), DATEADD(HOUR, -2, GETDATE())),
    ('r2', N'開発技術部メンバー', 'group', NULL, N'山田：プロトタイプ、確認お願いします！', DATEADD(HOUR, -6, GETDATE()), DATEADD(HOUR, -6, GETDATE())),
    ('r3', N'佐藤美咲 (ダイレクト)', 'direct', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120', N'佐藤：承知いたしました。よろしくおねがいします。', DATEADD(HOUR, -1, GETDATE()), DATEADD(HOUR, -1, GETDATE()));
END
GO

-- ChatMessages Seed
IF NOT EXISTS (SELECT 1 FROM dbo.ChatMessages WHERE id = 'c-1')
BEGIN
    INSERT INTO dbo.ChatMessages (id, roomId, senderId, message, content, createdAt) VALUES 
    ('c-1', 'r1', 'u4', N'皆さん、おはようございます。今週の進捗は順調でしょうか。', N'皆さん、おはようございます。今週の進捗は順調でしょうか。', DATEADD(HOUR, -24, GETDATE())),
    ('c-2', 'r1', 'u3', N'開発部、順調に推移しています。週末メンテナンスに備えます。', N'開発部、順調に推移しています。週末メンテナンスに備えます。', DATEADD(HOUR, -23, GETDATE())),
    ('c-3', 'r1', 'u4', N'全社方針発表資料を格納しました。各員確認してください。', N'全社方針発表資料を格納しました。各員確認してください。', DATEADD(HOUR, -2, GETDATE())),
    ('c-4', 'r2', 'u3', N'今週リリースするバージョンのマイルストーンを定義しました。', N'今週リリースするバージョンのマイルストーンを定義しました。', DATEADD(HOUR, -12, GETDATE())),
    ('c-5', 'r2', 'u1', N'プロトタイプ、確認お願いします！', N'プロトタイプ、確認お願いします！', DATEADD(HOUR, -6, GETDATE())),
    ('c-6', 'r3', 'u1', N'佐藤さん、先ほど申請したMacBookの購入申請の件、ご確認いただけますでしょうか。', N'佐藤さん、先ほど申請したMacBookの購入申請の件、ご確認いただけますでしょうか。', DATEADD(HOUR, -2, GETDATE())),
    ('c-7', 'r3', 'u3', N'佐藤：承知いたしました。よろしくおねがいします。', N'佐藤：承知いたしました。よろしくおねがいします。', DATEADD(HOUR, -1, GETDATE()));
END
GO

-- Memos Seed
IF NOT EXISTS (SELECT 1 FROM dbo.Memos WHERE id = 'memo-1')
BEGIN
    INSERT INTO dbo.Memos (id, senderId, receiverId, content, isRead, createdAt, fromName, fromCompany, fromPhone, toUsersJson, requirementType, recipientStatusesJson) VALUES 
    ('memo-1', 'u1', 'u3', N'先ほどお電話をいただきました。お見積りの件で確認したい点があるとのこと。折り返しのご連絡（できれば本日中）をお願いしたいそうです。', 0, DATEADD(HOUR, -1, GETDATE()), N'高橋 代理', N'株式会社テクノソリューションズ', '03-1234-5678', N'["u3"]', N'please_call_back', N'{"u3":{"isRead":false,"readAt":null}}'),
    ('memo-2', 'u5', 'u5', N'光回線の開通工事について、日程調整のため折り返しのご連絡を求めておられます。', 1, DATEADD(HOUR, -24, GETDATE()), N'窓口 担当者', N'NTT東日本 営業窓口', '0120-116-116', N'["u5"]', N'has_message', N'{"u5":{"isRead":true,"readAt":"2026-07-30T10:00:00Z"}}');
END
GO

-- DailyReports Seed
IF NOT EXISTS (SELECT 1 FROM dbo.DailyReports WHERE id = 'r-1')
BEGIN
    INSERT INTO dbo.DailyReports (id, authorId, reportDate, content, createdAt, tasks, results, issues, tomorrowPlan) VALUES 
    ('r-1', 'u1', CAST(GETDATE() AS DATE), N'1. 新機能UIデザインのプロトタイプ構築\n2. React-Routerを使用した画面遷移の実装\n3. APIフェッチのエラーハンドリング調整', GETDATE(), N'1. 新機能UIデザインのプロトタイプ構築\n2. React-Routerを使用した画面遷移の実装', N'UIプロトタイプがほぼ完成し、チーム内に展開した。', N'一部のIE対応互換性コードでエラーがあったが、Polyfillを追加して解決。', N'1. フィードバックを元にしたUIの修正\n2. SQL Server接続の調整');
END
GO

SELECT 'Database successfully setup and aligned with server.js spec without errors!' AS Status;
