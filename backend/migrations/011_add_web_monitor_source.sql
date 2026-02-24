-- Migration 011: Add Web Monitor information source
-- Adds a new source type for monitoring websites via RSS/Atom feeds or HTML scraping

INSERT INTO information_sources (source_name, source_url, description, is_active) VALUES
('Web Monitor', '', 'Monitor websites for new content via RSS/Atom feeds or HTML scraping', TRUE);
