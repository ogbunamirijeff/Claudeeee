/*
  Warnings:

  - You are about to drop the column `distanceKm` on the `assignments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assignments" DROP COLUMN "distanceKm",
ADD COLUMN     "distanceMiles" DOUBLE PRECISION;
