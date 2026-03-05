UPDATE message_template_default
SET body = REPLACE(body, '\n', char(10))
WHERE body LIKE '%\n%';

UPDATE message_template
SET body = REPLACE(body, '\n', char(10))
WHERE body LIKE '%\n%';
