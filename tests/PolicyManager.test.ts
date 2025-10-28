import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_COVERAGE = 105;
const ERR_INVALID_DEDUCTIBLE = 106;
const ERR_INVALID_COINSURANCE = 107;
const ERR_INVALID_PREMIUM = 111;
const ERR_INVALID_EXPIRY_DATE = 110;
const ERR_INVALID_WAITING_PERIOD = 108;
const ERR_POLICY_NOT_FOUND = 116;
const ERR_INSURER_ONLY = 119;
const ERR_INVALID_STATUS = 118;
const ERR_RENEWAL_TOO_EARLY = 122;
const ERR_CANCELLATION_NOT_ALLOWED = 130;
const ERR_POLICY_NOT_ACTIVE = 103;

interface Policy {
  insurer: string;
  insured: string;
  policyType: string;
  coverage: number;
  deductible: number;
  coinsurance: number;
  premium: number;
  startDate: number;
  expiryDate: number;
  waitingPeriod: number;
  gracePeriod: number;
  claimLimit: number;
  lifetimeMax: number;
  exclusions: string[];
  benefits: string[];
  currency: string;
  location: string;
  status: string;
  createdAt: number;
  renewedAt: number;
  cancelledAt: number | null;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class PolicyManagerMock {
  state: {
    nextPolicyId: number;
    policyCreationFee: number;
    admin: string;
    policies: Map<number, Policy>;
    policiesByInsured: Map<string, number[]>;
    claimCounts: Map<number, number>;
    lifetimeSpent: Map<number, number>;
  } = {
    nextPolicyId: 0,
    policyCreationFee: 500,
    admin: "ST1ADMIN",
    policies: new Map(),
    policiesByInsured: new Map(),
    claimCounts: new Map(),
    lifetimeSpent: new Map(),
  };
  blockHeight: number = 1000000;
  caller: string = "ST1INSURER";
  users: Set<string> = new Set(["ST1INSURED"]);
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextPolicyId: 0,
      policyCreationFee: 500,
      admin: "ST1ADMIN",
      policies: new Map(),
      policiesByInsured: new Map(),
      claimCounts: new Map(),
      lifetimeSpent: new Map(),
    };
    this.blockHeight = 1000000;
    this.caller = "ST1INSURER";
    this.users = new Set(["ST1INSURED"]);
    this.stxTransfers = [];
  }

  mockUserRegistry(principal: string): Result<boolean> {
    return { ok: true, value: this.users.has(principal) };
  }

  setPolicyCreationFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.policyCreationFee = newFee;
    return { ok: true, value: true };
  }

  createPolicy(
    insured: string,
    policyType: string,
    coverage: number,
    deductible: number,
    coinsurance: number,
    premium: number,
    termDays: number,
    waitingPeriod: number,
    exclusions: string[],
    currency: string
  ): Result<number> {
    if (!this.mockUserRegistry(insured).value) return { ok: false, value: 101 };
    if (!["health", "life", "accident"].includes(policyType))
      return { ok: false, value: 137 };
    if (coverage <= 0) return { ok: false, value: ERR_INVALID_COVERAGE };
    if (deductible > coverage)
      return { ok: false, value: ERR_INVALID_DEDUCTIBLE };
    if (coinsurance <= 0 || coinsurance > 100)
      return { ok: false, value: ERR_INVALID_COINSURANCE };
    if (premium <= 0) return { ok: false, value: ERR_INVALID_PREMIUM };
    if (waitingPeriod > 365)
      return { ok: false, value: ERR_INVALID_WAITING_PERIOD };
    if (!["STX", "USD"].includes(currency)) return { ok: false, value: 138 };
    if (exclusions.length > 10) return { ok: false, value: 114 };

    const policyId = this.state.nextPolicyId;
    const startDate = this.blockHeight;
    const expiryDate = startDate + termDays * 86400;

    this.stxTransfers.push({
      amount: this.state.policyCreationFee,
      from: this.caller,
      to: this.state.admin,
    });

    const policy: Policy = {
      insurer: this.caller,
      insured,
      policyType,
      coverage,
      deductible,
      coinsurance,
      premium,
      startDate,
      expiryDate,
      waitingPeriod,
      gracePeriod: 30,
      claimLimit: 10,
      lifetimeMax: coverage,
      exclusions,
      benefits: ["hospitalization", "medication"],
      currency,
      location: "global",
      status: "active",
      createdAt: this.blockHeight,
      renewedAt: 0,
      cancelledAt: null,
    };

    this.state.policies.set(policyId, policy);
    const insuredPolicies = this.state.policiesByInsured.get(insured) || [];
    insuredPolicies.push(policyId);
    this.state.policiesByInsured.set(insured, insuredPolicies);
    this.state.nextPolicyId++;

    return { ok: true, value: policyId };
  }

  renewPolicy(policyId: number, newTermDays: number): Result<boolean> {
    const policy = this.state.policies.get(policyId);
    if (!policy) return { ok: false, value: ERR_POLICY_NOT_FOUND };
    if (this.caller !== policy.insurer)
      return { ok: false, value: ERR_INSURER_ONLY };
    if (policy.status !== "active")
      return { ok: false, value: ERR_INVALID_STATUS };
    if (this.blockHeight < policy.expiryDate - 2592000)
      return { ok: false, value: ERR_RENEWAL_TOO_EARLY };

    const newExpiry = policy.expiryDate + newTermDays * 86400;
    this.state.policies.set(policyId, {
      ...policy,
      expiryDate: newExpiry,
      renewedAt: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  cancelPolicy(policyId: number): Result<boolean> {
    const policy = this.state.policies.get(policyId);
    if (!policy) return { ok: false, value: ERR_POLICY_NOT_FOUND };
    if (this.caller !== policy.insurer && this.caller !== policy.insured)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (policy.status !== "active")
      return { ok: false, value: ERR_CANCELLATION_NOT_ALLOWED };

    this.state.policies.set(policyId, {
      ...policy,
      status: "cancelled",
      cancelledAt: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  incrementClaimCount(policyId: number, amount: number): Result<boolean> {
    const policy = this.state.policies.get(policyId);
    if (!policy) return { ok: false, value: ERR_POLICY_NOT_FOUND };
    if (policy.status !== "active")
      return { ok: false, value: ERR_POLICY_NOT_ACTIVE };

    const currentCount = this.state.claimCounts.get(policyId) || 0;
    this.state.claimCounts.set(policyId, currentCount + 1);
    const currentSpent = this.state.lifetimeSpent.get(policyId) || 0;
    this.state.lifetimeSpent.set(policyId, currentSpent + amount);
    return { ok: true, value: true };
  }

  getPolicy(policyId: number): Policy | null {
    return this.state.policies.get(policyId) || null;
  }

  getPoliciesByInsured(insured: string): number[] | null {
    return this.state.policiesByInsured.get(insured) || null;
  }

  getClaimCount(policyId: number): number {
    return this.state.claimCounts.get(policyId) || 0;
  }

  getLifetimeSpent(policyId: number): number {
    return this.state.lifetimeSpent.get(policyId) || 0;
  }

  isPolicyActive(policyId: number): boolean {
    const policy = this.state.policies.get(policyId);
    return policy
      ? policy.status === "active" && policy.expiryDate >= this.blockHeight
      : false;
  }

  getNextPolicyId(): Result<number> {
    return { ok: true, value: this.state.nextPolicyId };
  }
}

describe("PolicyManager", () => {
  let contract: PolicyManagerMock;

  beforeEach(() => {
    contract = new PolicyManagerMock();
    contract.reset();
  });

  it("creates a policy successfully", () => {
    const result = contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      ["cosmetic"],
      "STX"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const policy = contract.getPolicy(0);
    expect(policy?.policyType).toBe("health");
    expect(policy?.coverage).toBe(1000000);
    expect(policy?.deductible).toBe(1000);
    expect(policy?.coinsurance).toBe(80);
    expect(policy?.status).toBe("active");
    expect(contract.stxTransfers).toEqual([
      { amount: 500, from: "ST1INSURER", to: "ST1ADMIN" },
    ]);
  });

  it("rejects invalid policy type", () => {
    const result = contract.createPolicy(
      "ST1INSURED",
      "invalid",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    expect(result.ok).toBe(false);
  });

  it("rejects zero coverage", () => {
    const result = contract.createPolicy(
      "ST1INSURED",
      "health",
      0,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_COVERAGE);
  });

  it("rejects deductible exceeding coverage", () => {
    const result = contract.createPolicy(
      "ST1INSURED",
      "health",
      1000,
      2000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DEDUCTIBLE);
  });

  it("rejects invalid coinsurance", () => {
    const result = contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      150,
      5000,
      365,
      30,
      [],
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_COINSURANCE);
  });

  it("rejects invalid waiting period", () => {
    const result = contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      400,
      [],
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_WAITING_PERIOD);
  });

  it("links policy to insured", () => {
    contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    contract.createPolicy(
      "ST1INSURED",
      "life",
      500000,
      0,
      100,
      2000,
      730,
      0,
      [],
      "USD"
    );
    const policies = contract.getPoliciesByInsured("ST1INSURED");
    expect(policies).toEqual([0, 1]);
  });

  it("renews policy successfully", () => {
    contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    contract.blockHeight = 1000000 + 365 * 86400 - 2592000 + 100;
    const result = contract.renewPolicy(0, 180);
    expect(result.ok).toBe(true);
    const policy = contract.getPolicy(0);
    expect(policy?.expiryDate).toBeGreaterThan(1000000 + 365 * 86400);
  });

  it("rejects renewal too early", () => {
    contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    contract.blockHeight = 1000000 + 100 * 86400;
    const result = contract.renewPolicy(0, 180);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_RENEWAL_TOO_EARLY);
  });

  it("cancels policy by insurer", () => {
    contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    const result = contract.cancelPolicy(0);
    expect(result.ok).toBe(true);
    const policy = contract.getPolicy(0);
    expect(policy?.status).toBe("cancelled");
    expect(policy?.cancelledAt).toBe(contract.blockHeight);
  });

  it("cancels policy by insured", () => {
    contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    contract.caller = "ST1INSURED";
    const result = contract.cancelPolicy(0);
    expect(result.ok).toBe(true);
  });

  it("rejects cancellation by unauthorized", () => {
    contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    contract.caller = "ST2FAKE";
    const result = contract.cancelPolicy(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("increments claim count and lifetime spent", () => {
    contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    contract.incrementClaimCount(0, 50000);
    expect(contract.getClaimCount(0)).toBe(1);
    expect(contract.getLifetimeSpent(0)).toBe(50000);
  });

  it("checks policy active status", () => {
    contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    expect(contract.isPolicyActive(0)).toBe(true);
    contract.blockHeight = 1000000 + 366 * 86400;
    expect(contract.isPolicyActive(0)).toBe(false);
  });

  it("sets creation fee by admin", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setPolicyCreationFee(1000);
    expect(result.ok).toBe(true);
    expect(contract.state.policyCreationFee).toBe(1000);
  });

  it("rejects fee change by non-admin", () => {
    const result = contract.setPolicyCreationFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets next policy id", () => {
    contract.createPolicy(
      "ST1INSURED",
      "health",
      1000000,
      1000,
      80,
      5000,
      365,
      30,
      [],
      "STX"
    );
    const result = contract.getNextPolicyId();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });
});
