const { v4: uuidv4 } = require("uuid");
const config = require("../config");

/**
 * Decides whether a simulated payment attempt succeeds.
 * `forceOutcome`, when given, always wins -- this mirrors how real sandbox
 * payment gateways offer "magic" test card numbers/values so integrators can
 * write deterministic tests instead of depending on randomness.
 */
function decideOutcome(forceOutcome) {
  if (forceOutcome === "SUCCESS" || forceOutcome === "FAILED") {
    return forceOutcome;
  }
  return Math.random() < config.paymentSuccessRate ? "SUCCESS" : "FAILED";
}

/** Generates a fake payment-provider transaction reference. */
function generateProviderReference() {
  return `sim_${uuidv4()}`;
}

module.exports = { decideOutcome, generateProviderReference };
