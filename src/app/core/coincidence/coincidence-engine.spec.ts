import { SeismicEventSnapshot, StationTransition } from '../protocol/control-messages';
import { CoincidenceEngine } from './coincidence-engine';

const transition = (stationId: number, state: 'on' | 'off', seconds: number, peak = 100): StationTransition => ({
  type: 'station-transition',
  stationId,
  state,
  timeUs: seconds * 1_000_000,
  peak,
  ratio: 4,
});

describe('CoincidenceEngine', () => {
  it('confirms at the exact instant of the fourth station inside 6 s', () => {
    const published: SeismicEventSnapshot[] = [];
    const engine = new CoincidenceEngine({ requiredStations: 4, windowUs: 6_000_000 }, (event) => published.push(event));
    engine.apply(transition(1, 'on', 10));
    engine.apply(transition(2, 'on', 11));
    engine.apply(transition(1, 'off', 12, 900));
    engine.apply(transition(3, 'on', 13));
    engine.apply(transition(4, 'on', 15.5));
    expect(published[0].confirmedAtUs).toBe(15_500_000);
    expect(published[0].firstTriggerUs).toBe(10_000_000);
    expect(published[0].stations).toEqual([1, 2, 3, 4]);
    expect(published[0].peak).toBe(900);
  });

  it('does not confirm stations that are farther apart than the window', () => {
    const published: SeismicEventSnapshot[] = [];
    const engine = new CoincidenceEngine({ requiredStations: 4, windowUs: 6_000_000 }, (event) => published.push(event));
    engine.apply(transition(1, 'on', 0));
    engine.apply(transition(1, 'off', 1));
    engine.apply(transition(2, 'on', 3));
    engine.apply(transition(2, 'off', 4));
    engine.apply(transition(3, 'on', 8));
    engine.apply(transition(4, 'on', 9));
    expect(published.length).toBe(0);
  });

  it('closes the event once fewer than four stations remain and all closed', () => {
    const published: SeismicEventSnapshot[] = [];
    const engine = new CoincidenceEngine({ requiredStations: 4, windowUs: 6_000_000 }, (event) => published.push(event));
    [1, 2, 3, 4].forEach((s, i) => engine.apply(transition(s, 'on', i)));
    [1, 2, 3, 4].forEach((s, i) => engine.apply(transition(s, 'off', 10 + i)));
    engine.advanceTo(30_000_000);
    const last = published[published.length - 1];
    expect(last.closed).toBe(true);
    expect(last.endUs).toBe(13_000_000);
  });
});
