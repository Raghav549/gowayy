import type { DispatchJob, DriverProfile, ServiceKind } from '@gowayy/types';
import { haversineKm } from '@gowayy/location-engine';
import type { Coordinates } from '@gowayy/types';

export interface DispatchRules {
  requireVerification: boolean;
  maxConcurrentJobs: number;
  /** A driver carrying a passenger must not receive any other job. */
  passengerTripBlocksAllOtherJobs: boolean;
  allowMixedDeliveryServices: boolean;
  maxPickupDistanceKm: number;
  eligibleServicesByVehicle: Record<string, ServiceKind[]>;
}

export const DEFAULT_DISPATCH_RULES: DispatchRules = {
  requireVerification: true,
  maxConcurrentJobs: 1,
  passengerTripBlocksAllOtherJobs: true,
  allowMixedDeliveryServices: true,
  maxPickupDistanceKm: 12,
  eligibleServicesByVehicle: {
    hatchback: ['cab', 'food', 'grocery', 'parcel'],
    sedan: ['cab', 'food', 'grocery', 'parcel'],
    suv: ['cab', 'grocery', 'parcel'],
    premium: ['cab'],
    bike: ['food', 'grocery', 'parcel'],
  },
};

export interface Eligibility { eligible: boolean; reasons: string[] }

export function checkEligibility(
  driver: DriverProfile,
  job: DispatchJob,
  activeJobs: DispatchJob[],
  rules: DispatchRules = DEFAULT_DISPATCH_RULES,
): Eligibility {
  const reasons: string[] = [];
  if (!driver.online) reasons.push('Driver is offline');
  if (rules.requireVerification && driver.verification !== 'verified') reasons.push('Driver documents are not verified');
  if (!driver.services.includes(job.service)) reasons.push(`Driver has not enabled ${job.service}`);
  const vehicleServices = rules.eligibleServicesByVehicle[driver.vehicleClass] ?? [];
  if (!vehicleServices.includes(job.service)) reasons.push(`Vehicle ${driver.vehicleClass} is not eligible for ${job.service}`);
  if (activeJobs.length >= rules.maxConcurrentJobs) reasons.push('Driver already has an active job');
  const hasPassengerTrip = activeJobs.some((j) => j.service === 'cab');
  if (rules.passengerTripBlocksAllOtherJobs && hasPassengerTrip) reasons.push('Driver is transporting a passenger');
  const incomingPassenger = job.service === 'cab';
  if (rules.passengerTripBlocksAllOtherJobs && incomingPassenger && activeJobs.some((j) => j.service !== 'cab')) {
    reasons.push('Driver is completing a delivery');
  }
  if (!rules.allowMixedDeliveryServices && activeJobs.some((j) => j.service !== job.service)) {
    reasons.push('Mixed delivery services are disabled');
  }
  return { eligible: reasons.length === 0, reasons };
}

export interface RankedDriver { driver: DriverProfile; score: number; distanceKm: number }

export function rankDrivers(
  drivers: DriverProfile[],
  job: DispatchJob,
  activeJobsByDriver: Record<string, DispatchJob[]>,
  pickup: Coordinates,
  driverPositions: Record<string, Coordinates>,
  rules: DispatchRules = DEFAULT_DISPATCH_RULES,
): RankedDriver[] {
  return drivers
    .map((driver) => {
      const distanceKm = driverPositions[driver.id] ? haversineKm(pickup, driverPositions[driver.id]!) : Number.POSITIVE_INFINITY;
      const eligibility = checkEligibility(driver, job, activeJobsByDriver[driver.id] ?? [], rules);
      return { driver, distanceKm, score: eligibility.eligible ? 100 - distanceKm : -1 };
    })
    .filter((r) => r.score >= 0 && r.distanceKm <= rules.maxPickupDistanceKm)
    .sort((a, b) => b.score - a.score);
}

export function assignJob(
  drivers: DriverProfile[],
  job: DispatchJob,
  activeJobsByDriver: Record<string, DispatchJob[]>,
  pickup: Coordinates,
  driverPositions: Record<string, Coordinates>,
  rules: DispatchRules = DEFAULT_DISPATCH_RULES,
): { driverId: string } | { error: string } {
  const ranked = rankDrivers(drivers, job, activeJobsByDriver, pickup, driverPositions, rules);
  const best = ranked[0];
  return best ? { driverId: best.driver.id } : { error: 'No eligible driver available under the current dispatch rules' };
}
