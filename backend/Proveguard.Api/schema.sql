-- SQL Schema for Proveguard (SQLite / Cloudflare D1)

CREATE TABLE IF NOT EXISTS Designers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Projects (
    id TEXT PRIMARY KEY,
    designer_id TEXT NOT NULL,
    title TEXT NOT NULL,
    client_email TEXT NOT NULL,
    price REAL NOT NULL,
    status TEXT NOT NULL, -- 'Not Viewed', 'Viewed', 'Paid'
    original_file_key TEXT NOT NULL,
    preview_file_key TEXT NOT NULL,
    public_link_token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    viewed_at TEXT,
    paid_at TEXT,
    FOREIGN KEY (designer_id) REFERENCES Designers(id)
);

CREATE TABLE IF NOT EXISTS Payments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_provider_ref TEXT,
    status TEXT NOT NULL, -- 'Pending', 'Completed', 'Failed'
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES Projects(id)
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_projects_designer ON Projects(designer_id);
CREATE INDEX IF NOT EXISTS idx_projects_token ON Projects(public_link_token);
CREATE INDEX IF NOT EXISTS idx_payments_project ON Payments(project_id);
