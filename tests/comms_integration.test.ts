import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatCallsignForSpeech,
  formatRegistrationForSpeech,
  formatRunwayForSpeech,
  formatAltitudeForSpeech,
  formatHeadingForSpeech,
  formatAirspeedForSpeech,
  formatFrequencyForSpeech,
  formatSquawkForSpeech,
  formatNavigationForSpeech,
  buildPilotInitialContact,
  formatPhraseForSpeech,
} from '../src/audio/aviationSpeechGrammar';
import { VoiceAssignmentRegistry } from '../src/audio/voiceAssignmentRegistry';
import { RadioCommsManager } from '../src/audio/commsManager';
import { radioAudio } from '../src/audio/radioAudio';
import { useSimulationStore } from '../src/store/simulationStore';

describe('Aviation Speech Grammar & ICAO Phraseology', () => {
  it('converts airline callsigns, flight numbers, heavy suffixes, and aircraft registrations cleanly', () => {
    expect(formatCallsignForSpeech('BAW452', true)).toBe('Speedbird four five two heavy');
    expect(formatCallsignForSpeech('UAE310')).toBe('Emirates three one zero');
    expect(formatCallsignForSpeech('IRA712A')).toBe('Iranair seven one two Alpha');

    expect(formatRegistrationForSpeech('N172SP')).toBe('November one seven two Sierra Papa');
    expect(formatRegistrationForSpeech('G-BOAC')).toBe('Golf Bravo Oscar Alpha Charlie');
    expect(formatRegistrationForSpeech('EP-IAA')).toBe('Echo Papa India Alpha Alpha');

    const mixed = formatPhraseForSpeech(
      'N172SP, descend 3,500 ft, heading 005, speed 90 knots, squawk 4521, contact 121.9 MHz'
    );
    expect(mixed).toContain('November one seven two Sierra Papa');
    expect(mixed).toContain('three thousand five hundred feet');
    expect(mixed).toContain('heading zero zero five');
    expect(mixed).toContain('niner zero knots');
    expect(mixed).toContain('squawk four five two one');
    expect(mixed).toContain('one two one decimal niner');
  });

  it('pronounces runways, altitudes, headings, speeds, frequencies, and squawks using ICAO rules', () => {
    expect(formatRunwayForSpeech('27L')).toBe('two seven left');
    expect(formatRunwayForSpeech('09R')).toBe('zero niner right');
    expect(formatRunwayForSpeech('04C')).toBe('zero four center');
    expect(formatRunwayForSpeech('36')).toBe('three six');

    expect(formatAltitudeForSpeech(3000)).toBe('three thousand feet');
    expect(formatAltitudeForSpeech(3500)).toBe('three thousand five hundred feet');
    expect(formatAltitudeForSpeech('FL120')).toBe('flight level one two zero');

    expect(formatHeadingForSpeech(5)).toBe('heading zero zero five');
    expect(formatHeadingForSpeech(90)).toBe('heading zero niner zero');
    expect(formatHeadingForSpeech(360)).toBe('heading three six zero');

    expect(formatAirspeedForSpeech(180)).toBe('one eight zero knots');
    expect(formatFrequencyForSpeech('119.725 MHz')).toBe('one one niner decimal seven two five');
    expect(formatFrequencyForSpeech('121.9')).toBe('one two one decimal niner');
    expect(formatSquawkForSpeech('7700')).toBe('squawk seven seven zero zero');
  });

  it('builds structured navigation instructions and initial contact phrases from aircraft context', () => {
    const ilsVec = formatNavigationForSpeech(
      {
        type: 'ILS_VECTORS',
        heading: 240,
        altitudeFeet: 3000,
        qnh: 1013,
        runway: '27R',
      },
      { callsign: 'BAW452', isHeavy: true }
    );
    expect(ilsVec.displayText).toContain('BAW452');
    expect(ilsVec.spokenText).toContain('Speedbird four five two heavy');
    expect(ilsVec.spokenText).toContain('heading two four zero');
    expect(ilsVec.spokenText).toContain('three thousand feet');
    expect(ilsVec.spokenText).toContain('Q N H one zero one three');
    expect(ilsVec.spokenText).toContain('runway two seven right');

    const emerCall = buildPilotInitialContact(
      {
        callsign: 'AAL101',
        isHeavy: true,
        transponder: '7700',
        assignedRunway: '31L',
        airportName: 'New York Kennedy',
      },
      { emergencyReason: 'engine failure' }
    );
    expect(emerCall.spokenText).toContain('Mayday, Mayday, Mayday');
    expect(emerCall.spokenText).toContain('American one zero one heavy');
    expect(emerCall.spokenText).toContain('squawking seven seven zero zero');
    expect(emerCall.spokenText).toContain('runway three one left');
  });
});

describe('Persistent Flight & Station Voice Assignment Registry', () => {
  let registry: VoiceAssignmentRegistry;

  beforeEach(() => {
    registry = new VoiceAssignmentRegistry();
  });

  it('pins pilot voices for the entire flight lifetime regardless of fleet churn or removals', () => {
    const ac1 = registry.getOrAssignPilot({ aircraftId: 'ac_1', callsign: 'BAW452', airline: 'British Airways' });
    const ac2 = registry.getOrAssignPilot({ aircraftId: 'ac_2', callsign: 'IRA712', airline: 'Iran Air' });
    const ac3 = registry.getOrAssignPilot({ aircraftId: 'ac_3', callsign: 'AFR228', airline: 'Air France' });
    const ac4 = registry.getOrAssignPilot({ aircraftId: 'ac_4', callsign: 'UAE310', airline: 'Emirates' });

    // Distinct active pilot profiles
    expect(new Set([ac1.localProfileId, ac2.localProfileId, ac3.localProfileId, ac4.localProfileId]).size).toBe(4);

    // ac_2 exits sector; ac_5 spawns — ac_1, ac_3, ac_4 MUST keep exact pinned voice IDs!
    registry.pruneInactiveAircraft(['ac_1', 'ac_3', 'ac_4']);
    const ac5 = registry.getOrAssignPilot({ aircraftId: 'ac_5', callsign: 'DLH802', airline: 'Lufthansa' });
    expect(ac5.localProfileId).toBeTruthy();

    expect(registry.getOrAssignPilot({ aircraftId: 'ac_1', callsign: 'BAW452' }).localProfileId).toBe(ac1.localProfileId);
    expect(registry.getOrAssignPilot({ aircraftId: 'ac_3', callsign: 'AFR228' }).localProfileId).toBe(ac3.localProfileId);
    expect(registry.getOrAssignPilot({ aircraftId: 'ac_4', callsign: 'UAE310' }).localProfileId).toBe(ac4.localProfileId);
  });

  it('maintains consistent, pilot-disjoint controller voices for TOWER, APPROACH, and GROUND stations', () => {
    const twr1 = registry.getOrAssignStationController({
      airportIcao: 'EGLL',
      stationRole: 'TOWER',
      frequency: '118.500 MHz',
      preferredProfileId: 'tower_charon',
    });
    const app1 = registry.getOrAssignStationController({
      airportIcao: 'EGLL',
      stationRole: 'APPROACH',
      frequency: '119.725 MHz',
      preferredProfileId: 'approach_zephyr',
    });
    const gnd1 = registry.getOrAssignStationController({
      airportIcao: 'EGLL',
      stationRole: 'GROUND',
      frequency: '121.900 MHz',
      preferredProfileId: 'ground_puck',
    });

    expect(twr1.localProfile.id).toBe('tower_charon');
    expect(app1.localProfile.id).toBe('approach_zephyr');
    expect(gnd1.localProfile.id).toBe('ground_puck');

    // Re-querying returns the exact invariant controller assignment
    expect(
      registry.getOrAssignStationController({
        airportIcao: 'EGLL',
        stationRole: 'APPROACH',
        frequency: '119.725 MHz',
      }).localProfile.id
    ).toBe('approach_zephyr');

    // Pilot voice never collides with any active station controller voice
    const pilot = registry.getOrAssignPilot({
      aircraftId: 'ac_check',
      callsign: 'QTR101',
      excludedControllerProfileIds: [twr1.localProfile.id, app1.localProfile.id, gnd1.localProfile.id],
    });
    expect([twr1.localProfile.id, app1.localProfile.id, gnd1.localProfile.id]).not.toContain(pilot.localProfileId);
  });
});

describe('Frequency-Serialized Priority Communication Manager', () => {
  it('orders simultaneous communications by priority, prevents same-frequency overlap, and supports emergency preemption & cancellation', async () => {
    const manager = new RadioCommsManager();
    manager.setPttTiming({ betweenTransmissionsMs: 5, keyUpLeadMs: 15, interTurnGapMs: 60, unkeyTailMs: 20 });

    const order: string[] = [];
    const concurrentAtFreq = new Map<string, number>();
    let overlapDetected = false;
    let preemptedAdvisory = false;

    manager.setExecutor(async (item, ctx) => {
      const curr = (concurrentAtFreq.get(item.normalizedFrequency) || 0) + 1;
      concurrentAtFreq.set(item.normalizedFrequency, curr);
      if (curr > 1) overlapDetected = true;

      order.push(`${item.priority}:${item.callsign}:${item.direction}`);

      await new Promise<void>(resolve => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (ctx.isAborted()) {
            if (item.priority === 'ADVISORY') preemptedAdvisory = true;
            clearInterval(timer);
            resolve();
            return;
          }
          if (Date.now() - start >= (item.priority === 'ADVISORY' ? 80 : 12)) {
            clearInterval(timer);
            resolve();
          }
        }, 4);
      });

      concurrentAtFreq.set(item.normalizedFrequency, (concurrentAtFreq.get(item.normalizedFrequency) || 1) - 1);
    });

    // 1. Start a low-priority weather advisory first
    manager.enqueue({
      direction: 'atc_only',
      priority: 'ADVISORY',
      frequency: '119.725 MHz',
      callsign: 'ATIS',
      atcText: 'Weather update',
      pilotText: '',
    });

    // 2. Simultaneously queue normal call-in, clearance, cancelled clearance, conflict alert, and emergency!
    manager.enqueue({
      direction: 'pilot_only',
      priority: 'PILOT_CALLIN',
      frequency: '119.725 MHz',
      callsign: 'UAE310',
      pilotText: 'Inbound FL120',
    });
    manager.enqueue({
      direction: 'controller_to_pilot',
      priority: 'ATC_CLEARANCE',
      frequency: '119.725 MHz',
      callsign: 'BAW452',
      atcText: 'Fly heading 270',
      pilotText: 'Heading 270',
    });
    manager.enqueue({
      direction: 'controller_to_pilot',
      priority: 'CONFLICT_ALERT',
      frequency: '119.725 MHz',
      callsign: 'AFR228',
      atcText: 'Traffic alert',
      pilotText: 'Traffic in sight',
    });
    manager.enqueue({
      direction: 'pilot_to_controller',
      priority: 'EMERGENCY',
      frequency: '119.725 MHz',
      callsign: 'AAL101',
      atcText: 'Roger Mayday',
      pilotText: 'Mayday Mayday',
    });

    // Cancel BAW452 queued clearance before it transmits
    const cancelledCount = manager.cancelForCallsign('BAW452');
    expect(cancelledCount).toBe(1);

    await new Promise(r => setTimeout(r, 220));

    expect(overlapDetected).toBe(false);
    expect(preemptedAdvisory).toBe(true);
    // Cancelled flight must NOT have transmitted
    expect(order.some(e => e.includes('BAW452'))).toBe(false);
    // EMERGENCY executed immediately after preempted ADVISORY, then CONFLICT_ALERT, then PILOT_CALLIN
    expect(order).toEqual([
      'ADVISORY:ATIS:atc_only',
      'EMERGENCY:AAL101:pilot_to_controller',
      'CONFLICT_ALERT:AFR228:controller_to_pilot',
      'PILOT_CALLIN:UAE310:pilot_only',
    ]);
  });
});

describe('Simulation Store Real-Flight Radio Integration', () => {
  afterEach(() => {
    radioAudio.clearQueue();
  });

  it('logs authentic structured communications and prunes exited aircraft without altering flight simulation physics', () => {
    const store = useSimulationStore.getState();
    store.switchAirport('EGLL', '27R', '27L');
    const refreshed = useSimulationStore.getState();
    const ac = refreshed.aircraft[0];
    expect(ac).toBeDefined();

    const beforeLen = refreshed.radioMessages.length;
    refreshed.setHeading(ac.id, 270);

    const afterHdg = useSimulationStore.getState();
    expect(afterHdg.aircraft.find(f => f.id === ac.id)?.targetHeading).toBe(270);
    expect(afterHdg.radioMessages.length).toBeGreaterThan(beforeLen);
    expect(afterHdg.radioMessages[0].frequency).toBe(afterHdg.airportProfile.vhfFrequency);

    // Emergency injection creates real Squawk 7700 flight and Mayday transcript
    afterHdg.triggerEmergency('ENGINE_FAILURE');
    const afterEmer = useSimulationStore.getState();
    const emerAc = afterEmer.aircraft.find(f => f.isEmergency);
    expect(emerAc).toBeDefined();
    expect(emerAc?.transponder).toBe('7700');
    expect(afterEmer.radioMessages[0].text).toContain('Mayday Mayday Mayday!');
    expect(afterEmer.radioMessages[0].callsign).toBe(emerAc?.callsign);
  });
});
