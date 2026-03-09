ALTER TABLE user ADD COLUMN ward text NOT NULL DEFAULT '1st Ward';
ALTER TABLE user ADD COLUMN phone text NOT NULL DEFAULT '0000000000';

UPDATE user SET ward = '1st Ward' WHERE ward IS NULL OR trim(ward) = '';
UPDATE user SET phone = '0000000000' WHERE phone IS NULL OR trim(phone) = '';

UPDATE user SET role = 'stake_manager' WHERE role = 'manager';
UPDATE user SET role = 'ward_user' WHERE role = 'user';
