(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PATIENT u101)
(define-constant ERR-EVENT-NOT-FOUND u102)
(define-constant ERR-INVALID-TIMESTAMP u103)
(define-constant ERR-INVALID-SYMPTOMS u104)
(define-constant ERR-INVALID-LOCATION u105)
(define-constant ERR-INVALID-PROVIDER u106)
(define-constant ERR-PROVIDER-NOT-REGISTERED u107)
(define-constant ERR-INVALID-EVENT-TYPE u108)
(define-constant ERR-EVENT-ALREADY-RECORDED u109)
(define-constant ERR-INVALID-STATUS u110)
(define-constant ERR-INVALID-COST u111)
(define-constant ERR-INVALID-CURRENCY u112)
(define-constant ERR-INVALID-DIAGNOSIS-CODE u113)
(define-constant ERR-INVALID-PROCEDURE u114)
(define-constant ERR-INVALID-MEDICATION u115)
(define-constant ERR-MEDICATION-LIMIT u116)
(define-constant ERR-INVALID-ATTACHMENT u117)
(define-constant ERR-ATTACHMENT-LIMIT u118)
(define-constant ERR-INVALID-REFERRAL u119)
(define-constant ERR-REFERRAL-REQUIRED u120)
(define-constant ERR-INVALID-FOLLOW-UP u121)
(define-constant ERR-FOLLOW-UP-REQUIRED u122)
(define-constant ERR-INVALID-DURATION u123)
(define-constant ERR-INVALID-SEVERITY u124)
(define-constant ERR-INVALID-OUTCOME u125)
(define-constant ERR-INVALID-CLASSIFICATION u126)
(define-constant ERR-INVALID-ICD-CODE u127)
(define-constant ERR-INVALID-CPT-CODE u128)
(define-constant ERR-INVALID-NDC-CODE u129)
(define-constant ERR-INVALID-PLACE-OF-SERVICE u130)
(define-constant ERR-INVALID-BILLING-CODE u131)
(define-constant ERR-INVALID-REVENUE-CODE u132)
(define-constant ERR-INVALID-ADMIT-TYPE u133)
(define-constant ERR-INVALID-DISCHARGE-STATUS u134)
(define-constant ERR-INVALID-PATIENT-STATUS u135)
(define-constant ERR-INVALID-RELATIONSHIP u136)
(define-constant ERR-INVALID-PRIORITY u137)
(define-constant ERR-INVALID-URGENCY u138)
(define-constant ERR-INVALID-TRANSPORT u139)
(define-data-var next-event-id uint u0)
(define-data-var event-recording-fee uint u200)
(define-data-var admin principal tx-sender)
(define-map events uint {
  patient: principal,
  provider: principal,
  event-type: (string-ascii 30),
  timestamp: uint,
  symptoms: (string-utf8 500),
  location: (string-utf8 100),
  cost: uint,
  currency: (string-ascii 10),
  status: (string-ascii 20),
  severity: uint,
  outcome: (string-ascii 50),
  icd-codes: (list 10 (string-ascii 10)),
  cpt-codes: (list 10 (string-ascii 10)),
  medications: (list 20 (string-ascii 50)),
  attachments: (list 5 (string-utf8 200)),
  referral-required: bool,
  follow-up-required: bool,
  recorded-at: uint
})
(define-map events-by-patient principal (list 200 uint))
(define-map events-by-provider principal (list 500 uint))
(define-read-only (get-event-details (event-id uint)) (map-get? events event-id))
(define-read-only (get-events-by-patient (patient principal)) (map-get? events-by-patient patient))
(define-read-only (get-events-by-provider (provider principal)) (map-get? events-by-provider provider))
(define-read-only (is-event-recorded (event-id uint)) (is-some (map-get? events event-id)))
(define-private (validate-patient (patient principal)) (contract-call? .UserRegistry is-user-registered patient))
(define-private (validate-provider (provider principal)) (contract-call? .UserRegistry is-provider-registered provider))
(define-private (validate-timestamp (ts uint)) (if (<= ts block-height) (ok true) (err ERR-INVALID-TIMESTAMP)))
(define-private (validate-symptoms (symptoms (string-utf8 500))) (if (<= (len symptoms) u500) (ok true) (err ERR-INVALID-SYMPTOMS)))
(define-private (validate-location (loc (string-utf8 100))) (if (<= (len loc) u100) (ok true) (err ERR-INVALID-LOCATION)))
(define-private (validate-cost (cost uint)) (if (>= cost u0) (ok true) (err ERR-INVALID-COST)))
(define-private (validate-currency (cur (string-ascii 10))) (if (or (is-eq cur "STX") (is-eq cur "USD")) (ok true) (err ERR-INVALID-CURRENCY)))
(define-private (validate-event-type (etype (string-ascii 30))) (if (or (is-eq etype "consultation") (is-eq etype "emergency") (is-eq etype "surgery") (is-eq etype "lab") (is-eq etype "imaging")) (ok true) (err ERR-INVALID-EVENT-TYPE)))
(define-private (validate-severity (sev uint)) (if (and (>= sev u1) (<= sev u5)) (ok true) (err ERR-INVALID-SEVERITY)))
(define-private (validate-icd-codes (codes (list 10 (string-ascii 10)))) (if (<= (len codes) u10) (ok true) (err ERR-INVALID-ICD-CODE)))
(define-private (validate-cpt-codes (codes (list 10 (string-ascii 10)))) (if (<= (len codes) u10) (ok true) (err ERR-INVALID-CPT-CODE)))
(define-private (validate-medications (meds (list 20 (string-ascii 50)))) (if (<= (len meds) u20) (ok true) (err ERR-MEDICATION-LIMIT)))
(define-private (validate-attachments (atts (list 5 (string-utf8 200)))) (if (<= (len atts) u5) (ok true) (err ERR-ATTACHMENT-LIMIT)))
(define-public (set-event-recording-fee (new-fee uint)) (begin (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED)) (var-set event-recording-fee new-fee) (ok true)))
(define-public (record-medical-event 
  (patient principal)
  (event-type (string-ascii 30))
  (timestamp uint)
  (symptoms (string-utf8 500))
  (location (string-utf8 100))
  (cost uint)
  (currency (string-ascii 10))
  (severity uint)
  (icd-codes (list 10 (string-ascii 10)))
  (cpt-codes (list 10 (string-ascii 10)))
  (medications (list 20 (string-ascii 50)))
  (attachments (list 5 (string-utf8 200)))
  (referral-required bool)
  (follow-up-required bool)
)
  (let (
    (event-id (var-get next-event-id))
    (provider tx-sender)
  )
    (try! (validate-patient patient))
    (try! (validate-provider provider))
    (try! (validate-event-type event-type))
    (try! (validate-timestamp timestamp))
    (try! (validate-symptoms symptoms))
    (try! (validate-location location))
    (try! (validate-cost cost))
    (try! (validate-currency currency))
    (try! (validate-severity severity))
    (try! (validate-icd-codes icd-codes))
    (try! (validate-cpt-codes cpt-codes))
    (try! (validate-medications medications))
    (try! (validate-attachments attachments))
    (try! (stx-transfer? (var-get event-recording-fee) tx-sender (var-get admin)))
    (map-set events event-id {
      patient: patient,
      provider: provider,
      event-type: event-type,
      timestamp: timestamp,
      symptoms: symptoms,
      location: location,
      cost: cost,
      currency: currency,
      status: "recorded",
      severity: severity,
      outcome: "pending",
      icd-codes: icd-codes,
      cpt-codes: cpt-codes,
      medications: medications,
      attachments: attachments,
      referral-required: referral-required,
      follow-up-required: follow-up-required,
      recorded-at: block-height
    })
    (let ((patient-events (default-to (list) (map-get? events-by-patient patient))))
      (map-set events-by-patient patient (append patient-events event-id))
    )
    (let ((provider-events (default-to (list) (map-get? events-by-provider provider))))
      (map-set events-by-provider provider (append provider-events event-id))
    )
    (var-set next-event-id (+ event-id u1))
    (ok event-id)
  )
)
(define-public (update-event-status (event-id uint) (new-status (string-ascii 20))) 
  (let ((event (unwrap! (map-get? events event-id) (err ERR-EVENT-NOT-FOUND))))
    (asserts! (or (is-eq tx-sender (get provider event)) (is-eq tx-sender (get patient event))) (err ERR-NOT-AUTHORIZED))
    (asserts! (or (is-eq new-status "verified") (is-eq new-status "rejected") (is-eq new-status "pending")) (err ERR-INVALID-STATUS))
    (map-set events event-id (merge event { status: new-status }))
    (ok true)
  )
)
(define-public (update-event-outcome (event-id uint) (outcome (string-ascii 50))) 
  (let ((event (unwrap! (map-get? events event-id) (err ERR-EVENT-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get provider event)) (err ERR-NOT-AUTHORIZED))
    (map-set events event-id (merge event { outcome: outcome }))
    (ok true)
  )
)
(define-public (get-next-event-id) (ok (var-get next-event-id)))