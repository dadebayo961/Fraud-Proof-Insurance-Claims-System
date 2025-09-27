import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, cvToJSON, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PATIENT = 101;
const ERR_INVALID_EVENT = 102;
const ERR_INVALID_DIAGNOSIS = 103;
const ERR_INVALID_POLICY = 104;
const ERR_CLAIM_ALREADY_PROCESSED = 105;
const ERR_PAYOUT_FAILED = 106;
const ERR_INVALID_STATUS = 107;
const ERR_INVALID_AMOUNT = 108;
const ERR_INVALID_TIMESTAMP = 109;
const ERR_DISPUTE_ALREADY_INITIATED = 110;
const ERR_INVALID_CLAIM_ID = 111;
const ERR_POLICY_NOT_ACTIVE = 112;
const ERR_DIAGNOSIS_NOT_VERIFIED = 113;
const ERR_EVENT_NOT_LINKED = 114;
const ERR_INSUFFICIENT_COVERAGE = 115;
const ERR_DEDUCTIBLE_NOT_MET = 118;
const ERR_CLAIM_EXCLUDED = 125;
const ERR_WAITING_PERIOD_NOT_MET = 127;
const ERR_POLICY_EXPIRED = 129;

interface Claim {
  patient: string;
  eventId: number;
  diagnosisId: number;
  policyId: number;
  status: string;
  payoutAmount: number;
  timestamp: number;
  disputeInitiated: boolean;
}

interface ClaimAdjustment {
  adjustmentAmount: number;
  reason: string;
  adjuster: string;
  timestamp: number;
}

interface Policy {
  insured: string;
  active: boolean;
  coverage: number;
  deductible: number;
  coinsurance: number;
  waitingPeriod: number;
  startDate: number;
  exclusions: string[];
}

interface Diagnosis {
  condition: string;
  cost: number;
  verified: boolean;
  eventId: number;
}

interface Event {
  patient: string;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ClaimProcessorMock {
  state: {
    nextClaimId: number;
    processingFee: number;
    admin: string;
    claims: Map<number, Claim>;
    claimAdjustments: Map<number, ClaimAdjustment>;
  } = {
    nextClaimId: 0,
    processingFee: 100,
    admin: "ST1ADMIN",
    claims: new Map(),
    claimAdjustments: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  users: Set<string> = new Set(["ST1TEST"]);
  events: Map<number, Event> = new Map();
  diagnoses: Map<number, Diagnosis> = new Map();
  policies: Map<number, Policy> = new Map();
  insurers: Map<number, string> = new Map();
  transfers: Array<{ amount: number; from: string; to: string }> = [];
  logs: Array<{ claimId: number; status: string; reason: string }> = [];
  disputes: Array<{ claimId: number }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextClaimId: 0,
      processingFee: 100,
      admin: "ST1ADMIN",
      claims: new Map(),
      claimAdjustments: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.users = new Set(["ST1TEST"]);
    this.events = new Map();
    this.diagnoses = new Map();
    this.policies = new Map();
    this.insurers = new Map();
    this.transfers = [];
    this.logs = [];
    this.disputes = [];
  }

  mockUserRegistry(principal: string): Result<boolean> {
    return { ok: true, value: this.users.has(principal) };
  }

  mockMedicalEventRecorder(eventId: number): Result<Event | null> {
    const event = this.events.get(eventId) || null;
    return { ok: true, value: event };
  }

  mockDiagnosisVerifier(diagnosisId: number): Result<Diagnosis | null> {
    const diagnosis = this.diagnoses.get(diagnosisId) || null;
    return { ok: true, value: diagnosis };
  }

  mockPolicyManager(policyId: number): Result<Policy | null> {
    const policy = this.policies.get(policyId) || null;
    return { ok: true, value: policy };
  }

  mockIsInsurer(principal: string, policyId: number): Result<boolean> {
    return { ok: true, value: this.insurers.get(policyId) === principal };
  }

  mockTransferTokens(amount: number, from: string, to: string): Result<boolean> {
    this.transfers.push({ amount, from, to });
    return { ok: true, value: true };
  }

  mockLogClaimOutcome(claimId: number, status: string, reason: string): Result<boolean> {
    this.logs.push({ claimId, status, reason });
    return { ok: true, value: true };
  }

  mockInitiateDispute(claimId: number): Result<boolean> {
    this.disputes.push({ claimId });
    return { ok: true, value: true };
  }

  setProcessingFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.processingFee = newFee;
    return { ok: true, value: true };
  }

  processClaim(patient: string, eventId: number, diagnosisId: number, policyId: number): Result<number> {
    const nextId = this.state.nextClaimId;
    if (this.state.claims.has(nextId)) return { ok: false, value: ERR_CLAIM_ALREADY_PROCESSED };
    if (!this.mockUserRegistry(patient).value) return { ok: false, value: ERR_INVALID_PATIENT };
    const event = this.mockMedicalEventRecorder(eventId).value;
    if (!event || event.patient !== patient) return { ok: false, value: ERR_INVALID_EVENT };
    const diagnosis = this.mockDiagnosisVerifier(diagnosisId).value;
    if (!diagnosis || !diagnosis.verified || diagnosis.eventId !== eventId) return { ok: false, value: ERR_INVALID_DIAGNOSIS };
    const policy = this.mockPolicyManager(policyId).value;
    if (!policy || !policy.active || policy.insured !== patient) return { ok: false, value: ERR_INVALID_POLICY };
    if (event.timestamp < policy.startDate + policy.waitingPeriod) return { ok: false, value: ERR_WAITING_PERIOD_NOT_MET };
    if (policy.exclusions.includes(diagnosis.condition)) return { ok: false, value: ERR_CLAIM_EXCLUDED };
    const cost = diagnosis.cost;
    if (cost < policy.deductible) return { ok: false, value: ERR_DEDUCTIBLE_NOT_MET };
    const afterDeductible = cost - policy.deductible;
    const insuredShare = Math.floor((afterDeductible * policy.coinsurance) / 100);
    if (insuredShare > policy.coverage) return { ok: false, value: ERR_INSUFFICIENT_COVERAGE };
    this.mockTransferTokens(insuredShare, "contract", patient);
    this.state.claims.set(nextId, {
      patient,
      eventId,
      diagnosisId,
      policyId,
      status: "approved",
      payoutAmount: insuredShare,
      timestamp: this.blockHeight,
      disputeInitiated: false,
    });
    this.mockLogClaimOutcome(nextId, "approved", "Payout successful");
    this.state.nextClaimId++;
    return { ok: true, value: nextId };
  }

  initiateDispute(claimId: number): Result<boolean> {
    const claim = this.state.claims.get(claimId);
    if (!claim) return { ok: false, value: ERR_INVALID_CLAIM_ID };
    if (claim.disputeInitiated) return { ok: false, value: ERR_DISPUTE_ALREADY_INITIATED };
    const isPatient = this.caller === claim.patient;
    const isInsurer = this.mockIsInsurer(this.caller, claim.policyId).value;
    if (!isPatient && !isInsurer) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.claims.set(claimId, { ...claim, disputeInitiated: true, status: "disputed" });
    this.mockInitiateDispute(claimId);
    this.mockLogClaimOutcome(claimId, "disputed", "Dispute initiated");
    return { ok: true, value: true };
  }

  adjustClaim(claimId: number, adjustmentAmount: number, reason: string): Result<boolean> {
    const claim = this.state.claims.get(claimId);
    if (!claim) return { ok: false, value: ERR_INVALID_CLAIM_ID };
    if (claim.status !== "approved") return { ok: false, value: ERR_INVALID_STATUS };
    if (!this.mockIsInsurer(this.caller, claim.policyId).value) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (adjustmentAmount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.claimAdjustments.set(claimId, {
      adjustmentAmount,
      reason,
      adjuster: this.caller,
      timestamp: this.blockHeight,
    });
    this.state.claims.set(claimId, { ...claim, payoutAmount: claim.payoutAmount - adjustmentAmount });
    this.mockLogClaimOutcome(claimId, "adjusted", reason);
    return { ok: true, value: true };
  }

  getClaim(claimId: number): Claim | null {
    return this.state.claims.get(claimId) || null;
  }

  getClaimStatus(claimId: number): Result<string> {
    const claim = this.state.claims.get(claimId);
    if (!claim) return { ok: false, value: "" };
    return { ok: true, value: claim.status };
  }

  getNextClaimId(): Result<number> {
    return { ok: true, value: this.state.nextClaimId };
  }
}

describe("ClaimProcessor", () => {
  let contract: ClaimProcessorMock;

  beforeEach(() => {
    contract = new ClaimProcessorMock();
    contract.reset();
  });

  it("processes a claim successfully", () => {
    contract.users.add("ST1TEST");
    contract.events.set(1, { patient: "ST1TEST", timestamp: 100 });
    contract.diagnoses.set(1, { condition: "flu", cost: 200, verified: true, eventId: 1 });
    contract.policies.set(1, { insured: "ST1TEST", active: true, coverage: 1000, deductible: 50, coinsurance: 80, waitingPeriod: 30, startDate: 50, exclusions: [] });
    contract.insurers.set(1, "ST2INSURER");
    const result = contract.processClaim("ST1TEST", 1, 1, 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const claim = contract.getClaim(0);
    expect(claim?.status).toBe("approved");
    expect(claim?.payoutAmount).toBe(120); // (200-50)*0.8 = 120
    expect(contract.transfers).toEqual([{ amount: 120, from: "contract", to: "ST1TEST" }]);
    expect(contract.logs).toEqual([{ claimId: 0, status: "approved", reason: "Payout successful" }]);
  });

  it("rejects invalid patient", () => {
    const result = contract.processClaim("ST2FAKE", 1, 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PATIENT);
  });

  it("rejects invalid event", () => {
    contract.users.add("ST1TEST");
    const result = contract.processClaim("ST1TEST", 1, 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EVENT);
  });

  it("rejects invalid diagnosis", () => {
    contract.users.add("ST1TEST");
    contract.events.set(1, { patient: "ST1TEST", timestamp: 100 });
    const result = contract.processClaim("ST1TEST", 1, 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DIAGNOSIS);
  });

  it("rejects invalid policy", () => {
    contract.users.add("ST1TEST");
    contract.events.set(1, { patient: "ST1TEST", timestamp: 100 });
    contract.diagnoses.set(1, { condition: "flu", cost: 200, verified: true, eventId: 1 });
    const result = contract.processClaim("ST1TEST", 1, 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_POLICY);
  });

  it("rejects if waiting period not met", () => {
    contract.users.add("ST1TEST");
    contract.events.set(1, { patient: "ST1TEST", timestamp: 70 });
    contract.diagnoses.set(1, { condition: "flu", cost: 200, verified: true, eventId: 1 });
    contract.policies.set(1, { insured: "ST1TEST", active: true, coverage: 1000, deductible: 50, coinsurance: 80, waitingPeriod: 30, startDate: 50, exclusions: [] });
    const result = contract.processClaim("ST1TEST", 1, 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_WAITING_PERIOD_NOT_MET);
  });

  it("rejects excluded condition", () => {
    contract.users.add("ST1TEST");
    contract.events.set(1, { patient: "ST1TEST", timestamp: 100 });
    contract.diagnoses.set(1, { condition: "flu", cost: 200, verified: true, eventId: 1 });
    contract.policies.set(1, { insured: "ST1TEST", active: true, coverage: 1000, deductible: 50, coinsurance: 80, waitingPeriod: 30, startDate: 50, exclusions: ["flu"] });
    const result = contract.processClaim("ST1TEST", 1, 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CLAIM_EXCLUDED);
  });

  it("rejects if deductible not met", () => {
    contract.users.add("ST1TEST");
    contract.events.set(1, { patient: "ST1TEST", timestamp: 100 });
    contract.diagnoses.set(1, { condition: "flu", cost: 40, verified: true, eventId: 1 });
    contract.policies.set(1, { insured: "ST1TEST", active: true, coverage: 1000, deductible: 50, coinsurance: 80, waitingPeriod: 30, startDate: 50, exclusions: [] });
    const result = contract.processClaim("ST1TEST", 1, 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DEDUCTIBLE_NOT_MET);
  });

  it("rejects insufficient coverage", () => {
    contract.users.add("ST1TEST");
    contract.events.set(1, { patient: "ST1TEST", timestamp: 100 });
    contract.diagnoses.set(1, { condition: "flu", cost: 2000, verified: true, eventId: 1 });
    contract.policies.set(1, { insured: "ST1TEST", active: true, coverage: 1000, deductible: 50, coinsurance: 80, waitingPeriod: 30, startDate: 50, exclusions: [] });
    const result = contract.processClaim("ST1TEST", 1, 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_COVERAGE);
  });

  it("initiates dispute successfully", () => {
    contract.state.claims.set(0, { patient: "ST1TEST", eventId: 1, diagnosisId: 1, policyId: 1, status: "approved", payoutAmount: 120, timestamp: 100, disputeInitiated: false });
    contract.insurers.set(1, "ST2INSURER");
    contract.caller = "ST2INSURER";
    const result = contract.initiateDispute(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const claim = contract.getClaim(0);
    expect(claim?.status).toBe("disputed");
    expect(claim?.disputeInitiated).toBe(true);
    expect(contract.disputes).toEqual([{ claimId: 0 }]);
    expect(contract.logs).toEqual([{ claimId: 0, status: "disputed", reason: "Dispute initiated" }]);
  });

  it("rejects dispute for non-authorized", () => {
    contract.state.claims.set(0, { patient: "ST1TEST", eventId: 1, diagnosisId: 1, policyId: 1, status: "approved", payoutAmount: 120, timestamp: 100, disputeInitiated: false });
    contract.insurers.set(1, "ST2INSURER");
    contract.caller = "ST3FAKE";
    const result = contract.initiateDispute(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects already disputed claim", () => {
    contract.state.claims.set(0, { patient: "ST1TEST", eventId: 1, diagnosisId: 1, policyId: 1, status: "disputed", payoutAmount: 120, timestamp: 100, disputeInitiated: true });
    contract.caller = "ST1TEST";
    const result = contract.initiateDispute(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DISPUTE_ALREADY_INITIATED);
  });

  it("adjusts claim successfully", () => {
    contract.state.claims.set(0, { patient: "ST1TEST", eventId: 1, diagnosisId: 1, policyId: 1, status: "approved", payoutAmount: 120, timestamp: 100, disputeInitiated: false });
    contract.insurers.set(1, "ST2INSURER");
    contract.caller = "ST2INSURER";
    const result = contract.adjustClaim(0, 20, "Overcharge");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const claim = contract.getClaim(0);
    expect(claim?.payoutAmount).toBe(100);
    const adjustment = contract.state.claimAdjustments.get(0);
    expect(adjustment?.adjustmentAmount).toBe(20);
    expect(adjustment?.reason).toBe("Overcharge");
    expect(adjustment?.adjuster).toBe("ST2INSURER");
    expect(contract.logs).toEqual([{ claimId: 0, status: "adjusted", reason: "Overcharge" }]);
  });

  it("rejects adjustment for non-approved claim", () => {
    contract.state.claims.set(0, { patient: "ST1TEST", eventId: 1, diagnosisId: 1, policyId: 1, status: "pending", payoutAmount: 120, timestamp: 100, disputeInitiated: false });
    contract.insurers.set(1, "ST2INSURER");
    contract.caller = "ST2INSURER";
    const result = contract.adjustClaim(0, 20, "Overcharge");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("rejects adjustment by non-insurer", () => {
    contract.state.claims.set(0, { patient: "ST1TEST", eventId: 1, diagnosisId: 1, policyId: 1, status: "approved", payoutAmount: 120, timestamp: 100, disputeInitiated: false });
    contract.insurers.set(1, "ST2INSURER");
    contract.caller = "ST3FAKE";
    const result = contract.adjustClaim(0, 20, "Overcharge");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects invalid adjustment amount", () => {
    contract.state.claims.set(0, { patient: "ST1TEST", eventId: 1, diagnosisId: 1, policyId: 1, status: "approved", payoutAmount: 120, timestamp: 100, disputeInitiated: false });
    contract.insurers.set(1, "ST2INSURER");
    contract.caller = "ST2INSURER";
    const result = contract.adjustClaim(0, 0, "Overcharge");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("sets processing fee successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setProcessingFee(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.processingFee).toBe(200);
  });

  it("rejects set processing fee by non-admin", () => {
    contract.caller = "ST2FAKE";
    const result = contract.setProcessingFee(200);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets claim status correctly", () => {
    contract.state.claims.set(0, { patient: "ST1TEST", eventId: 1, diagnosisId: 1, policyId: 1, status: "approved", payoutAmount: 120, timestamp: 100, disputeInitiated: false });
    const result = contract.getClaimStatus(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe("approved");
  });

  it("rejects get status for invalid claim", () => {
    const result = contract.getClaimStatus(99);
    expect(result.ok).toBe(false);
  });

  it("gets next claim id correctly", () => {
    contract.state.nextClaimId = 5;
    const result = contract.getNextClaimId();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(5);
  });

  it("uses Clarity types for parameters", () => {
    const claimId = uintCV(0);
    expect(cvToJSON(claimId).value).toBe("0");
  });
});