-- Replace the original non-blank check with the canonical format shared by the service layer.
ALTER TABLE "PromotionCode" DROP CONSTRAINT "PromotionCode_code_not_blank";

ALTER TABLE "PromotionCode" ADD CONSTRAINT "PromotionCode_code_format" CHECK (
    char_length("code") BETWEEN 3 AND 32
    AND "code" = upper(btrim("code"))
    AND "code" ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'
);
