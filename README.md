# 🔒 Fraud-Proof Insurance Claims System

Welcome to a revolutionary blockchain-based insurance platform that eliminates fraud in medical claims! This project uses the Stacks blockchain and Clarity smart contracts to record medical events immutably, verify diagnoses from trusted sources, and automate payouts—ensuring transparency, speed, and trust for patients, doctors, and insurers.

## ✨ Features
🔐 Immutable on-chain recording of medical events and diagnoses  
🤖 Automated claim processing and payouts without intermediaries  
🩺 Verification of diagnoses by authorized medical professionals  
💰 Secure token-based premiums and payouts (using STX or custom tokens)  
🚨 Fraud detection through duplicate prevention and audit trails  
📊 Real-time claim status tracking for all parties  
⚖️ Built-in dispute resolution for contested claims  
🔄 Integration with oracles for off-chain data validation (e.g., hospital records)

## 🛠 How It Works
**For Patients**  
- Register your profile and purchase an insurance policy via the system.  
- When a medical event occurs, submit details (e.g., symptoms, date) to record it on-chain.  
- Once a doctor verifies the diagnosis, the system automatically evaluates your claim against policy rules and triggers a payout if approved.  
Boom! Funds are transferred instantly to your wallet—no paperwork delays or fraud risks.

**For Doctors/Providers**  
- Register as an authorized verifier with credentials.  
- Review patient-submitted events and submit verified diagnoses on-chain.  
- Earn rewards for timely verifications, with all actions logged immutably.

**For Insurers**  
- Create and manage policies with predefined rules (e.g., coverage limits, eligible conditions).  
- Monitor claims in real-time and intervene only in disputes.  
- Benefit from fraud-proof automation, reducing administrative costs.

**Overall Process**  
1. Patient records a medical event.  
2. Doctor verifies and records the diagnosis.  
3. System checks against policy rules and automates payout.  
4. All steps are auditable on the blockchain for transparency.

## 📜 Smart Contracts
This project involves 8 Clarity smart contracts to handle various aspects securely and efficiently:

1. **UserRegistry.clar**: Manages registration and authentication of patients, doctors, and insurers, storing profiles and roles on-chain.  
2. **PolicyManager.clar**: Allows insurers to create, update, and query insurance policies, including coverage details and premium requirements.  
3. **MedicalEventRecorder.clar**: Records patient-submitted medical events with timestamps, preventing duplicates via unique hashes.  
4. **DiagnosisVerifier.clar**: Enables authorized doctors to submit and verify diagnoses, linking them to events with cryptographic proofs.  
5. **ClaimProcessor.clar**: Automates claim evaluation based on verified data and policy rules, triggering payouts or rejections.  
6. **TokenHandler.clar**: Manages premium payments and payout distributions using STX or fungible tokens, ensuring secure transfers.  
7. **DisputeResolver.clar**: Handles claim disputes with voting or oracle-based resolution, maintaining an immutable record.  
8. **AuditLogger.clar**: Logs all actions across contracts for transparency and compliance, allowing queries for audits.