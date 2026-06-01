-- Required start availability for job (recruitment timeline emoji options; matches candidates.availability).
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS availability VARCHAR(255);
