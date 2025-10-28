(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PATIENT u101)
(define-constant ERR-INVALID-EVENT u102)
(define-constant ERR-INVALID-DIAGNOSIS u103)
(define-constant ERR-INVALID-POLICY u104)
(define-constant ERR-CLAIM-ALREADY-PROCESSED u105)
(define-constant ERR-PAYOUT-FAILED u106)
(define-constant ERR-INVALID-STATUS u107)
(define-constant ERR-INVALID-AMOUNT u108)
(define-constant ERR-INVALID-TIMESTAMP u109)
(define-constant ERR-DISPUTE-ALREADY_INITIATED u110)
(define-constant ERR-INVALID-CLAIM-ID u111)
(define-constant ERR-POLICY-NOT-ACTIVE u112)
(define-constant ERR-DIAGNOSIS-NOT-VERIFIED u113)
(define-constant ERR-EVENT-NOT-LINKED u114)
(define-constant ERR-INSUFFICIENT-COVERAGE u115)
(define-constant ERR-INVALID-COVERAGE-LIMIT u116)
(define-constant ERR-INVALID-DEDUCTIBLE u117)
(define-constant ERR-DEDUCTIBLE-NOT-MET u118)
(define-constant ERR-INVALID-COINSURANCE u119)
(define-constant ERR-INVALID-OUT-OF-POCKET u120)
(define-constant ERR-OUT-OF-POCKET-EXCEEDED u121)
(define-constant ERR-INVALID-PREMIUM u122)
(define-constant ERR-PREMIUM-NOT-PAID u123)
(define-constant ERR-INVALID-EXCLUSION u124)
(define-constant ERR-CLAIM-EXCLUDED u125)
(define-constant ERR-INVALID-WAITING-PERIOD u126)
(define-constant ERR-WAITING-PERIOD-NOT-MET u127)
(define-constant ERR-INVALID-RENEWAL-DATE u128)
(define-constant ERR-POLICY-EXPIRED u129)
(define-constant ERR-INVALID-BENEFICIARY u130)
(define-constant ERR-INVALID-PROVIDER u131)
(define-constant ERR-PROVIDER-NOT-AUTHORIZED u132)
(define-constant ERR-INVALID-SERVICE-CODE u133)
(define-constant ERR-SERVICE-NOT-COVERED u134)
(define-constant ERR-INVALID-CLAIM-AMOUNT u135)
(define-constant ERR-CLAIM-AMOUNT-EXCEEDS-COVERAGE u136)
(define-constant ERR-INVALID-ADJUSTMENT u137)
(define-constant ERR-INVALID-APPEAL u138)
(define-constant ERR-APPEAL-ALREADY_SUBMITTED u139)
(define-constant ERR-INVALID-REVIEW u140)
(define-constant ERR-REVIEW-NOT_REQUIRED u141)
(define-data-var next-claim-id uint u0)
(define-data-var processing-fee uint u100)
(define-data-var admin principal tx-sender)
(define-map claims
  uint
  {
    patient: principal,
    event-id: uint,
    diagnosis-id: uint,
    policy-id: uint,
    status: (string-ascii 20),
    payout-amount: uint,
    timestamp: uint,
    dispute-initiated: bool
  }
)
(define-map claim-adjustments
  uint
  {
    adjustment-amount: uint,
    reason: (string-utf8 200),
    adjuster: principal,
    timestamp: uint
  }
)
(define-read-only (get-claim (claim-id uint))
  (map-get? claims claim-id)
)
(define-read-only (get-claim-adjustment (claim-id uint))
  (map-get? claim-adjustments claim-id)
)
(define-read-only (get-claim-status (claim-id uint))
  (match (map-get? claims claim-id)
    claim (ok (get status claim))
    (err ERR-INVALID-CLAIM-ID)
  )
)
(define-private (validate-patient (patient principal))
  (contract-call? .UserRegistry is-user-registered patient)
)
(define-private (validate-event (event-id uint) (patient principal))
  (let ((event (contract-call? .MedicalEventRecorder get-event-details event-id)))
    (if (and (is-ok event) (is-eq (get patient (unwrap! event (err ERR-INVALID-EVENT))) patient))
      (ok true)
      (err ERR-INVALID-EVENT)
    )
  )
)
(define-private (validate-diagnosis (diagnosis-id uint) (event-id uint))
  (let ((diagnosis (contract-call? .DiagnosisVerifier get-diagnosis-details diagnosis-id)))
    (if (and (is-ok diagnosis) (is-eq (get event-id (unwrap! diagnosis (err ERR-INVALID-DIAGNOSIS))) event-id) (get verified (unwrap! diagnosis (err ERR-INVALID-DIAGNOSIS))))
      (ok true)
      (err ERR-INVALID-DIAGNOSIS)
    )
  )
)
(define-private (validate-policy (policy-id uint) (patient principal))
  (let ((policy (contract-call? .PolicyManager get-policy-details policy-id)))
    (if (and (is-ok policy) (is-eq (get insured (unwrap! policy (err ERR-INVALID-POLICY))) patient) (get active (unwrap! policy (err ERR-INVALID-POLICY))))
      (ok (unwrap! policy (err ERR-INVALID-POLICY)))
      (err ERR-INVALID-POLICY)
    )
  )
)
(define-private (calculate-payout (diagnosis (tuple (condition (string-ascii 50)) (cost uint))) (policy (tuple (coverage uint) (deductible uint) (coinsurance uint))))
  (let (
    (cost (get cost diagnosis))
    (deductible (get deductible policy))
    (coinsurance (get coinsurance policy))
    (coverage (get coverage policy))
  )
    (if (>= cost deductible)
      (let ((after-deductible (- cost deductible)))
        (let ((insured-share (/ (* after-deductible coinsurance) u100)))
          (if (<= insured-share coverage)
            (ok insured-share)
            (err ERR-INSUFFICIENT-COVERAGE)
          )
        )
      )
      (err ERR-DEDUCTIBLE-NOT-MET)
    )
  )
)
(define-private (check-exclusions (condition (string-ascii 50)) (policy (tuple (exclusions (list 10 (string-ascii 50))))))
  (if (is-some (index-of? (get exclusions policy) condition))
    (err ERR-CLAIM-EXCLUDED)
    (ok true)
  )
)
(define-private (check-waiting-period (event-timestamp uint) (policy-start uint) (waiting-period uint))
  (if (>= event-timestamp (+ policy-start waiting-period))
    (ok true)
    (err ERR-WAITING-PERIOD-NOT-MET)
  )
)
(define-public (set-processing-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set processing-fee new-fee)
    (ok true)
  )
)
(define-public (process-claim (patient principal) (event-id uint) (diagnosis-id uint) (policy-id uint))
  (let (
    (next-id (var-get next-claim-id))
    (diagnosis-details (contract-call? .DiagnosisVerifier get-diagnosis-details diagnosis-id))
    (event-details (contract-call? .MedicalEventRecorder get-event-details event-id))
    (policy-details (try! (validate-policy policy-id patient)))
  )
    (try! (validate-patient patient))
    (try! (validate-event event-id patient))
    (try! (validate-diagnosis diagnosis-id event-id))
    (asserts! (not (is-some (map-get? claims next-id))) (err ERR-CLAIM-ALREADY-PROCESSED))
    (try! (check-waiting-period (get timestamp (unwrap! event-details (err ERR-INVALID-EVENT))) (get start-date policy-details) (get waiting-period policy-details)))
    (try! (check-exclusions (get condition (unwrap! diagnosis-details (err ERR-INVALID-DIAGNOSIS))) policy-details))
    (let ((payout (try! (calculate-payout (unwrap! diagnosis-details (err ERR-INVALID-DIAGNOSIS)) policy-details))))
      (try! (contract-call? .TokenHandler transfer-tokens payout (as-contract tx-sender) patient))
      (map-set claims next-id
        {
          patient: patient,
          event-id: event-id,
          diagnosis-id: diagnosis-id,
          policy-id: policy-id,
          status: "approved",
          payout-amount: payout,
          timestamp: block-height,
          dispute-initiated: false
        }
      )
      (contract-call? .AuditLogger log-claim-outcome next-id "approved" "Payout successful")
      (var-set next-claim-id (+ next-id u1))
      (ok next-id)
    )
  )
)
(define-public (initiate-dispute (claim-id uint))
  (let ((claim (map-get? claims claim-id)))
    (match claim
      c
      (begin
        (asserts! (or (is-eq tx-sender (get patient c)) (contract-call? .PolicyManager is-insurer tx-sender (get policy-id c))) (err ERR-NOT-AUTHORIZED))
        (asserts! (not (get dispute-initiated c)) (err ERR-DISPUTE-ALREADY_INITIATED))
        (map-set claims claim-id (merge c { dispute-initiated: true, status: "disputed" }))
        (contract-call? .DisputeResolver initiate-dispute claim-id (get patient c) (get event-id c) (get diagnosis-id c) (get policy-id c))
        (contract-call? .AuditLogger log-claim-outcome claim-id "disputed" "Dispute initiated")
        (ok true)
      )
      (err ERR-INVALID-CLAIM-ID)
    )
  )
)
(define-public (adjust-claim (claim-id uint) (adjustment-amount uint) (reason (string-utf8 200)))
  (let ((claim (map-get? claims claim-id)))
    (match claim
      c
      (begin
        (asserts! (is-eq (get status c) "approved") (err ERR-INVALID-STATUS))
        (asserts! (contract-call? .PolicyManager is-insurer tx-sender (get policy-id c)) (err ERR-NOT-AUTHORIZED))
        (asserts! (> adjustment-amount u0) (err ERR-INVALID-AMOUNT))
        (map-set claim-adjustments claim-id
          {
            adjustment-amount: adjustment-amount,
            reason: reason,
            adjuster: tx-sender,
            timestamp: block-height
          }
        )
        (map-set claims claim-id (merge c { payout-amount: (- (get payout-amount c) adjustment-amount) }))
        (contract-call? .AuditLogger log-claim-outcome claim-id "adjusted" reason)
        (ok true)
      )
      (err ERR-INVALID-CLAIM-ID)
    )
  )
)
(define-public (get-next-claim-id)
  (ok (var-get next-claim-id))
)