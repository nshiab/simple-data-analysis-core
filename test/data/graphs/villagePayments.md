# Village payments

`villagePayments.csv` is a hand-authored, entirely fictional dataset for the SDA
network-analysis example. It describes payments between 12 businesses during
September 2025, in whole Canadian dollars. It is distributed under this
repository's MIT license.

Each row is the month's total payment from `payer` to `payee`. `amount` is the
payment value, not a distance or path cost. There are no duplicate payer/payee
pairs, missing values, or self-payments. These are selected business-to-business
payments, not complete accounts: customer sales, wages, taxes, and payments
outside the village are omitted. Receipts minus payments must not be interpreted
as profit.

The network deliberately contains two groups:

- Food businesses: Farm, Mill, Bakery, Cafe, Grocer, and Dairy.
- Trade and service businesses: Repair Shop, Carpenter, Sawmill, Builder, Inn,
  and Laundry.

The Farm's CAD 700 payment to the Repair Shop is the only connection between the
groups. Payments circulate in cycles, including Farm → Grocer → Farm and Repair
Shop → Carpenter → Sawmill → Repair Shop. Arrows follow the money; they do not
show the direction in which goods or services move.

The README example uses `degree("payer", "payee", { weight: "amount" })` to sum
each business's payments received (`incoming`) and sent (`outgoing`). `total` is
their sum, used to size the chart's nodes. Summing `total` across businesses
counts each payment twice. Positions in the chart are chosen for readability and
are not geographic locations or analytical results.

The complete analytical example and hand-checked totals are tested in
`test/unit/examples/villageEconomy.test.ts`.
