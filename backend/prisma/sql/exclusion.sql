-- DB-level safety net against double booking (apply after first migrate; NOT yet tested on a live DB).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Appointment" ADD CONSTRAINT no_therapist_overlap EXCLUDE USING gist ("therapistId" WITH =, tsrange("startAt","endAt") WITH &&) WHERE ("status" NOT IN ('CANCELLED','NO_SHOW'));
ALTER TABLE "Appointment" ADD CONSTRAINT no_machine_overlap   EXCLUDE USING gist ("machineId"   WITH =, tsrange("startAt","endAt") WITH &&) WHERE ("status" NOT IN ('CANCELLED','NO_SHOW'));
ALTER TABLE "Appointment" ADD CONSTRAINT no_room_overlap      EXCLUDE USING gist ("roomId"      WITH =, tsrange("startAt","endAt") WITH &&) WHERE ("status" NOT IN ('CANCELLED','NO_SHOW'));