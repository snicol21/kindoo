ALTER TABLE event ADD COLUMN event_type text NOT NULL DEFAULT 'Private';

UPDATE event
SET event_type = 'Private'
WHERE event_type IS NULL OR trim(event_type) = '';
