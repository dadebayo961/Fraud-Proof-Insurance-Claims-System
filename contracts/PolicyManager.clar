(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-INSURER u101)
(define-constant ERR-INVALID-POLICY-ID u102)
(define-constant ERR-POLICY-NOT-ACTIVE u103)
(define-constant ERR-POLICY-ALREADY-EXISTS u104)
(define-constant ERR-INVALID-COVERAGE u105)
(define-constant ERR-INVALID-DEDUCTIBLE u106)
(define-constant ERR-INVALID-COINSURANCE u107)
(define-constant ERR-INVALID-WAITING-PERIOD u108)
(define-constant ERR-INVALID-START-DATE u109)
(define-constant ERR-INVALID-EXPIRY-DATE u110)
(define-constant ERR-INVALID-PREMIUM u111)
(define-constant ERR-PREMIUM-NOT-PAID u112)
(define-constant ERR-INVALID-EXCLUSION u113)
(define-constant ERR-EXCLUSION-LIMIT u114)
(define-constant ERR-INVALID-INSURED u115)
(define-constant ERR-POLICY-NOT-FOUND u116)
(define-constant ERR-UPDATE-NOT-ALLOWED u117)
(define-constant ERR-INVALID-STATUS u118)
(define-constant ERR-INSURER-ONLY u119)
(define-constant ERR-POLICY-EXPIRED u120)
(define-constant ERR-INVALID-RENEWAL u121)
(define-constant ERR-RENEWAL-TOO-EARLY u122)
(define-constant ERR-INVALID-BENEFIT u123)
(define-constant ERR-BENEFIT-LIMIT u124)
(define-constant ERR-INVALID-TERM u125)
(define-constant ERR-TERM-TOO-SHORT u126)
(define-constant ERR-TERM-TOO-LONG u127)
(define-constant ERR-INVALID-GRACE-PERIOD u128)
(define-constant ERR-INVALID-CANCELLATION u129)
(define-constant ERR-CANCELLATION-NOT-ALLOWED u130)
(define-constant ERR-INVALID-REFUND u131)
(define-constant ERR-REFUND-ALREADY-PROCESSED u132)
(define-constant ERR-INVALID-CLAIM-LIMIT u133)
(define-constant ERR-CLAIM-LIMIT-EXCEEDED u134)
(define-constant ERR-INVALID-LIFETIME-MAX u135)
(define-constant ERR-LIFETIME-MAX-EXCEEDED u136)
(define-constant ERR-INVALID-POLICY-TYPE u137)
(define-constant ERR-INVALID-CURRENCY u138)
(define-constant ERR-INVALID-LOCATION u139)
(define-data-var next-policy-id uint u0)
(define-data-var policy-creation-fee uint u500)
(define-data-var admin principal tx-sender)
(define-map policies uint {
  insurer: principal,
  insured: principal,
  policy-type: (string-ascii 30),
  coverage: uint,
  deductible: uint,
  coinsurance: uint,
  premium: uint,
  start-date: uint,
  expiry-date: uint,
  waiting-period: uint,
  grace-period: uint,
  claim-limit: uint,
  lifetime-max: uint,
  exclusions: (list 10 (string-ascii 50)),
  benefits: (list 5 (string-ascii 50)),
  currency: (string-ascii 10),
  location: (string-utf8 100),
  status: (string-ascii 20),
  created-at: uint,
  renewed-at: uint,
  cancelled-at: (optional uint)
})
(define-map policies-by-insured principal (list 100 uint))
(define-map claim-counts uint uint)
(define-map lifetime-spent uint uint)
(define-read-only (get-policy (policy-id uint)) (map-get? policies policy-id))
(define-read-only (get-policies-by-insured (insured principal)) (map-get? policies-by-insured insured))
(define-read-only (get-claim-count (policy-id uint)) (default-to u0 (map-get? claim-counts policy-id)))
(define-read-only (get-lifetime-spent (policy-id uint)) (default-to u0 (map-get? lifetime-spent policy-id)))
(define-read-only (is-policy-active (policy-id uint)) (match (map-get? policies policy-id) p (and (is-eq (get status p) "active") (>= (get expiry-date p) block-height)) false))
(define-read-only (is-insurer (caller principal) (policy-id uint)) (match (map-get? policies policy-id) p (is-eq (get insurer p) caller) false))
(define-private (validate-coverage (amount uint)) (if (> amount u0) (ok true) (err ERR-INVALID-COVERAGE)))
(define-private (validate-deductible (amount uint) (coverage uint)) (if (and (>= amount u0) (<= amount coverage)) (ok true) (err ERR-INVALID-DEDUCTIBLE)))
(define-private (validate-coinsurance (rate uint)) (if (and (> rate u0) (<= rate u100)) (ok true) (err ERR-INVALID-COINSURANCE)))
(define-private (validate-premium (amount uint)) (if (> amount u0) (ok true) (err ERR-INVALID-PREMIUM)))
(define-private (validate-dates (start uint) (expiry uint)) (if (and (>= start block-height) (> expiry start) (<= (- expiry start) u31536000)) (ok true) (err ERR-INVALID-EXPIRY-DATE)))
(define-private (validate-waiting-period (period uint)) (if (<= period u365) (ok true) (err ERR-INVALID-WAITING-PERIOD)))
(define-private (validate-exclusions (exclusions (list 10 (string-ascii 50)))) (if (<= (len exclusions) u10) (ok true) (err ERR-EXCLUSION-LIMIT)))
(define-private (validate-policy-type (ptype (string-ascii 30))) (if (or (is-eq ptype "health") (is-eq ptype "life") (is-eq ptype "accident")) (ok true) (err ERR-INVALID-POLICY-TYPE)))
(define-private (validate-currency (cur (string-ascii 10))) (if (or (is-eq cur "STX") (is-eq cur "USD")) (ok true) (err ERR-INVALID-CURRENCY)))
(define-public (set-policy-creation-fee (new-fee uint)) (begin (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED)) (var-set policy-creation-fee new-fee) (ok true)))
(define-public (create-policy 
  (insured principal) 
  (policy-type (string-ascii 30)) 
  (coverage uint) 
  (deductible uint) 
  (coinsurance uint) 
  (premium uint) 
  (term-days uint) 
  (waiting-period uint) 
  (exclusions (list 10 (string-ascii 50))) 
  (currency (string-ascii 10))
) 
  (let (
    (policy-id (var-get next-policy-id))
    (start-date block-height)
    (expiry-date (+ start-date (* term-days u86400)))
  )
    (try! (validate-policy-type policy-type))
    (try! (validate-coverage coverage))
    (try! (validate-deductible deductible coverage))
    (try! (validate-coinsurance coinsurance))
    (try! (validate-premium premium))
    (try! (validate-dates start-date expiry-date))
    (try! (validate-waiting-period waiting-period))
    (try! (validate-exclusions exclusions))
    (try! (validate-currency currency))
    (try! (contract-call? .UserRegistry is-user-registered insured))
    (try! (stx-transfer? (var-get policy-creation-fee) tx-sender (var-get admin)))
    (map-set policies policy-id {
      insurer: tx-sender,
      insured: insured,
      policy-type: policy-type,
      coverage: coverage,
      deductible: deductible,
      coinsurance: coinsurance,
      premium: premium,
      start-date: start-date,
      expiry-date: expiry-date,
      waiting-period: waiting-period,
      grace-period: u30,
      claim-limit: u10,
      lifetime-max: coverage,
      exclusions: exclusions,
      benefits: (list "hospitalization" "medication"),
      currency: currency,
      location: u"global",
      status: "active",
      created-at: block-height,
      renewed-at: u0,
      cancelled-at: none
    })
    (map-set policies-by-insured 
      insured 
      (append (default-to (list) (map-get? policies-by-insured insured)) policy-id))
    (var-set next-policy-id (+ policy-id u1))
    (ok policy-id)
  )
)
(define-public (renew-policy (policy-id uint) (new-term-days uint)) 
  (let ((policy (unwrap! (map-get? policies policy-id) (err ERR-POLICY-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get insurer policy)) (err ERR-INSURER-ONLY))
    (asserts! (is-eq (get status policy) "active") (err ERR-INVALID-STATUS))
    (asserts! (>= block-height (- (get expiry-date policy) u2592000)) (err ERR-RENEWAL-TOO-EARLY))
    (let ((new-expiry (+ (get expiry-date policy) (* new-term-days u86400))))
      (map-set policies policy-id (merge policy { expiry-date: new-expiry, renewed-at: block-height }))
      (ok true)
    )
  )
)
(define-public (cancel-policy (policy-id uint)) 
  (let ((policy (unwrap! (map-get? policies policy-id) (err ERR-POLICY-NOT-FOUND))))
    (asserts! (or (is-eq tx-sender (get insurer policy)) (is-eq tx-sender (get insured policy))) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status policy) "active") (err ERR-CANCELLATION-NOT-ALLOWED))
    (map-set policies policy-id (merge policy { status: "cancelled", cancelled-at: (some block-height) }))
    (ok true)
  )
)
(define-public (increment-claim-count (policy-id uint) (amount uint)) 
  (let ((policy (unwrap! (map-get? policies policy-id) (err ERR-POLICY-NOT-FOUND))))
    (asserts! (is-eq (get status policy) "active") (err ERR-POLICY-NOT-ACTIVE))
    (map-set claim-counts policy-id (+ (get-claim-count policy-id) u1))
    (map-set lifetime-spent policy-id (+ (get-lifetime-spent policy-id) amount))
    (ok true)
  )
)
(define-public (get-next-policy-id) (ok (var-get next-policy-id)))