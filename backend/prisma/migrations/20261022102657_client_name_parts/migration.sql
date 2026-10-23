-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "firstName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "middleName" TEXT;

-- Backfill existing clients: first word = first name, last word = last name, anything between = middle name.
UPDATE "Client" SET
  "firstName"  = split_part("name", ' ', 1),
  "lastName"   = CASE WHEN array_length(string_to_array("name", ' '), 1) > 1 THEN (string_to_array("name", ' '))[array_length(string_to_array("name", ' '), 1)] ELSE '' END,
  "middleName" = NULLIF(array_to_string((string_to_array("name", ' '))[2:array_length(string_to_array("name", ' '), 1) - 1], ' '), '');

-- Keep Arabic family-name prefixes with the surname ("Fatima Al Mansoori" -> last name "Al Mansoori").
UPDATE "Client" SET
  "lastName"   = substring("middleName" from '(?:^| )((?:Al|El|Bin|Bint|Abu)$)') || ' ' || "lastName",
  "middleName" = NULLIF(regexp_replace("middleName", '(^| )(Al|El|Bin|Bint|Abu)$', ''), '')
WHERE "middleName" ~ '(^| )(Al|El|Bin|Bint|Abu)$';
