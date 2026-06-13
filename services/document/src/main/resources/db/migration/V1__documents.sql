CREATE TABLE documents (
    id         UUID PRIMARY KEY,
    user_id    UUID         NOT NULL,
    name       VARCHAR(255) NOT NULL,
    content    TEXT         NOT NULL DEFAULT '',
    settings   TEXT         NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_user_updated ON documents (user_id, updated_at DESC);
