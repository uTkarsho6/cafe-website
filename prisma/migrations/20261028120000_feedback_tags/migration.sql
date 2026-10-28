-- Additive: quick highlights on feedback (Round 2D, ADR-062). Existing rows get an empty list;
-- no data is changed. Feedback already has RLS enabled with no policies (deny-all, ADR-009).
CREATE TYPE "FeedbackTag" AS ENUM ('TASTY_FOOD', 'QUICK_SERVICE', 'FRIENDLY_STAFF', 'GREAT_AMBIENCE', 'GOOD_VALUE', 'STUDENT_FRIENDLY');

ALTER TABLE "Feedback" ADD COLUMN "tags" "FeedbackTag"[] DEFAULT ARRAY[]::"FeedbackTag"[];
