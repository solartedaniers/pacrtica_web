export type StationZone = 'flank' | 'urban';

export interface StationDescriptor {
  readonly id: number;
  readonly code: string;
  readonly zone: StationZone;
  readonly eastKm: number;
  readonly northKm: number;
}

export const StationNetwork: readonly StationDescriptor[] = [
  { id: 1, code: 'CRN', zone: 'flank', eastKm: 0.4, northKm: 1.1 },
  { id: 2, code: 'CRS', zone: 'flank', eastKm: -0.6, northKm: -1.3 },
  { id: 3, code: 'FLE', zone: 'flank', eastKm: 2.2, northKm: 0.3 },
  { id: 4, code: 'FLO', zone: 'flank', eastKm: -2.5, northKm: 0.6 },
  { id: 5, code: 'MRD', zone: 'flank', eastKm: 1.4, northKm: -2.8 },
  { id: 6, code: 'UCE', zone: 'urban', eastKm: 7.9, northKm: -4.1 },
  { id: 7, code: 'UNO', zone: 'urban', eastKm: 8.6, northKm: -2.2 },
  { id: 8, code: 'USU', zone: 'urban', eastKm: 9.4, northKm: -5.3 },
  { id: 9, code: 'UHO', zone: 'urban', eastKm: 10.2, northKm: -3.4 },
];

export const ChannelComponentCodes: readonly string[] = ['NS', 'EO', 'Z'];
