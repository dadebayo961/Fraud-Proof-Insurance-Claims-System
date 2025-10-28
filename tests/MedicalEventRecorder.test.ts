import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PATIENT = 101;
const ERR_EVENT_NOT_FOUND = 102;
const ERR_INVALID_TIMESTAMP = 103;
const ERR_INVALID_SYMPTOMS = 104;
const ERR_INVALID_LOCATION = 105;
const ERR_PROVIDER_NOT_REGISTERED = 107;
const ERR_INVALID_EVENT_TYPE = 108;
const ERR_INVALID_SEVERITY = 124;
const ERR_INVALID_CURRENCY = 112;

interface MedicalEvent {
  patient: string;
  provider: string;
  eventType: string;
  timestamp: number;
  symptoms: string;
  location: string;
  cost: number;
  currency: string;
  status: string;
  severity: number;
  outcome: string;
  icdCodes: string[];
  cptCodes: string[];
  medications: string[];
  attachments: string[];
  referralRequired: boolean;
  followUpRequired: boolean;
  recordedAt: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class MedicalEventRecorderMock {
  state: {
    nextEventId: number;
    eventRecordingFee: number;
    admin: string;
    events: Map<number, MedicalEvent>;
    eventsByPatient: Map<string, number[]>;
    eventsByProvider: Map<string, number[]>;
  } = {
    nextEventId: 0,
    eventRecordingFee: 200,
    admin: "ST1ADMIN",
    events: new Map(),
    eventsByPatient: new Map(),
    eventsByProvider: new Map(),
  };
  blockHeight: number = 1000000;
  caller: string = "ST1PROVIDER";
  patients: Set<string> = new Set(["ST1PATIENT"]);
  providers: Set<string> = new Set(["ST1PROVIDER"]);
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextEventId: 0,
      eventRecordingFee: 200,
      admin: "ST1ADMIN",
      events: new Map(),
      eventsByPatient: new Map(),
      eventsByProvider: new Map(),
    };
    this.blockHeight = 1000000;
    this.caller = "ST1PROVIDER";
    this.patients = new Set(["ST1PATIENT"]);
    this.providers = new Set(["ST1PROVIDER"]);
    this.stxTransfers = [];
  }

  mockUserRegistryIsPatient(principal: string): Result<boolean> {
    return { ok: true, value: this.patients.has(principal) };
  }

  mockUserRegistryIsProvider(principal: string): Result<boolean> {
    return { ok: true, value: this.providers.has(principal) };
  }

  setEventRecordingFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.eventRecordingFee = newFee;
    return { ok: true, value: true };
  }

  recordMedicalEvent(
    patient: string,
    eventType: string,
    timestamp: number,
    symptoms: string,
    location: string,
    cost: number,
    currency: string,
    severity: number,
    icdCodes: string[],
    cptCodes: string[],
    medications: string[],
    attachments: string[],
    referralRequired: boolean,
    followUpRequired: boolean
  ): Result<number> {
    if (!this.mockUserRegistryIsPatient(patient).value)
      return { ok: false, value: ERR_INVALID_PATIENT };
    if (!this.mockUserRegistryIsProvider(this.caller).value)
      return { ok: false, value: ERR_PROVIDER_NOT_REGISTERED };
    if (
      !["consultation", "emergency", "surgery", "lab", "imaging"].includes(
        eventType
      )
    )
      return { ok: false, value: ERR_INVALID_EVENT_TYPE };
    if (timestamp > this.blockHeight)
      return { ok: false, value: ERR_INVALID_TIMESTAMP };
    if (symptoms.length > 500)
      return { ok: false, value: ERR_INVALID_SYMPTOMS };
    if (location.length > 100)
      return { ok: false, value: ERR_INVALID_LOCATION };
    if (cost < 0) return { ok: false, value: 111 };
    if (!["STX", "USD"].includes(currency))
      return { ok: false, value: ERR_INVALID_CURRENCY };
    if (severity < 1 || severity > 5)
      return { ok: false, value: ERR_INVALID_SEVERITY };
    if (icdCodes.length > 10) return { ok: false, value: 127 };
    if (cptCodes.length > 10) return { ok: false, value: 128 };
    if (medications.length > 20) return { ok: false, value: 116 };
    if (attachments.length > 5) return { ok: false, value: 118 };

    const eventId = this.state.nextEventId;
    this.stxTransfers.push({
      amount: this.state.eventRecordingFee,
      from: this.caller,
      to: this.state.admin,
    });

    const event: MedicalEvent = {
      patient,
      provider: this.caller,
      eventType,
      timestamp,
      symptoms,
      location,
      cost,
      currency,
      status: "recorded",
      severity,
      outcome: "pending",
      icdCodes,
      cptCodes,
      medications,
      attachments,
      referralRequired,
      followUpRequired,
      recordedAt: this.blockHeight,
    };

    this.state.events.set(eventId, event);

    const patientEvents = this.state.eventsByPatient.get(patient) || [];
    patientEvents.push(eventId);
    this.state.eventsByPatient.set(patient, patientEvents);

    const providerEvents = this.state.eventsByProvider.get(this.caller) || [];
    providerEvents.push(eventId);
    this.state.eventsByProvider.set(this.caller, providerEvents);

    this.state.nextEventId++;
    return { ok: true, value: eventId };
  }

  updateEventStatus(eventId: number, newStatus: string): Result<boolean> {
    const event = this.state.events.get(eventId);
    if (!event) return { ok: false, value: ERR_EVENT_NOT_FOUND };
    if (this.caller !== event.provider && this.caller !== event.patient)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!["verified", "rejected", "pending"].includes(newStatus))
      return { ok: false, value: 110 };
    this.state.events.set(eventId, { ...event, status: newStatus });
    return { ok: true, value: true };
  }

  updateEventOutcome(eventId: number, outcome: string): Result<boolean> {
    const event = this.state.events.get(eventId);
    if (!event) return { ok: false, value: ERR_EVENT_NOT_FOUND };
    if (this.caller !== event.provider)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.events.set(eventId, { ...event, outcome });
    return { ok: true, value: true };
  }

  getEventDetails(eventId: number): MedicalEvent | null {
    return this.state.events.get(eventId) || null;
  }

  getEventsByPatient(patient: string): number[] | null {
    return this.state.eventsByPatient.get(patient) || null;
  }

  getEventsByProvider(provider: string): number[] | null {
    return this.state.eventsByProvider.get(provider) || null;
  }

  getNextEventId(): Result<number> {
    return { ok: true, value: this.state.nextEventId };
  }
}

describe("MedicalEventRecorder", () => {
  let contract: MedicalEventRecorderMock;

  beforeEach(() => {
    contract = new MedicalEventRecorderMock();
    contract.reset();
  });

  it("records a medical event successfully", () => {
    const result = contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      "Headache and fever",
      "City Hospital",
      150,
      "USD",
      3,
      ["R51", "R50.9"],
      ["99203"],
      ["Ibuprofen"],
      ["scan.pdf"],
      false,
      true
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const event = contract.getEventDetails(0);
    expect(event?.eventType).toBe("consultation");
    expect(event?.symptoms).toBe("Headache and fever");
    expect(event?.status).toBe("recorded");
    expect(event?.severity).toBe(3);
    expect(contract.stxTransfers).toEqual([
      { amount: 200, from: "ST1PROVIDER", to: "ST1ADMIN" },
    ]);
  });

  it("rejects invalid patient", () => {
    const result = contract.recordMedicalEvent(
      "ST2FAKE",
      "consultation",
      999999,
      "Headache",
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PATIENT);
  });

  it("rejects non-provider caller", () => {
    contract.caller = "ST2FAKE";
    const result = contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      "Headache",
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROVIDER_NOT_REGISTERED);
  });

  it("rejects future timestamp", () => {
    const result = contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      1000001,
      "Headache",
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIMESTAMP);
  });

  it("rejects invalid event type", () => {
    const result = contract.recordMedicalEvent(
      "ST1PATIENT",
      "invalid",
      999999,
      "Headache",
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EVENT_TYPE);
  });

  it("rejects long symptoms", () => {
    const longSymptoms = "x".repeat(501);
    const result = contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      longSymptoms,
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SYMPTOMS);
  });

  it("rejects invalid currency", () => {
    const result = contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      "Headache",
      "Hospital",
      100,
      "BTC",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });

  it("rejects invalid severity", () => {
    const result = contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      "Headache",
      "Hospital",
      100,
      "USD",
      6,
      [],
      [],
      [],
      [],
      false,
      false
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SEVERITY);
  });

  it("indexes events by patient and provider", () => {
    contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      "Headache",
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    contract.recordMedicalEvent(
      "ST1PATIENT",
      "lab",
      999998,
      "Blood test",
      "Lab",
      50,
      "USD",
      1,
      [],
      [],
      [],
      [],
      false,
      false
    );
    contract.caller = "ST2PROVIDER";
    contract.providers.add("ST2PROVIDER");
    contract.recordMedicalEvent(
      "ST1PATIENT",
      "imaging",
      999997,
      "X-ray",
      "Radiology",
      200,
      "USD",
      3,
      [],
      [],
      [],
      [],
      false,
      false
    );

    const patientEvents = contract.getEventsByPatient("ST1PATIENT");
    expect(patientEvents).toEqual([0, 1, 2]);

    const provider1Events = contract.getEventsByProvider("ST1PROVIDER");
    expect(provider1Events).toEqual([0, 1]);

    const provider2Events = contract.getEventsByProvider("ST2PROVIDER");
    expect(provider2Events).toEqual([2]);
  });

  it("updates event status by patient or provider", () => {
    contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      "Headache",
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    contract.caller = "ST1PATIENT";
    const result = contract.updateEventStatus(0, "verified");
    expect(result.ok).toBe(true);
    const event = contract.getEventDetails(0);
    expect(event?.status).toBe("verified");
  });

  it("rejects status update by unauthorized", () => {
    contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      "Headache",
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateEventStatus(0, "verified");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("updates outcome by provider only", () => {
    contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      "Headache",
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    const result = contract.updateEventOutcome(0, "resolved");
    expect(result.ok).toBe(true);
    const event = contract.getEventDetails(0);
    expect(event?.outcome).toBe("resolved");
  });

  it("rejects outcome update by patient", () => {
    contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      "Headache",
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    contract.caller = "ST1PATIENT";
    const result = contract.updateEventOutcome(0, "resolved");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets recording fee by admin", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setEventRecordingFee(500);
    expect(result.ok).toBe(true);
    expect(contract.state.eventRecordingFee).toBe(500);
  });

  it("rejects fee change by non-admin", () => {
    const result = contract.setEventRecordingFee(500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets next event id", () => {
    contract.recordMedicalEvent(
      "ST1PATIENT",
      "consultation",
      999999,
      "Headache",
      "Hospital",
      100,
      "USD",
      2,
      [],
      [],
      [],
      [],
      false,
      false
    );
    const result = contract.getNextEventId();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });
});
