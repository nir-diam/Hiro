-- subField, businessModel, productType → multiselect (TEXT[])

ALTER TABLE organizations
  ALTER COLUMN "subField" TYPE TEXT[] USING (
    CASE
      WHEN "subField" IS NULL OR TRIM("subField") = '' THEN ARRAY[]::TEXT[]
      ELSE ARRAY[TRIM("subField")]::TEXT[]
    END
  );

ALTER TABLE organizations
  ALTER COLUMN "businessModel" TYPE TEXT[] USING (
    CASE
      WHEN "businessModel" IS NULL OR TRIM("businessModel") = '' THEN ARRAY[]::TEXT[]
      ELSE ARRAY[TRIM("businessModel")]::TEXT[]
    END
  );

ALTER TABLE organizations
  ALTER COLUMN "productType" TYPE TEXT[] USING (
    CASE
      WHEN "productType" IS NULL OR TRIM("productType") = '' THEN ARRAY[]::TEXT[]
      ELSE ARRAY[TRIM("productType")]::TEXT[]
    END
  );

ALTER TABLE organizations ALTER COLUMN "subField" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE organizations ALTER COLUMN "businessModel" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE organizations ALTER COLUMN "productType" SET DEFAULT ARRAY[]::TEXT[];
